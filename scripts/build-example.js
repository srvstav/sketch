// Assemble examples/<name>/deck.sketch.json from its hand-made SVGs and meta.json. Usage: node scripts/build-example.js cellular-respiration
import { readFileSync, writeFileSync } from 'node:fs';
import { DOMParser } from 'linkedom';
import { cleanSvg } from '../src/svg.js';
import { deckToJson } from '../src/export.js';

const name = process.argv[2];
if (!name || !/^[\w-]+$/.test(name)) throw new Error('usage: node scripts/build-example.js <example-name>');
const dir = new URL(`../examples/${name}/`, import.meta.url);
const meta = JSON.parse(readFileSync(new URL('meta.json', dir), 'utf8'));
const pic = (file) => cleanSvg(readFileSync(new URL(file, dir), 'utf8'), { DOMParser });

const deck = {
  ...meta.deck,
  overview: meta.overview ? { ...pic(meta.overview.file), caption: meta.overview.caption, hook: '' } : null,
  ideas: meta.ideas.map(({ file, ...idea }, n) => ({ ...idea, n: n + 1, ...pic(file), score: 1, rounds: [] })),
  recall: {},
};
writeFileSync(new URL('deck.sketch.json', dir), deckToJson(deck));
console.log(`wrote ${deck.ideas.length} ideas, recall labels: ${deck.ideas.map((i) => i.recall.length).join(', ')}`);
