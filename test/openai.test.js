import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createOpenAI, toInput } from '../src/openai.js';
import { providerFor, modelFor } from '../src/model.js';
import { sourceBlocks } from '../src/llm.js';
import { DRAW_SCHEMA } from '../src/prompts.js';

const reply = (obj, extra = {}) => new Response(JSON.stringify({
  status: 'completed',
  output: [{ type: 'reasoning', summary: [] }, { type: 'message', content: [{ type: 'output_text', text: JSON.stringify(obj), annotations: [] }] }],
  usage: { input_tokens: 100, input_tokens_details: { cached_tokens: 70 }, output_tokens: 20 },
  ...extra,
}), { status: 200 });
const err = (status, message, code, headers = {}) => new Response(JSON.stringify({ error: { message, code } }), { status, headers });

test('sends one Responses API request with strict schema, effort and input items', async () => {
  const seen = [];
  const usage = [];
  const o = createOpenAI({ apiKey: 'sk-proj-test', fetch: async (url, init) => (seen.push({ url, init, body: JSON.parse(init.body) }), reply({ svg: '<svg/>', caption: 'c', hook: 'h' })), onUsage: (u) => usage.push(u) });
  const out = await o.call({ source: sourceBlocks([{ kind: 'pdf', name: 'a.pdf', data: 'JVBE' }]), content: [{ type: 'image', source: { media_type: 'image/png', data: 'AA' } }], task: 'draw', schema: DRAW_SCHEMA, effort: 'high' });
  assert.deepEqual(out, { svg: '<svg/>', caption: 'c', hook: 'h' });
  const { url, init, body } = seen[0];
  assert.equal(url, 'https://api.openai.com/v1/responses');
  assert.equal(init.headers.authorization, 'Bearer sk-proj-test');
  assert.equal(body.model, 'gpt-6-astra');
  assert.deepEqual(body.text.format, { type: 'json_schema', name: 'sketch_output', strict: true, schema: DRAW_SCHEMA });
  assert.deepEqual(body.reasoning, { effort: 'high' });
  assert.deepEqual(body.input[0].content[0], { type: 'input_file', filename: 'a.pdf', file_data: 'data:application/pdf;base64,JVBE' });
  assert.deepEqual(body.input[0].content[1], { type: 'input_image', image_url: 'data:image/png;base64,AA' });
  assert.deepEqual(body.input[0].content.at(-1), { type: 'input_text', text: 'draw' });
  assert.deepEqual(usage[0], { input_tokens: 30, cache_read_input_tokens: 70, output_tokens: 20 });
});

test('retries rate limits, drops unsupported effort, fails fast on no credit', async () => {
  const queue = [err(429, 'Rate limit reached', 'rate_limit_exceeded', { 'retry-after': '3' }), err(400, "Unsupported value: 'reasoning.effort'"), reply({ a: 1 })];
  const bodies = [];
  const waits = [];
  const o = createOpenAI({ apiKey: 'sk-x', fetch: async (_, init) => (bodies.push(JSON.parse(init.body)), queue.shift()), sleep: async (ms) => waits.push(ms) });
  assert.deepEqual(await o.call({ task: 't', schema: {} }), { a: 1 });
  assert.equal(waits[0], 3000);
  assert.equal(bodies[2].reasoning, undefined);

  const broke = createOpenAI({ apiKey: 'sk-x', fetch: async () => err(429, 'You exceeded your current quota', 'insufficient_quota'), sleep: async () => {} });
  await assert.rejects(broke.call({ task: 't', schema: {} }), /no credit/);
});

test('maps refusals, truncation and bad keys', async () => {
  const cases = [
    [new Response(JSON.stringify({ status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'no' }] }] })), /declined/],
    [new Response(JSON.stringify({ status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' }, output: [] })), /cut off/],
    [err(401, 'Incorrect API key provided'), /rejected the API key/],
  ];
  for (const [res, re] of cases) {
    const o = createOpenAI({ apiKey: 'sk-x', fetch: async () => res, sleep: async () => {} });
    await assert.rejects(o.call({ task: 't', schema: {} }), re);
  }
  assert.throws(() => createOpenAI({ apiKey: 'AQ.x' }), /OpenAI API key/);
});

test('keys route to the right provider and model', () => {
  assert.equal(providerFor('sk-proj-abc'), 'openai');
  assert.equal(providerFor('sk-ant-abc'), 'claude');
  assert.equal(modelFor('sk-proj-abc', 'claude-opus-5-5'), 'gpt-6-astra');
  assert.equal(modelFor('sk-proj-abc', 'gpt-6-luna'), 'gpt-6-luna');
  assert.deepEqual(toInput([{ type: 'text', text: 'x' }]), [{ type: 'input_text', text: 'x' }]);
});
