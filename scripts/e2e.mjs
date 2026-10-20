// Browser end-to-end check with a stubbed Claude API. Needs network for esm.sh + fonts.
// Usage: node scripts/e2e.mjs [outDir]   (serves the repo on a random port)
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = process.argv[2] ?? '.';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };
const server = createServer(async (req, res) => {
  let path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  if (path.endsWith('/')) path += 'index.html';
  try {
    const body = await readFile(join(root, path));
    res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' }).end(body);
  } catch { res.writeHead(404).end(); }
}).listen(0);
const base = `http://localhost:${server.address().port}/`;

const svg = (t) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 800"><rect width="1200" height="800" fill="#FBF7EE"/><circle cx="600" cy="400" r="200" fill="#2B6CB0" fill-opacity="0.2" stroke="#1B1A17" stroke-width="6"/><text x="600" y="380" font-size="40" text-anchor="middle" data-recall="true">${t}</text><text x="600" y="460" font-size="28" text-anchor="middle" data-recall="true">Second label</text><script>alert(1)</script></svg>`;
let grades = 0;
// Accepts both request shapes: Claude (output_config + messages) and Gemini (generationConfig + contents).
const schemaOf = (b) => b.output_config?.format.schema ?? b.generationConfig?.responseJsonSchema ?? b.text.format.schema;
const partsOf = (b) => b.messages?.[0].content
  ?? b.contents?.[0].parts.map((p) => (p.inlineData ? { type: 'image' } : { type: 'text', text: p.text }))
  ?? b.input[0].content.map((p) => (p.type === 'input_image' ? { type: 'image' } : { type: 'text', text: p.text }));
function answer(body) {
  const props = Object.keys(schemaOf(body).properties);
  if (props.includes('ideas')) return { title: 'Photosynthesis', subject: 'Biology', ideas: [
    { id: 'i1', title: 'Light reactions', core: 'c', shape: 'machine', why_shape: 'a factory line', key_terms: ['Thylakoid'], questions: [{ q: 'Where?', answer: 'Thylakoid' }, { q: 'Makes?', answer: 'ATP' }] },
    { id: 'i2', title: 'Calvin cycle', core: 'c', shape: 'cycle', why_shape: 'it loops', key_terms: ['Stroma'], questions: [{ q: 'Where?', answer: 'Stroma' }, { q: 'Fixes?', answer: 'CO2' }] },
  ], links: [{ from: 'i1', to: 'i2', label: 'ATP + NADPH' }] };
  if (props.includes('svg')) return { svg: svg(/Idea: (.*)/.exec(partsOf(body).at(-1).text)?.[1] ?? 'Overview'), caption: 'A caption.', hook: 'A hook.' };
  if (props.includes('answers')) {
    if (partsOf(body)[0].type !== 'image') throw new Error('judge did not get an image');
    return { answers: ['a', 'b'] };
  }
  if (props.includes('fix')) { grades++; return { results: [{ correct: true, note: '' }, { correct: grades > 1, note: grades > 1 ? '' : 'missing' }], fix: 'add it' }; }
  return { results: partsOf(body).at(-1).text.split('Hidden label').slice(1).map(() => ({ correct: true, feedback: 'close enough' })) };
}
const sse = (obj) => {
  const ev = (type, data) => `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`;
  return [
    ev('message_start', { message: { id: 'm', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [], stop_reason: null, usage: { input_tokens: 1200, cache_read_input_tokens: 900, output_tokens: 0 } } }),
    ev('content_block_start', { index: 0, content_block: { type: 'text', text: '' } }),
    ev('content_block_delta', { index: 0, delta: { type: 'text_delta', text: JSON.stringify(obj) } }),
    ev('content_block_stop', { index: 0 }),
    ev('message_delta', { delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 400 } }),
    ev('message_stop', {}),
  ].join('');
};

const browser = await chromium.launch();
const problems = [];
const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
const page = await ctx.newPage();
page.on('console', (m) => m.type() === 'error' && problems.push(`console: ${m.text()}`));
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
page.on('dialog', (d) => { problems.push(`dialog: ${d.message()}`); d.dismiss(); });
const seen = [];
await page.route('https://api.anthropic.com/**', async (route) => {
  const req = route.request();
  if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST' } });
  const body = req.postDataJSON();
  seen.push({ headers: req.headers(), body });
  await new Promise((r) => setTimeout(r, 150));
  route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream', 'access-control-allow-origin': '*' }, body: sse(answer(body)) });
});

