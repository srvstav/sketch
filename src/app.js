// UI controller. Three views: home (drop material + library), run (live progress), deck (study).
import { sourceBlocks, SketchError } from './llm.js';
import { createModel, providerFor, modelFor, MODELS, PROVIDER_NAMES } from './model.js';
import { sketch, DEFAULTS } from './pipeline.js';
import { cleanSvg, blankOut, blankMark } from './svg.js';
import { pickBlanks, localGrade, recordResult } from './recall.js';
import { RECALL_SCHEMA, recallTask } from './prompts.js';
import { readFiles } from './files.js';
import * as store from './store.js';
import { svgUrl, rasterize, download, pngBlob } from './render.js';
import { deckToHtml, deckToJson, deckFromJson, slug } from './export.js';

const SDK_URL = 'https://esm.sh/@anthropic-ai/sdk@0.130.0';
const dom = { DOMParser };
const clean = (s) => cleanSvg(s, dom);
const $ = (sel) => document.querySelector(sel);
const app = $('#app');

const state = {
  sources: [],
  pasted: '',
  focus: '',
  deck: null,
  index: 0, // 0 = overview when present, else first idea
  mode: 'look',
  recall: null, // { key, hide, results }
  controller: null,
  tokens: { input: 0, output: 0, cached: 0 },
};

// ── tiny DOM helper: text is always set via textContent, never parsed as HTML ──
function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) if (kid != null && kid !== false) el.append(kid instanceof Node ? kid : String(kid));
  return el;
}
const mount = (...nodes) => { app.replaceChildren(...nodes); app.focus({ preventScroll: true }); };

function toast(msg, ms = 5000) {
  const t = h('div', { class: 'toast', text: msg });
  $('#toasts').append(t);
  setTimeout(() => t.remove(), ms);
}

// ── settings & key ──
const settings = () => ({ model: '', maxIdeas: DEFAULTS.maxIdeas, maxRounds: DEFAULTS.maxRounds, ...store.loadSettings() });
const clampInt = (v, lo, hi, d) => (Number.isFinite(+v) ? Math.min(hi, Math.max(lo, Math.round(+v))) : d);

function openSettings() {
  const dlg = $('#settings');
  const f = dlg.querySelector('form');
  const s = settings();
  f.key.value = store.loadKey();
  f.remember.checked = store.keyRemembered();
  const fillModels = () => {
    const key = f.key.value;
    const badge = dlg.querySelector('#provider');
    badge.hidden = !key.trim();
    badge.textContent = `Detected: ${PROVIDER_NAMES[providerFor(key)]}`;
    f.model.replaceChildren(...MODELS[providerFor(key)].map((m) => h('option', { value: m.id, text: m.label })));
    f.model.value = modelFor(key, s.model);
  };
  fillModels();
  f.key.oninput = fillModels;
  f.maxIdeas.value = s.maxIdeas;
  f.maxRounds.value = s.maxRounds;
  dlg.showModal();
  return new Promise((resolve) => {
    dlg.addEventListener('close', () => {
      if (dlg.returnValue === 'save') {
        store.saveKey(f.key.value.trim(), f.remember.checked);
        store.saveSettings({
          model: f.model.value,
          maxIdeas: clampInt(f.maxIdeas.value, 3, 8, DEFAULTS.maxIdeas),
          maxRounds: clampInt(f.maxRounds.value, 1, 4, DEFAULTS.maxRounds),
        });
      }
      resolve(dlg.returnValue === 'save');
    }, { once: true });
  });
}

let sdk;
async function getModel({ prompt = true } = {}) {
  let key = store.loadKey();
  if (!key) {
    if (!prompt) return null;
    if (!(await openSettings())) return null;
    key = store.loadKey();
    if (!key) return null;
  }
  if (providerFor(key) === 'claude') sdk ??= (await import(SDK_URL)).default;
  return createModel({ Anthropic: sdk, apiKey: key, model: settings().model, onUsage: countTokens, browser: true, onWait: (m) => toast(m, 4000) });
}

