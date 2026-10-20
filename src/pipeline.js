// The sketch loop: map → draw → check (picture-only quiz) → redraw, per idea, in parallel.
// Pure orchestration: the model, the SVG cleaner and the rasterizer are all injected.
import {
  MAP_SCHEMA, DRAW_SCHEMA, JUDGE_SCHEMA, GRADE_SCHEMA, SHAPES,
  mapTask, drawTask, redrawTask, overviewTask, judgeTask, gradeTask,
} from './prompts.js';
import { SketchError } from './llm.js';

export const DEFAULTS = Object.freeze({
  maxIdeas: 6,
  questionsPerIdea: 5,
  passAt: 0.8, // share of picture-only questions the judge must get right
  maxRounds: 3, // drawings per idea, including the first
  concurrency: 3,
  overview: true,
});

/**
 * @param {object} deps
 * @param {{ call: Function, model?: string }} deps.claude
 * @param {(svg: string) => { svg: string, recall: string[] }} deps.clean
 * @param {(svg: string) => Promise<{ mediaType: string, data: string }>} deps.rasterize  SVG → base64 PNG
 * @param {(svg: string) => Promise<string[]>} [deps.layout]  rendered-layout problems (overlapping or clipped labels)
 * @param {object[]} deps.source  blocks from sourceBlocks()
 * @param {object} [opts]
 */
export async function sketch({ claude, clean, rasterize, layout = async () => [], source, focus = '', sourceNames = [], onEvent = () => {}, signal }, opts = {}) {
  const o = { ...DEFAULTS, ...(claude.limits ?? {}), ...opts };
  const emit = (e) => onEvent(e);

  emit({ type: 'stage', stage: 'map' });
  const map = normalizeMap(
    await claude.call({ source, task: mapTask({ focus, maxIdeas: o.maxIdeas, questionsPerIdea: o.questionsPerIdea }), schema: MAP_SCHEMA, effort: 'high', maxTokens: 16000, signal }),
    o,
  );
  emit({ type: 'map', map });

  const ctx = { claude, clean, rasterize, layout, source, signal, emit, o };
  const drawIdeas = () => mapLimit(map.ideas, o.concurrency, (idea) => drawIdea(idea, ctx));
  const drawOver = () => (o.overview ? drawOverview(map, ctx) : Promise.resolve(null));
  // One-at-a-time backends draw the overview last instead of alongside the ideas.
  const [ideas, overview] = o.concurrency > 1
    ? await Promise.all([drawIdeas(), drawOver()])
    : [await drawIdeas(), await drawOver()];

  const deck = {
    id: `d${Date.now().toString(36)}`,
    created: new Date().toISOString(),
    title: map.title,
    subject: map.subject,
    focus,
    sourceNames,
    model: claude.model,
    passAt: o.passAt,
    ideas,
    links: map.links,
    overview,
    recall: {},
  };
  emit({ type: 'done', deck });
  return deck;
}

export function normalizeMap(raw, o = DEFAULTS) {
  if (!raw || !Array.isArray(raw.ideas) || raw.ideas.length === 0) throw new SketchError('Couldn\'t find any ideas in this material.', { kind: 'input' });
  const seen = new Set();
  const ideas = raw.ideas.slice(0, o.maxIdeas).map((idea, n) => {
    let id = String(idea.id || `i${n + 1}`);
    if (seen.has(id)) id = `i${n + 1}`;
    seen.add(id);
    return {
      id,
      n: n + 1,
      title: String(idea.title ?? `Idea ${n + 1}`),
      core: String(idea.core ?? ''),
      shape: SHAPES.includes(idea.shape) ? idea.shape : 'other',
      why_shape: String(idea.why_shape ?? ''),
      key_terms: (idea.key_terms ?? []).map(String).filter(Boolean).slice(0, 8),
      questions: (idea.questions ?? []).filter((q) => q?.q && q?.answer).slice(0, o.questionsPerIdea),
    };
  });
  const links = (raw.links ?? []).filter((l) => seen.has(l.from) && seen.has(l.to));
  return { title: String(raw.title || 'Untitled topic'), subject: String(raw.subject || ''), ideas, links };
}

