import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DOMParser } from 'linkedom';
import { sketch, normalizeMap, mapLimit } from '../src/pipeline.js';
import { MAP_SCHEMA, DRAW_SCHEMA, JUDGE_SCHEMA, GRADE_SCHEMA } from '../src/prompts.js';
import { cleanSvg } from '../src/svg.js';
import { sourceBlocks, createClaude, SketchError } from '../src/llm.js';

const clean = (s) => cleanSvg(s, { DOMParser });
const rasterize = async () => ({ mediaType: 'image/png', data: 'AAAA' });
const svg = (label) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 800"><text data-recall="true">${label}</text><text data-recall="true">B</text></svg>`;
const MAP = {
  title: 'Cells', subject: 'Biology',
  ideas: [
    { id: 'i1', title: 'Respiration', core: 'c', shape: 'machine', why_shape: 'w', key_terms: ['ATP'], questions: [{ q: 'q1', answer: 'a' }, { q: 'q2', answer: 'a' }] },
    { id: 'i2', title: 'Division', core: 'c', shape: 'cycle', why_shape: 'w', key_terms: ['M'], questions: [{ q: 'q1', answer: 'a' }, { q: 'q2', answer: 'a' }] },
  ],
  links: [{ from: 'i1', to: 'i2', label: 'powers' }, { from: 'i1', to: 'nope', label: 'x' }],
};

/** Fake model: grades fail on the first check of i1, then pass. Records every call. */
function fakeClaude({ failFirst = true, badSvgOnce = false } = {}) {
  const calls = [];
  let gradeCalls = 0;
  let badLeft = badSvgOnce ? 1 : 0;
  return {
    calls, model: 'fake',
    async call(req) {
      calls.push(req);
      if (req.schema === MAP_SCHEMA) return structuredClone(MAP);
      if (req.schema === DRAW_SCHEMA) {
        if (badLeft-- > 0) return { svg: 'oops', caption: '', hook: '' };
        const round = req.task.match(/^Round (\d)/)?.[1] ?? '1';
        return { svg: svg(`R${round}`), caption: 'cap', hook: 'hook' };
      }
      if (req.schema === JUDGE_SCHEMA) return { answers: ['x', 'y'] };
      if (req.schema === GRADE_SCHEMA) {
        gradeCalls++;
        const ok = !(failFirst && req.task.includes('"Respiration"') && !req.task.includes('passed-before') && gradeCalls <= 2);
        return { results: [{ correct: true, note: '' }, { correct: ok, note: ok ? '' : 'missing arrow' }], fix: 'add arrow' };
      }
      throw new Error('unexpected schema');
    },
  };
}

test('runs map → draw → check → redraw and keeps the best round', async () => {
  const claude = fakeClaude();
  const events = [];
  const deck = await sketch({ claude, clean, rasterize, source: sourceBlocks([{ kind: 'text', name: 'n', data: 'cells' }]), onEvent: (e) => events.push(e) });
  assert.equal(deck.ideas.length, 2);
  assert.ok(deck.overview?.svg);
  assert.deepEqual(deck.links, [{ from: 'i1', to: 'i2', label: 'powers' }], 'drops links to unknown ideas');
  for (const idea of deck.ideas) {
    assert.ok(idea.svg.includes('<svg'));
    assert.equal(idea.score, 1);
    assert.deepEqual(idea.recall.length, 2);
  }
  const resp = deck.ideas.find((i) => i.id === 'i1');
  assert.ok(resp.rounds.length >= 2, 'redrew after a failed check');
  assert.equal(resp.rounds[0].misses[0].note, 'missing arrow');
  assert.ok(events.some((e) => e.status === 'redrawing'));
  assert.equal(events.at(-1).type, 'done');
});

test('label clashes force a redraw even when the quiz passes', async () => {
  const claude = fakeClaude({ failFirst: false });
  let checks = 0;
  const layout = async () => (checks++ === 0 ? ['"A" overlaps "B"'] : []);
  const deck = await sketch({ claude, clean, rasterize, layout, source: sourceBlocks([{ kind: 'text', name: 'n', data: 'x' }]) }, { overview: false, concurrency: 1 });
  const first = deck.ideas[0];
  assert.equal(first.rounds.length, 2);
  assert.deepEqual(first.rounds[0].issues, ['"A" overlaps "B"']);
  assert.equal(first.bestRound, 2, 'clean round beats the clashing one at equal score');
  assert.ok(claude.calls.some((c) => c.schema === DRAW_SCHEMA && c.task.includes('- Layout: "A" overlaps "B"')));
});