function countTokens(u) {
  state.tokens.input += (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
  state.tokens.cached += u.cache_read_input_tokens ?? 0;
  state.tokens.output += u.output_tokens ?? 0;
  const el = $('#tokens');
  el.hidden = false;
  const k = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
  el.textContent = `${k(state.tokens.input)} in · ${k(state.tokens.cached)} cached · ${k(state.tokens.output)} out`;
  el.title = 'Tokens used this session (billed to your key)';
}

// ── home ──
function renderHome() {
  const fileInput = h('input', { type: 'file', multiple: true, accept: '.pdf,.txt,.md,.markdown,.csv,.tex,image/png,image/jpeg,image/webp,image/gif', hidden: true, onchange: (e) => addFiles(e.target.files) });
  const chips = h('div', { class: 'sources' });
  const drawChips = () => chips.replaceChildren(...state.sources.map((s, i) =>
    h('span', { class: 'chip' }, s.name, h('button', { 'aria-label': `Remove ${s.name}`, text: '×', onclick: () => { state.sources.splice(i, 1); drawChips(); } }))));
  async function addFiles(list) {
    try {
      state.sources.push(...(await readFiles(list)));
      drawChips();
    } catch (err) { toast(err.message); }
  }

  const drop = h('div', {
    class: 'drop',
    ondragover: (e) => { e.preventDefault(); drop.classList.add('over'); },
    ondragleave: () => drop.classList.remove('over'),
    ondrop: (e) => { e.preventDefault(); drop.classList.remove('over'); addFiles(e.dataTransfer.files); },
  },
  h('h1', { class: 'big', text: 'Add material' }),
  h('p', { class: 'small', text: 'Drop PDFs, images or text files here. 5–50 pages works best.' }),
  h('button', { class: 'ghost', type: 'button', text: 'Choose files', onclick: () => fileInput.click() }),
  fileInput,
  chips,
  h('textarea', { placeholder: 'Or paste notes', 'aria-label': 'Paste notes', oninput: (e) => { state.pasted = e.target.value; } }),
  h('input', { type: 'text', placeholder: 'Exam topic (optional), e.g. BIO 101 midterm, chapters 4–5', 'aria-label': 'Exam focus', oninput: (e) => { state.focus = e.target.value; } }),
  h('div', { class: 'go' },
    h('button', { class: 'primary', text: 'Make pictures', onclick: start }),
    h('span', { class: 'muted', text: 'Takes 1–3 minutes. Longer on free Gemini.' })));
  drop.querySelector('textarea').value = state.pasted;
  drop.querySelector('input[type=text]').value = state.focus;
  drawChips();

  const decks = store.loadDecks();
  const importInput = h('input', { type: 'file', accept: '.json,application/json', hidden: true, onchange: (e) => importDeck(e.target.files[0]) });
  const library = h('aside', { class: 'library' },
    h('h2', { text: 'Your decks' }),
    decks.length
      ? h('ol', {}, decks.map((d) => h('li', {},
        h('button', { class: 'open', onclick: () => openDeck(d) },
          h('b', { text: d.title }),
          h('small', { text: `${d.ideas.length} pictures · ${avgScore(d)} · ${new Date(d.created).toLocaleDateString()}` })),
        h('button', { class: 'del', text: 'delete', 'aria-label': `Delete ${d.title}`, onclick: () => { if (confirm(`Delete “${d.title}”?`)) { store.deleteDeck(d.id); renderHome(); } } }))))
      : h('p', { class: 'empty', text: 'No decks yet.' }),
    h('p', {}, h('button', { class: 'linkish', text: 'Open example: cellular respiration', onclick: openExample })),
    h('p', {}, h('button', { class: 'linkish', text: 'Import a deck file', onclick: () => importInput.click() }), importInput),
    h('h2', { text: 'How it works' }),
    h('div', { class: 'how' },
      h('p', { text: 'Finds 3–8 core ideas in your material.' }),
      h('p', { text: 'Draws each idea as a picture whose shape matches it: a process as a machine, a choice as a fork.' }),
      h('p', { text: 'A second model answers 5 questions from the picture alone. Below 4/5, the picture is redrawn.' }),
      h('p', { text: 'Recall: labels are hidden and you fill them in. Missed labels are hidden first next time.' })));

  mount(h('section', { class: 'home' },
    drop,
    library));
}

const avgScore = (d) => {
  const s = d.ideas.filter((i) => i.svg && i.questions?.length);
  return s.length ? `${Math.round((s.reduce((n, i) => n + i.score, 0) / s.length) * 100)}% checked` : 'shared deck';
};

async function openExample() {
  try {
    const res = await fetch('examples/cellular-respiration/deck.sketch.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const deck = deckFromJson(await res.text(), clean);
    openDeck({ ...deck, id: 'example-cellular-respiration', example: true });
  } catch (err) { toast(`Couldn’t load the example: ${err.message}`); }
}

async function importDeck(file) {
  if (!file) return;
  try {
    const deck = deckFromJson(await file.text(), clean);
    if (!store.saveDeck(deck)) toast('Imported, but this browser wouldn’t save it.');
    openDeck(deck);
  } catch (err) { toast(`Couldn’t import: ${err.message}`); }
}

// ── run ──
async function start() {
  const sources = [...state.sources];
  if (state.pasted.trim()) sources.push({ kind: 'text', name: 'Pasted notes', data: state.pasted });
  if (!sources.length) return toast('Add some material first: drop a file or paste your notes.');
  let source;
  try { source = sourceBlocks(sources); } catch (err) { return toast(err.message); }
  let claude;
  try { claude = await getModel(); } catch (err) { return toast(err.message); }
  if (!claude) return;

  const s = settings();
  state.controller = new AbortController();
  const rows = new Map();
  const list = h('ol', { class: 'steps' });
  const title = h('h1', {}, h('span', { class: 'pulse' }), 'Reading…');
  const lede = h('p', { class: 'lede', text: `Finding the core ideas in ${sources.map((x) => x.name).join(', ')}.` });
  mount(h('section', { class: 'run' }, title, lede, list,
    h('p', {}, h('button', { class: 'ghost', text: 'Stop', onclick: () => state.controller.abort() }))));

  const row = (id, n, name, sub) => {
    const st = h('span', { class: 'st', text: 'waiting' });
    const thumb = h('div', { class: 'thumb' });
    const li = h('li', {}, h('span', { class: 'num', text: n }), h('div', { class: 't' }, h('b', { text: name }), h('small', { text: sub })), st, thumb);
    list.append(li);
    rows.set(id, { st, thumb });
  };
  const status = (id, text, cls = '') => { const r = rows.get(id); if (r) { r.st.textContent = text; r.st.className = `st ${cls}`; } };
  const thumb = (id, svg) => { const r = rows.get(id); if (r && svg) r.thumb.replaceChildren(h('img', { src: svgUrl(svg), alt: '' })); };

  const onEvent = (e) => {
    if (e.type === 'map') {
      title.replaceChildren(h('span', { class: 'pulse' }), e.map.title);
      lede.textContent = `${e.map.ideas.length} ideas. Drawing and checking each one.`;
      row('overview', '★', 'The big picture', 'overview map');
      e.map.ideas.forEach((i) => row(i.id, i.n, i.title, `as a ${i.shape} — ${i.why_shape}`));
    } else if (e.type === 'overview') {
      status('overview', e.status === 'done' ? 'drawn' : e.status === 'failed' ? 'couldn’t draw' : 'drawing…', e.status === 'done' ? 'ok' : e.status === 'failed' ? 'bad' : '');
      thumb('overview', e.result?.svg);
    } else if (e.type === 'idea') {
      const pct = (x) => `${Math.round(x * 100)}%`;
      const text = {
        drawing: 'drawing…',
        checking: `quizzing the picture (round ${e.round})…`,
        scored: `round ${e.round}: ${pct(e.score ?? 0)}`,
        redrawing: `redrawing (round ${e.round})…`,
        done: `${pct(e.score ?? 0)} on the picture-only quiz`,
        failed: `failed: ${e.error}`,
      }[e.status];
      status(e.id, text, e.status === 'done' ? ((e.score ?? 0) >= DEFAULTS.passAt ? 'ok' : '') : e.status === 'failed' ? 'bad' : '');
      if (e.status === 'done') thumb(e.id, e.result?.svg);
    }
  };

  try {
    const deck = await sketch(
      { claude, clean, rasterize: (svg) => rasterize(svg), source, focus: state.focus.trim(), sourceNames: sources.map((x) => x.name), onEvent, signal: state.controller.signal },
      { maxIdeas: s.maxIdeas, maxRounds: s.maxRounds },
    );
    if (!deck.ideas.some((i) => i.svg)) throw new SketchError('No pictures came out. Try again or try a different model.');
    if (!store.saveDeck(deck)) toast('This browser wouldn’t save the deck — use Export to keep it.');
    state.sources = []; state.pasted = ''; state.focus = '';
    openDeck(deck);
  } catch (err) {
    toast(err.kind === 'abort' ? 'Stopped.' : err.message, 8000);
    if (err.kind === 'auth') openSettings();
    renderHome();
  } finally {
    state.controller = null;
  }
}

// ── deck ──
function slides(deck) {
  const ideas = deck.ideas.map((i) => ({ ...i, key: i.id }));
  return deck.overview?.svg
    ? [{ key: 'overview', n: '★', title: 'The big picture', shape: 'overview', svg: deck.overview.svg, recall: deck.overview.recall ?? [], caption: deck.overview.caption, hook: deck.overview.hook, questions: [], rounds: [] }, ...ideas]
    : ideas;
}

function openDeck(deck) {
  state.deck = deck;
  state.index = 0;
  state.mode = 'look';
  state.recall = null;
  renderDeck();
}

function go(i) {
  const all = slides(state.deck);
  state.index = (i + all.length) % all.length;
  state.recall = null;
  renderDeck();
}

function renderDeck() {
  const deck = state.deck;
  const all = slides(deck);
  const cur = all[state.index];
  if (state.mode === 'quiz' && !cur.questions?.length) state.mode = 'look';

  const margin = h('nav', { class: 'margin', 'aria-label': 'Pictures in this deck' },
    h('p', { class: 'title', text: deck.title }),
    h('p', { class: 'subject', text: [deck.subject, deck.focus].filter(Boolean).join(' · ') }),
    h('h2', { text: 'Pictures' }),
    h('ol', { class: 'ideas' }, all.map((s, i) => h('li', {},
      h('button', { 'aria-current': i === state.index ? 'true' : 'false', onclick: () => go(i) },
        h('span', { class: 'n', text: s.n }),
        h('span', { class: 'nm' }, s.title, h('small', { text: s.error && !s.svg ? 'not drawn' : s.shape })),
        s.questions?.length && s.svg ? h('span', { class: `score ${s.score >= (deck.passAt ?? 0.8) ? 'pass' : 'low'}`, text: `${Math.round(s.score * s.questions.length)}/${s.questions.length}`, title: 'Picture-only quiz score' }) : '')))),
    tools('wide'));

  // Rendered twice: in the margin on wide screens, under the picture on phones.
  function tools(where) {
    return h('div', { class: `take ${where}` },
      h('h2', { text: 'Export' }),
      h('div', { class: 'tools' },
        h('button', { class: 'ghost', text: 'This picture as PNG', onclick: () => exportPng(cur) }),
        h('button', { class: 'ghost', text: 'This picture as SVG', onclick: () => cur.svg && download(`${slug(cur.title)}.svg`, cur.svg, 'image/svg+xml') }),
        h('button', { class: 'ghost', text: 'Whole deck as printable page', onclick: () => download(`${slug(deck.title)}.html`, deckToHtml(deck), 'text/html') }),
        h('button', { class: 'ghost', text: 'Deck file (to share or import)', onclick: () => download(`${slug(deck.title)}.sketch.json`, deckToJson(deck), 'application/json') })));
  }

  const tab = (id, label, k) => h('button', { role: 'tab', 'aria-selected': state.mode === id ? 'true' : 'false', onclick: () => { state.mode = id; state.recall = null; renderDeck(); } }, label, h('kbd', { text: k }));
  const body = !cur.svg
    ? h('div', { class: 'sheet empty', text: cur.error ? `This one didn’t draw: ${cur.error}` : 'No picture.' })
    : state.mode === 'recall' ? recallView(cur) : state.mode === 'quiz' ? quizView(cur) : lookView(cur);

  const stage = h('section', { class: 'stage' },
    h('div', { class: 'modes', role: 'tablist' }, tab('look', 'Look', '1'), tab('recall', 'Recall', '2'), cur.questions?.length ? tab('quiz', 'Questions', '3') : ''),
    h('h1', {}, h('span', { class: 'n', text: cur.n }), cur.title),
    body,
    tools('narrow'));

  mount(h('div', { class: 'deck' }, margin, stage));
}

function picture(svg, alt) {
  return h('div', { class: 'sheet' }, h('img', { src: svgUrl(svg), alt, width: 1200, height: 800 }));
}

function lookView(s) {
  const log = s.rounds?.length ? h('details', { class: 'check-log' },
    h('summary', { text: `Check rounds: ${s.rounds.length}` }),
    h('ol', {}, s.rounds.map((r) => h('li', {},
      h('b', { text: `${Math.round(r.score * 100)}%` }), r.round === s.bestRound ? ' — kept' : '',
      r.misses.length ? h('ul', {}, r.misses.map((m) => h('li', { class: 'miss', text: `${m.q} — ${m.note}` }))) : ' — all answered')))) : '';
  return h('div', {},
    picture(s.svg, `${s.title}, drawn as a ${s.shape}. ${s.caption ?? ''}`),
    h('div', { class: 'notes' },
      h('p', { class: 'caption', text: s.caption || s.core || '' }),
      h('div', { class: 'meta' },
        s.why_shape ? h('p', {}, h('b', { text: `Why a ${s.shape}` }), s.why_shape) : '',
        s.hook ? h('p', {}, h('b', { text: 'Memory hook' }), s.hook) : '',
        s.recall?.length ? h('p', {}, h('b', { text: 'Terms to know' }), s.recall.join(' · ')) : '')),
    log);
}

function recallView(s) {
  const deck = state.deck;
  if (!s.recall?.length) return h('div', { class: 'sheet empty', text: 'No labels to practise in this picture.' });
  const stats = deck.recall?.[s.key] ?? {};
  if (!state.recall || state.recall.key !== s.key) state.recall = { key: s.key, hide: pickBlanks(s.recall, stats), results: null };
  const { hide, results } = state.recall;

  const inputs = hide.map((idx, n) => h('input', { type: 'text', autocomplete: 'off', spellcheck: 'false', 'aria-label': `Blank ${n + 1}`, disabled: Boolean(results) }));
  const side = h('div', {});
  const form = h('form', { class: 'blanks', onsubmit: (e) => { e.preventDefault(); check(inputs.map((i) => i.value)); } },
    hide.map((idx, n) => [
      h('label', {}, h('span', { class: 'mark', text: blankMark(n) }), inputs[n]),
      results ? h('div', { class: `result ${results[n].correct ? 'right' : 'wrong'}` },
        results[n].correct ? `✓ ${s.recall[idx]}` : `✗ It’s “${s.recall[idx]}”`,
        results[n].feedback ? h('small', { text: results[n].feedback }) : '') : '',
    ]),
    h('div', { class: 'actions' },
      results
        ? h('button', { class: 'primary', type: 'button', text: 'Again', onclick: () => { state.recall = null; renderDeck(); } })
        : h('button', { class: 'primary', type: 'submit', text: 'Check' }),
      h('button', { class: 'ghost', type: 'button', text: results ? 'Next picture →' : 'Show me', onclick: () => (results ? go(state.index + 1) : check(inputs.map(() => ''))) })));
  if (results) {
    const right = results.filter((r) => r.correct).length;
    side.append(h('p', { class: 'tally', text: `${right}/${results.length}` }), h('p', { class: 'muted', text: right === results.length ? 'All correct.' : 'Missed labels are hidden first next time.' }));
    results.forEach((r, n) => { inputs[n].value = r.given; });
  } else {
    side.append(h('p', { class: 'muted', text: 'Fill in each blank from memory.' }));
  }
  side.append(form);

  const shown = results ? s.svg : blankOut(s.svg, hide, dom);
  queueMicrotask(() => inputs[0]?.focus());
  return h('div', { class: 'recall' }, picture(shown, `${s.title} with ${hide.length} labels hidden`), side);

  async function check(given) {
    const graded = given.map((g, n) => ({ given: g, expected: s.recall[hide[n]], local: localGrade(s.recall[hide[n]], g) }));
    const unsure = graded.map((g, n) => (g.local === 'unsure' ? n : -1)).filter((n) => n >= 0);
    let modelResults = [];
    if (unsure.length) {
      try {
        const claude = await getModel({ prompt: false });
        if (claude) {
          const out = await claude.call({ task: recallTask(unsure.map((n) => ({ idea: s.title, expected: graded[n].expected, given: graded[n].given }))), schema: RECALL_SCHEMA, effort: 'low', maxTokens: 4000 });
          modelResults = out.results ?? [];
        }
      } catch (err) { toast(`Couldn’t check the close ones: ${err.message}`); }
    }
    const res = graded.map((g, n) => {
      const m = modelResults[unsure.indexOf(n)];
      if (g.local === 'unsure') return { given: g.given, correct: Boolean(m?.correct), feedback: m?.feedback ?? 'Not an exact match. Add an API key to have close answers checked for meaning.' };
      return { given: g.given, correct: g.local === 'right', feedback: '' };
    });
    let next = deck.recall?.[s.key] ?? {};
    res.forEach((r, n) => { next = recordResult(next, s.recall[hide[n]], r.correct); });
    deck.recall = { ...(deck.recall ?? {}), [s.key]: next };
    store.saveDeck(deck);
    state.recall = { ...state.recall, results: res };
    renderDeck();
  }
}

function quizView(s) {
  return h('div', {},
    h('p', { class: 'muted', text: 'Answer from memory, then open the answer.' }),
    h('ol', { class: 'quiz' }, s.questions.map((q) => h('li', {},
      h('p', { class: 'q', text: q.q }),
      h('details', {}, h('summary', { text: 'Show answer' }), h('p', { text: q.answer }))))));
}

async function exportPng(s) {
  if (!s?.svg) return;
  try {
    const png = await rasterize(s.svg, 2);
    download(`${slug(s.title)}.png`, pngBlob(png.data));
  } catch (err) { toast(`Couldn’t make the PNG: ${err.message}`); }
}

// ── global wiring ──
$('#open-settings').addEventListener('click', openSettings);
document.querySelector('[data-go=home]').addEventListener('click', () => { if (!state.controller) { state.deck = null; renderHome(); } });
document.addEventListener('keydown', (e) => {
  if (!state.deck || state.controller || e.target.closest('input, textarea, select, dialog')) return;
  if (e.key === 'ArrowRight' || e.key === 'j') go(state.index + 1);
  else if (e.key === 'ArrowLeft' || e.key === 'k') go(state.index - 1);
  else if (['1', '2', '3'].includes(e.key)) { state.mode = ['look', 'recall', 'quiz'][+e.key - 1]; state.recall = null; renderDeck(); }
});
window.addEventListener('beforeunload', (e) => { if (state.controller) e.preventDefault(); });

renderHome();