async function drawIdea(idea, { claude, clean, rasterize, layout, source, signal, emit, o }) {
  const rounds = [];
  let best = null;
  try {
    emit({ type: 'idea', id: idea.id, status: 'drawing', round: 1 });
    let pic = await drawClean(claude, clean, source, drawTask(idea), signal);

    for (let round = 1; round <= o.maxRounds; round++) {
      emit({ type: 'idea', id: idea.id, status: 'checking', round });
      const grade = await check(idea, pic, { claude, rasterize, source, signal });
      const score = grade.correct / Math.max(1, idea.questions.length);
      const issues = await layout(pic.svg).catch(() => []); // a broken layout check never blocks a picture
      rounds.push({ round, score, issues, misses: grade.results.map((r, i) => (r.correct ? null : { q: idea.questions[i]?.q, note: r.note })).filter(Boolean), fix: grade.fix });
      // Best = highest quiz score; ties go to the cleaner layout.
      if (!best || score > best.score || (score === best.score && issues.length < best.issues.length)) best = { ...pic, score, round, issues };
      emit({ type: 'idea', id: idea.id, status: 'scored', round, score, issues: issues.length });
      const passed = score >= o.passAt && issues.length === 0;
      if (passed || round === o.maxRounds || (idea.questions.length === 0 && issues.length === 0)) break;
      grade.issues = issues;

      emit({ type: 'idea', id: idea.id, status: 'redrawing', round: round + 1 });
      pic = await drawClean(claude, clean, source, redrawTask(idea, pic, grade, round + 1), signal);
    }
    const result = { ...idea, svg: best.svg, recall: best.recall, caption: best.caption, hook: best.hook, score: best.score, bestRound: best.round, rounds };
    emit({ type: 'idea', id: idea.id, status: 'done', score: best.score, result });
    return result;
  } catch (err) {
    if (err?.kind === 'abort' || err?.kind === 'auth') throw err; // stop everything, not just this idea
    emit({ type: 'idea', id: idea.id, status: 'failed', error: err.message });
    // Keep a partial result if any round produced a picture.
    return best
      ? { ...idea, svg: best.svg, recall: best.recall, caption: best.caption, hook: best.hook, score: best.score, bestRound: best.round, rounds, error: err.message }
      : { ...idea, svg: null, recall: [], rounds, score: 0, error: err.message };
  }
}

/** Draw, clean; one retry if the SVG was unusable. */
async function drawClean(claude, clean, source, task, signal) {
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    const out = await claude.call({
      source,
      task: attempt ? `${task}\n\nYour previous answer did not contain a valid SVG (${lastErr.message}). Return a complete, well-formed SVG.` : task,
      schema: DRAW_SCHEMA,
      effort: 'high',
      signal,
    });
    try {
      const { svg, recall } = clean(out.svg);
      return { svg, recall, caption: String(out.caption ?? ''), hook: String(out.hook ?? '') };
    } catch (err) {
      lastErr = err;
    }
  }
  throw new SketchError(`Drawing failed: ${lastErr.message}`);
}

/** Picture-only quiz: the judge sees just the PNG; the grader sees the source and the key. */
async function check(idea, pic, { claude, rasterize, source, signal }) {
  if (idea.questions.length === 0) return { correct: 0, results: [], fix: '' };
  const png = await rasterize(pic.svg);
  const judged = await claude.call({
    content: [{ type: 'image', source: { type: 'base64', media_type: png.mediaType, data: png.data } }],
    task: judgeTask(idea.questions),
    schema: JUDGE_SCHEMA,
    effort: 'low',
    maxTokens: 8000,
    signal,
  });
  const graded = await claude.call({ source, task: gradeTask(idea, judged.answers ?? []), schema: GRADE_SCHEMA, effort: 'medium', maxTokens: 8000, signal });
  const results = idea.questions.map((_, i) => graded.results?.[i] ?? { correct: false, note: 'not graded' });
  return { correct: results.filter((r) => r.correct).length, results, fix: String(graded.fix ?? ''), answers: judged.answers };
}

async function drawOverview(map, { claude, clean, source, signal, emit }) {
  emit({ type: 'overview', status: 'drawing' });
  try {
    const pic = await drawClean(claude, clean, source, overviewTask(map), signal);
    emit({ type: 'overview', status: 'done', result: pic });
    return pic;
  } catch (err) {
    if (err?.kind === 'abort' || err?.kind === 'auth') throw err;
    emit({ type: 'overview', status: 'failed', error: err.message });
    return null;
  }
}

/** Run fn over items with at most `limit` in flight; results keep input order. */
export async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}
