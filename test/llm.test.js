import { test } from 'node:test';
import assert from 'node:assert/strict';
import Anthropic from '@anthropic-ai/sdk';
import { createClaude, sourceBlocks } from '../src/llm.js';
import { DRAW_SCHEMA } from '../src/prompts.js';

/** SDK subclass whose fetch returns a canned SSE stream and records the request. */
function stubbed({ text, stopReason = 'end_turn', status = 200 }) {
  const seen = [];
  const fetch = async (url, init) => {
    seen.push({ url: String(url), headers: new Headers(init.headers), body: JSON.parse(init.body) });
    if (status !== 200) return new Response(JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'bad' } }), { status, headers: { 'content-type': 'application/json' } });
    const ev = (type, data) => `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`;
    const sse = [
      ev('message_start', { message: { id: 'm', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [], stop_reason: null, usage: { input_tokens: 10, output_tokens: 0 } } }),
      ev('content_block_start', { index: 0, content_block: { type: 'text', text: '' } }),
      ev('content_block_delta', { index: 0, delta: { type: 'text_delta', text } }),
      ev('content_block_stop', { index: 0 }),
      ev('message_delta', { delta: { stop_reason: stopReason }, usage: { output_tokens: 5 } }),
      ev('message_stop', {}),
    ].join('');
    return new Response(sse, { status: 200, headers: { 'content-type': 'text/event-stream' } });
  };
  class A extends Anthropic { constructor(o) { super({ ...o, fetch, maxRetries: 0 }); } }
  for (const k of ['AuthenticationError', 'PermissionDeniedError', 'RateLimitError', 'BadRequestError', 'APIConnectionError', 'APIError', 'APIUserAbortError']) {
    assert.ok(Anthropic[k], `SDK exports ${k}`);
    A[k] = Anthropic[k];
  }
  return { A, seen };
}

test('sends one well-formed request and parses the JSON answer', async () => {
  const { A, seen } = stubbed({ text: '{"svg":"<svg/>","caption":"c","hook":"h"}' });
  const usage = [];
  const claude = createClaude({ Anthropic: A, apiKey: 'sk-ant-test', onUsage: (u) => usage.push(u), browser: true });
  const out = await claude.call({ source: sourceBlocks([{ kind: 'text', name: 'n', data: 'notes' }]), task: 'draw', schema: DRAW_SCHEMA, effort: 'high' });
  assert.deepEqual(out, { svg: '<svg/>', caption: 'c', hook: 'h' });
  const { url, headers, body } = seen[0];
  assert.match(url, /\/v1\/messages/);
  assert.equal(headers.get('anthropic-dangerous-direct-browser-access'), 'true');
  assert.match(headers.get('anthropic-beta'), /server-side-fallback-2026-07-01/);
  assert.equal(body.model, 'claude-opus-5-5');
  assert.equal(body.stream, true);
  assert.equal(body.fallbacks, 'default');
  assert.deepEqual(body.thinking, { type: 'adaptive' });
  assert.equal(body.output_config.effort, 'high');
  assert.equal(body.output_config.format.type, 'json_schema');
  assert.equal(body.messages[0].content[0].type, 'document');
  assert.deepEqual(body.messages[0].content[0].cache_control, { type: 'ephemeral' });
  assert.equal(body.messages[0].content.at(-1).text, 'draw');
  assert.equal(usage[0].output_tokens, 5);
});

test('maps refusals, truncation, bad JSON and auth errors to plain messages', async () => {
  const cases = [
    [{ text: '{}', stopReason: 'refusal' }, /declined/],
    [{ text: '{"svg":', stopReason: 'max_tokens' }, /cut off/],
    [{ text: 'not json' }, /valid JSON/],
    [{ text: '', status: 401 }, /key was rejected/],
  ];
  for (const [opts, re] of cases) {
    const { A } = stubbed(opts);
    const claude = createClaude({ Anthropic: A, apiKey: 'sk-ant-test' });
    await assert.rejects(claude.call({ task: 't', schema: DRAW_SCHEMA }), re);
  }
});