test('the judge never sees the source material', async () => {
  const claude = fakeClaude();
  await sketch({ claude, clean, rasterize, source: sourceBlocks([{ kind: 'text', name: 'n', data: 'secret notes' }]) });
  const judges = claude.calls.filter((c) => c.schema === JUDGE_SCHEMA);
  assert.ok(judges.length > 0);
  for (const j of judges) {
    assert.equal(j.source, undefined);
    assert.equal(j.content[0].type, 'image');
    assert.ok(!JSON.stringify(j).includes('secret notes'));
  }
  for (const c of claude.calls.filter((c) => c.schema !== JUDGE_SCHEMA)) assert.ok(JSON.stringify(c.source).includes('secret notes'));
});

test('stops after maxRounds even if the picture never passes', async () => {
  const claude = fakeClaude();
  claude.call = ((orig) => async (req) => (req.schema === GRADE_SCHEMA ? { results: [{ correct: false, note: 'n' }, { correct: false, note: 'n' }], fix: 'f' } : orig(req)))(claude.call);
  const deck = await sketch({ claude, clean, rasterize, source: sourceBlocks([{ kind: 'text', name: 'n', data: 'x' }]) }, { maxRounds: 2, overview: false });
  for (const idea of deck.ideas) {
    assert.equal(idea.rounds.length, 2);
    assert.equal(idea.score, 0);
  }
  assert.equal(deck.overview, null);
});

test('retries once when the drawing is not valid SVG', async () => {
  const claude = fakeClaude({ failFirst: false, badSvgOnce: true });
  const deck = await sketch({ claude, clean, rasterize, source: sourceBlocks([{ kind: 'text', name: 'n', data: 'x' }]) }, { overview: false, concurrency: 1 });
  assert.ok(deck.ideas.every((i) => i.svg && !i.error));
  assert.ok(claude.calls.some((c) => c.schema === DRAW_SCHEMA && c.task.includes('did not contain a valid SVG')));
});

test('one failing idea does not sink the deck; auth errors do', async () => {
  const claude = fakeClaude({ failFirst: false });
  const orig = claude.call;
  claude.call = async (req) => {
    if (req.schema === DRAW_SCHEMA && req.task.includes('Idea: Division')) throw new SketchError('boom');
    return orig(req);
  };
  const deck = await sketch({ claude, clean, rasterize, source: sourceBlocks([{ kind: 'text', name: 'n', data: 'x' }]) }, { overview: false });
  assert.equal(deck.ideas.find((i) => i.id === 'i2').error, 'boom');
  assert.ok(deck.ideas.find((i) => i.id === 'i1').svg);

  claude.call = async (req) => {
    if (req.schema === DRAW_SCHEMA) throw new SketchError('bad key', { kind: 'auth' });
    return orig(req);
  };
  await assert.rejects(sketch({ claude, clean, rasterize, source: sourceBlocks([{ kind: 'text', name: 'n', data: 'x' }]) }), /bad key/);
});

test('normalizeMap clamps ideas, fixes shapes and duplicate ids', () => {
  const m = normalizeMap({ title: '', ideas: Array.from({ length: 9 }, () => ({ id: 'x', title: 't', shape: 'blob', key_terms: [], questions: [{ q: 'a', answer: 'b' }, { q: '' }] })), links: [] }, { maxIdeas: 4, questionsPerIdea: 5 });
  assert.equal(m.ideas.length, 4);
  assert.equal(m.title, 'Untitled topic');
  assert.equal(m.ideas[0].shape, 'other');
  assert.equal(new Set(m.ideas.map((i) => i.id)).size, 4);
  assert.equal(m.ideas[0].questions.length, 1);
  assert.throws(() => normalizeMap({ ideas: [] }), /any ideas/);
});

test('mapLimit keeps order and respects the limit', async () => {
  let live = 0, peak = 0;
  const out = await mapLimit([1, 2, 3, 4, 5], 2, async (x) => {
    live++; peak = Math.max(peak, live);
    await new Promise((r) => setTimeout(r, 5));
    live--;
    return x * 2;
  });
  assert.deepEqual(out, [2, 4, 6, 8, 10]);
  assert.equal(peak, 2);
});

test('sourceBlocks builds cached document blocks and validates input', () => {
  const blocks = sourceBlocks([{ kind: 'pdf', name: 'a.pdf', data: 'JVBE' }, { kind: 'text', name: 'n', data: 'hi' }]);
  assert.equal(blocks[0].source.media_type, 'application/pdf');
  assert.equal(blocks[0].cache_control, undefined);
  assert.deepEqual(blocks[1].cache_control, { type: 'ephemeral' });
  assert.throws(() => sourceBlocks([]), /material/);
  assert.throws(() => sourceBlocks([{ kind: 'text', name: 'e', data: '  ' }]), /empty/);
});

test('createClaude rejects keys that are obviously wrong', () => {
  assert.throws(() => createClaude({ Anthropic: class {}, apiKey: 'nope' }), /sk-ant-/);
});
