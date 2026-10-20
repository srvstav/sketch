import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGemini, toParts, retryDelay } from '../src/gemini.js';
import { providerFor, modelFor } from '../src/model.js';
import { sourceBlocks } from '../src/llm.js';
import { DRAW_SCHEMA } from '../src/prompts.js';

const ok = (obj, usage = { promptTokenCount: 100, cachedContentTokenCount: 60, candidatesTokenCount: 10, thoughtsTokenCount: 5 }) =>
  new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'thinking…', thought: true }, { text: JSON.stringify(obj) }] } }], usageMetadata: usage }), { status: 200 });
const err = (status, message, details) => new Response(JSON.stringify({ error: { code: status, message, details } }), { status });

function stub(...responses) {
  const seen = [];
  const fetch = async (url, init) => { seen.push({ url, init, body: JSON.parse(init.body) }); return responses.shift(); };
  return { fetch, seen };
}
const noSleep = async () => {};

test('sends one generateContent request with schema, thinking level and parts', async () => {
  const { fetch, seen } = stub(ok({ svg: '<svg/>', caption: 'c', hook: 'h' }));
  const usage = [];
  const g = createGemini({ apiKey: 'AQ.test', fetch, sleep: noSleep, onUsage: (u) => usage.push(u) });
  const out = await g.call({ source: sourceBlocks([{ kind: 'pdf', name: 'a.pdf', data: 'JVBE' }, { kind: 'text', name: 'n', data: 'notes' }]), task: 'draw', schema: DRAW_SCHEMA, effort: 'high' });
  assert.deepEqual(out, { svg: '<svg/>', caption: 'c', hook: 'h' });
  const { url, init, body } = seen[0];
  assert.match(url, /models\/gemini-3\.8-flash:generateContent$/);
  assert.equal(init.headers['x-goog-api-key'], 'AQ.test');
  assert.ok(!url.includes('AQ.test'), 'key never goes in the URL');
  assert.equal(body.generationConfig.responseMimeType, 'application/json');
  assert.deepEqual(body.generationConfig.responseJsonSchema, DRAW_SCHEMA);
  assert.deepEqual(body.generationConfig.thinkingConfig, { thinkingLevel: 'high' });
  assert.deepEqual(body.contents[0].parts[0], { inlineData: { mimeType: 'application/pdf', data: 'JVBE' } });
  assert.match(body.contents[0].parts[1].text, /<document title="n">\nnotes/);
  assert.equal(body.contents[0].parts.at(-1).text, 'draw');
  assert.deepEqual(usage[0], { input_tokens: 40, cache_read_input_tokens: 60, output_tokens: 15 });
});

test('waits and retries on per-minute 429 and 503, using RetryInfo', async () => {
  const waits = [];
  const { fetch, seen } = stub(
    err(429, 'Quota exceeded for metric generate_requests_per_minute', [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '7s' }]),
    err(503, 'The model is overloaded.'),
    ok({ answers: ['x'] }),
  );
  const g = createGemini({ apiKey: 'AQ.k', fetch, sleep: async (ms) => waits.push(ms) });
  assert.deepEqual(await g.call({ task: 't', schema: {} }), { answers: ['x'] });
  assert.equal(seen.length, 3);
  assert.equal(waits[0], 8000);
});

test('daily quota fails fast with a clear message', async () => {
  const { fetch } = stub(err(429, 'Quota exceeded for metric: generate_content_free_tier_requests, limit: 250, GenerateRequestsPerDayPerProjectPerModel-FreeTier'));
  const g = createGemini({ apiKey: 'AQ.k', fetch, sleep: noSleep });
  await assert.rejects(g.call({ task: 't', schema: {} }), /daily limit/);
});

test('drops an unsupported thinking level and retries', async () => {
  const { fetch, seen } = stub(err(400, 'thinking level medium is not supported for this model'), ok({ a: 1 }));
  const g = createGemini({ apiKey: 'AQ.k', fetch, sleep: noSleep });
  assert.deepEqual(await g.call({ task: 't', schema: {}, effort: 'medium' }), { a: 1 });
  assert.equal(seen[1].body.generationConfig.thinkingConfig, undefined);
});

test('maps blocks, truncation, bad keys and bad JSON to plain errors', async () => {
  const cases = [
    [new Response(JSON.stringify({ candidates: [{ finishReason: 'SAFETY', content: { parts: [] } }] })), /declined/],
    [new Response(JSON.stringify({ promptFeedback: { blockReason: 'OTHER' } })), /blocked/],
    [new Response(JSON.stringify({ candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: '{' }] } }] })), /cut off/],
    [err(400, 'API key not valid. Please pass a valid API key.'), /rejected the API key/],
    [err(404, 'models/x is not found'), /isn’t available/],
    [new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'nope' }] } }] })), /valid JSON/],
  ];
  for (const [res, re] of cases) {
    const g = createGemini({ apiKey: 'AQ.k', fetch: async () => res, sleep: noSleep });
    await assert.rejects(g.call({ task: 't', schema: {} }), re);
  }
});

test('provider and model selection follow the key', () => {
  assert.equal(providerFor('sk-ant-x'), 'claude');
  assert.equal(providerFor('AQ.x'), 'gemini');
  assert.equal(providerFor('AIzaSy'), 'gemini');
  assert.equal(modelFor('AQ.x', 'claude-opus-5-5'), 'gemini-3.8-flash');
  assert.equal(modelFor('sk-ant-x', 'gemini-3.8-flash'), 'claude-opus-5-5');
  assert.equal(modelFor('AQ.x', 'gemini-3.5-flash-lite'), 'gemini-3.5-flash-lite');
  assert.equal(retryDelay(null, 2), 8);
  assert.deepEqual(toParts([{ type: 'image', source: { media_type: 'image/png', data: 'AA' } }]), [{ inlineData: { mimeType: 'image/png', data: 'AA' } }]);
});

test('default sleep is wired (stop during a wait aborts cleanly)', async () => {
  const ctl = new AbortController();
  const g = createGemini({ apiKey: 'AQ.k', fetch: async () => { ctl.abort(); return err(503, 'overloaded'); } });
  await assert.rejects(g.call({ task: 't', schema: {}, signal: ctl.signal }), /Stopped/);
});