await page.exposeFunction('__toast', (t) => console.log(`   toast: ${t}`));
await page.addInitScript(() => new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach((n) => n.classList?.contains('toast') && window.__toast(n.textContent)))).observe(document, { childList: true, subtree: true }));
await page.reload();
const step = async (name, fn) => { await fn(); await page.screenshot({ path: join(out, `${name}.png`) }); console.log('✓', name); };

await step('1-home', () => page.goto(base, { waitUntil: 'networkidle' }));
await step('2-example', async () => { await page.getByText("Open example").click(); await page.getByRole('heading', { name: /The big picture/ }).waitFor(); });
await step('3-example-idea', async () => { await page.keyboard.press('ArrowRight'); await page.getByRole('heading', { name: /Glycolysis/ }).waitFor(); });
await step('4-recall', async () => { await page.keyboard.press('2'); await page.getByRole('button', { name: 'Check' }).waitFor(); });
await step('5-recall-checked', async () => {
  const inputs = page.locator('.blanks input');
  await inputs.first().waitFor();
  const n = await inputs.count();
  if (n < 2) problems.push(`example recall shows ${n} blanks`);
  for (let i = 0; i < n; i++) await inputs.nth(i).fill(i === 0 ? 'cytoplasm' : 'no idea');
  await page.getByRole('button', { name: 'Check' }).click();
  await page.locator('.tally').waitFor();
});
await step('6-quiz', async () => { await page.getByRole('tab', { name: /Questions/ }).click(); await page.locator('.quiz').waitFor(); });

// full run with a stubbed API
await page.locator('[data-go=home]').click();
await page.getByRole('button', { name: 'Key & settings' }).click();
await page.locator('input[name=key]').fill('sk-ant-e2e-test');
await page.getByRole('button', { name: 'Save' }).click();
await page.getByLabel('Paste notes').fill('Photosynthesis turns light into sugar. Light reactions in the thylakoid make ATP; the Calvin cycle in the stroma fixes CO2.');
await page.getByLabel('Exam focus').fill('Bio midterm');
await step('7-running', async () => { await page.getByRole('button', { name: "Make pictures" }).click(); await page.getByText('Light reactions').first().waitFor(); });
await step('8-deck', async () => { await page.locator('.deck').waitFor({ timeout: 30000 }); });
await step('9-deck-idea', async () => { await page.keyboard.press('ArrowRight'); await page.locator('details.check-log').waitFor(); await page.locator('details.check-log summary').click(); });
await step('10-recall-model-graded', async () => {
  await page.keyboard.press('2');
  const inputs = page.locator('.blanks input');
  await inputs.first().waitFor();
  const n = await inputs.count();
  for (let i = 0; i < n; i++) await inputs.nth(i).fill('something rather different');
  await page.getByRole('button', { name: 'Check' }).click();
  await page.locator('.tally').waitFor();
});

// layout checker on a picture with known problems
const issues = await page.evaluate(async () => {
  const { findLayoutIssues } = await import('./src/render.js');
  return findLayoutIssues('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 800" width="1200" height="800"><text x="100" y="100" font-size="28">Hidden</text><rect x="90" y="70" width="220" height="40" fill="#000"/><text x="400" y="300" font-size="28">Mitochondria</text><text x="420" y="305" font-size="28">Cytoplasm</text><rect x="600" y="600" width="200" height="60" fill="#FD3"/><text x="620" y="640" font-size="24">Fine</text></svg>');
});
if (issues.length !== 2) problems.push(`layout check found ${JSON.stringify(issues)}`);

