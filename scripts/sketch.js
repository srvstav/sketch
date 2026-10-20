// Run sketch from the terminal — the eval harness. Writes <out>/deck.sketch.json, one SVG per idea, and scores.json.
// Usage: GEMINI_API_KEY=… (or ANTHROPIC_API_KEY=sk-ant-…) node scripts/sketch.js <file…> [--out dir] [--focus "…"] [--model id] [--rounds n] [--ideas n]
import Anthropic from '@anthropic-ai/sdk';
import { chromium } from 'playwright';
import { DOMParser } from 'linkedom';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { sourceBlocks } from '../src/llm.js';
import { createModel, modelFor } from '../src/model.js';
import { sketch, DEFAULTS } from '../src/pipeline.js';
import { cleanSvg } from '../src/svg.js';
import { deckToJson, deckToHtml, slug } from '../src/export.js';

const { values: args, positionals: files } = parseArgs({
  allowPositionals: true,
  options: { out: { type: 'string' }, focus: { type: 'string', default: '' }, model: { type: 'string' }, rounds: { type: 'string' }, ideas: { type: 'string' } },
});
if (!files.length) { console.error('usage: node scripts/sketch.js <file…> [--out dir] [--focus "…"] [--model id] [--rounds n] [--ideas n]'); process.exit(2); }
const apiKey = process.env.ANTHROPIC_API_KEY || process.env.GEMINI_API_KEY;
if (!apiKey) { console.error('Set GEMINI_API_KEY or ANTHROPIC_API_KEY.'); process.exit(2); }
const model = modelFor(apiKey, args.model);

const IMAGE = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' };
const sources = await Promise.all(files.map(async (f) => {
  const ext = extname(f).toLowerCase();
  if (ext === '.pdf') return { kind: 'pdf', name: basename(f), data: (await readFile(f)).toString('base64') };
  if (IMAGE[ext]) return { kind: 'image', name: basename(f), mediaType: IMAGE[ext], data: (await readFile(f)).toString('base64') };
  return { kind: 'text', name: basename(f), data: await readFile(f, 'utf8') };
}));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
// Same rasterizer path as the browser app: SVG → <img> → PNG.
const rasterize = async (svg) => {
  await page.setContent(`<body style="margin:0;background:#FBF7EE"><img id="p" src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}" width="1200" height="800"></body>`);
  await page.locator('#p').evaluate((img) => img.decode());
  return { mediaType: 'image/png', data: (await page.screenshot({ clip: { x: 0, y: 0, width: 1200, height: 800 } })).toString('base64') };
};

const usage = { input: 0, cached: 0, written: 0, output: 0 };
const claude = createModel({
  Anthropic, apiKey, model, onWait: (m) => console.log(`        ${m}`),
  onUsage: (u) => { usage.input += u.input_tokens ?? 0; usage.cached += u.cache_read_input_tokens ?? 0; usage.written += u.cache_creation_input_tokens ?? 0; usage.output += u.output_tokens ?? 0; },
});

const t0 = Date.now();
const log = (e) => {
  const s = ((Date.now() - t0) / 1000).toFixed(0).padStart(4);
  if (e.type === 'map') console.log(`${s}s  map: "${e.map.title}" — ${e.map.ideas.map((i) => `${i.title} (${i.shape})`).join(', ')}`);
  else if (e.type === 'idea' && ['scored', 'done', 'failed'].includes(e.status)) console.log(`${s}s  ${e.id} ${e.status}${e.round ? ` r${e.round}` : ''}${e.score != null ? ` ${Math.round(e.score * 100)}%` : ''}${e.error ? ` ${e.error}` : ''}`);
  else if (e.type === 'overview' && e.status !== 'drawing') console.log(`${s}s  overview ${e.status}`);
};

try {
  const deck = await sketch(
    { claude, clean: (s) => cleanSvg(s, { DOMParser }), rasterize, source: sourceBlocks(sources), focus: args.focus, sourceNames: sources.map((s) => s.name), onEvent: log },
    { maxRounds: Number(args.rounds ?? DEFAULTS.maxRounds), maxIdeas: Number(args.ideas ?? DEFAULTS.maxIdeas) },
  );
  const out = args.out ?? join('runs', `${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}-${slug(deck.title)}`);
  await mkdir(out, { recursive: true });
  await writeFile(join(out, 'deck.sketch.json'), deckToJson(deck));
  await writeFile(join(out, 'deck.html'), deckToHtml(deck));
  for (const i of deck.ideas) if (i.svg) await writeFile(join(out, `${i.n}-${slug(i.title)}.svg`), i.svg);
  if (deck.overview?.svg) await writeFile(join(out, '0-overview.svg'), deck.overview.svg);
  const scores = {
    model, seconds: Math.round((Date.now() - t0) / 1000), usage,
    mean: deck.ideas.reduce((n, i) => n + i.score, 0) / deck.ideas.length,
    ideas: deck.ideas.map((i) => ({ id: i.id, title: i.title, shape: i.shape, score: i.score, rounds: i.rounds.map((r) => r.score), recallLabels: i.recall.length, error: i.error })),
  };
  await writeFile(join(out, 'scores.json'), JSON.stringify(scores, null, 2));
  console.log(`\nmean picture-only score ${Math.round(scores.mean * 100)}% · ${scores.seconds}s · tokens in ${usage.input} (+${usage.cached} cached, ${usage.written} cache-written) out ${usage.output}\n→ ${out}`);
} finally {
  await browser.close();
}