// same flow on a Gemini key
const gemini = [];
await page.route('https://generativelanguage.googleapis.com/**', async (route) => {
  const body = route.request().postDataJSON();
  gemini.push({ headers: route.request().headers(), body });
  route.fulfill({ status: 200, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' }, body: JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(answer(body)) }] } }], usageMetadata: { promptTokenCount: 500, candidatesTokenCount: 100 } }) });
});
grades = 0;
await page.locator('[data-go=home]').click();
await page.getByRole('button', { name: 'Key & settings' }).click();
await page.locator('input[name=key]').fill('AQ.e2e-gemini');
if (!(await page.locator('select[name=model]').inputValue()).startsWith('gemini')) problems.push('model list did not switch to Gemini');
await page.getByRole('button', { name: 'Save' }).click();
await page.getByLabel('Paste notes').fill('Gemini run: photosynthesis notes.');
await step('11-gemini-deck', async () => { await page.getByRole('button', { name: 'Make pictures' }).click(); await page.locator('.deck').waitFor({ timeout: 30000 }).catch(async () => problems.push(`gemini run did not finish; toasts: ${await page.locator('.toast').allTextContents()} | page: ${(await page.locator('main').innerText()).slice(0, 300)}`)); });
if (!gemini.length) problems.push('no Gemini calls');
if (gemini.some((g) => g.headers['x-goog-api-key'] !== 'AQ.e2e-gemini')) problems.push('Gemini key header missing');
console.log(`gemini calls: ${gemini.length}`);

// same flow on an OpenAI key
const openai = [];
await page.route('https://api.openai.com/**', async (route) => {
  if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } });
  const body = route.request().postDataJSON();
  openai.push({ headers: route.request().headers(), body });
  route.fulfill({ status: 200, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' }, body: JSON.stringify({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(answer(body)) }] }], usage: { input_tokens: 300, output_tokens: 50 } }) });
});
grades = 0;
await page.locator('[data-go=home]').click();
await page.getByRole('button', { name: 'Key & settings' }).click();
await page.locator('input[name=key]').fill('sk-proj-e2e');
if ((await page.locator('#provider').textContent()) !== 'Detected: OpenAI') problems.push('provider badge wrong');
await page.getByRole('button', { name: 'Save' }).click();
await page.getByLabel('Paste notes').fill('OpenAI run: photosynthesis notes.');
await step('12-openai-deck', async () => { await page.getByRole('button', { name: 'Make pictures' }).click(); await page.locator('.deck').waitFor({ timeout: 30000 }).catch(async (e) => { problems.push(`openai run did not finish; toasts: ${await page.locator('.toast').allTextContents()}`); }); });
if (!openai.length || openai.some((o) => o.headers.authorization !== 'Bearer sk-proj-e2e')) problems.push('OpenAI calls missing or wrong auth');
console.log(`openai calls: ${openai.length}`);

// mobile
const m = await browser.newPage({ viewport: { width: 390, height: 844 } });
m.on('pageerror', (e) => problems.push(`mobile pageerror: ${e.message}`));
await m.goto(base, { waitUntil: 'networkidle' });
await m.screenshot({ path: join(out, '13-mobile-home.png'), fullPage: true });
await m.getByText("Open example").click();
await m.getByRole('heading', { name: /The big picture/ }).waitFor();
await m.screenshot({ path: join(out, '14-mobile-deck.png'), fullPage: true });
const overflow = await m.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
if (overflow) problems.push('mobile: horizontal scroll');

// assertions on what was sent
const judge = seen.filter((s) => 'answers' in schemaOf(s.body).properties);
if (!judge.length) problems.push('no judge calls');
if (judge.some((s) => JSON.stringify(s.body).includes('Photosynthesis turns light'))) problems.push('judge saw the source');
if (seen.some((s) => s.headers['anthropic-dangerous-direct-browser-access'] !== 'true')) problems.push('missing browser header');
if (seen.some((s) => s.headers['x-api-key'] !== 'sk-ant-e2e-test')) problems.push('wrong key header');
const drawn = await page.evaluate(() => JSON.parse(localStorage.getItem('sketch:decks:v1'))?.[0]);
if (!drawn || drawn.ideas.some((i) => i.svg.includes('script'))) problems.push('saved deck missing or unsanitized');
console.log(`api calls: ${seen.length} (judge ${judge.length})`);

await browser.close();
server.close();
if (problems.length) { console.error('PROBLEMS:\n' + problems.join('\n')); process.exit(1); }
console.log('e2e ok');
