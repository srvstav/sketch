// Gemini backend with the same call shape as llm.js, so the pipeline doesn't know which model it talks to.
// Raw REST (generateContent); request shape verified against the live API on 2026-10-20.
import { SYSTEM } from './prompts.js';
import { SketchError } from './llm.js';
import { abortableSleep } from './wait.js';

export const GEMINI_DEFAULT_MODEL = 'gemini-3.8-flash'; // free tier; Pro models had no free quota when tested
// Free daily quotas are per model and small (~7 requests on 3.8 Flash when tested), so fall through these in order.
export const GEMINI_FALLBACKS = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'];
const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const MAX_RETRIES = 6;
const BLOCKED = new Set(['SAFETY', 'RECITATION', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII', 'IMAGE_SAFETY', 'LANGUAGE']);

/** Claude-style content blocks (from sourceBlocks / the pipeline) → Gemini parts. */
export function toParts(blocks) {
  return blocks.map((b) => {
    if (b.type === 'text') return { text: b.text };
    if (b.type === 'image') return { inlineData: { mimeType: b.source.media_type, data: b.source.data } };
    if (b.type === 'document' && b.source.type === 'base64') return { inlineData: { mimeType: b.source.media_type, data: b.source.data } };
    if (b.type === 'document' && b.source.type === 'text') return { text: `<document title="${String(b.title ?? '').replace(/"/g, "'")}">\n${b.source.data}\n</document>` };
    throw new SketchError(`Unsupported block for Gemini: ${b.type}`, { kind: 'input' });
  });
}

/** Seconds to wait from a 429/503 body, e.g. RetryInfo { retryDelay: "17s" }. */
export function retryDelay(errBody, attempt) {
  const info = errBody?.error?.details?.find((d) => String(d['@type']).endsWith('RetryInfo'));
  const s = parseFloat(info?.retryDelay);
  return Number.isFinite(s) ? Math.min(s + 1, 90) : Math.min(2 ** attempt * 2, 60);
}

/**
 * @param {object} opts
 * @param {string} opts.apiKey
 * @param {string} [opts.model]
 * @param {(usage: object) => void} [opts.onUsage]  called with Claude-shaped usage so the UI counts both alike
 * @param {typeof fetch} [opts.fetch]
 * @param {(ms: number, signal?: AbortSignal) => Promise<void>} [opts.sleep]
 * @param {(msg: string) => void} [opts.onWait]  told when we back off for rate limits
 */
export function createGemini({ apiKey, model = GEMINI_DEFAULT_MODEL, fallbacks = GEMINI_FALLBACKS, onUsage = () => {}, fetch: fetchImpl = globalThis.fetch, sleep = abortableSleep, onWait = () => {} }) {
  const key = String(apiKey ?? '').trim();
  if (!key || key.startsWith('sk-ant-')) throw new SketchError('That isn’t a Gemini API key.', { kind: 'auth' });

  const chain = [model, ...fallbacks.filter((m) => m !== model)];
  let current = 0; // index into chain; moves forward when a model's daily quota is gone, for all later calls too

  async function call({ source = [], content = [], task, schema, effort = 'medium', maxTokens = 32000, signal }) {
    const body = {
      systemInstruction: { parts: [{ text: SYSTEM }] },
      // Source first, so Gemini's automatic prefix caching can reuse it across calls.
      contents: [{ role: 'user', parts: toParts([...source, ...content, { type: 'text', text: task }]) }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseJsonSchema: schema,
        maxOutputTokens: Math.min(maxTokens, 65536),
        thinkingConfig: { thinkingLevel: effort === 'max' || effort === 'xhigh' ? 'high' : effort },
      },
    };

    let data;
    for (let attempt = 0; ; attempt++) {
      let res;
      try {
        res = await fetchImpl(`${BASE}/${encodeURIComponent(chain[current])}:generateContent`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
          body: JSON.stringify(body),
          signal,
        });
      } catch (err) {
        if (err?.name === 'AbortError') throw new SketchError('Stopped.', { kind: 'abort', cause: err });
        if (attempt < 2) { await sleep(2000, signal); continue; }
        throw new SketchError('Couldn’t reach Gemini. Check your connection.', { kind: 'network', cause: err });
      }
      data = await res.json().catch(() => null);
      if (res.ok) break;

      const msg = data?.error?.message ?? `HTTP ${res.status}`;
      if ((res.status === 429 || res.status === 503 || res.status === 500) && attempt < MAX_RETRIES) {
        // A daily quota won't recover by waiting; per-minute limits and overloads will.
        if (res.status === 429 && /per.?day|PerDay/i.test(msg + JSON.stringify(data?.error?.details ?? ''))) {
          if (current + 1 < chain.length) {
            onWait(`Daily limit reached on ${chain[current]}; switching to ${chain[current + 1]}`);
            current++;
            attempt = -1;
            continue;
          }
          throw new SketchError('Gemini’s free daily limits are used up for every Flash model. They reset at midnight Pacific time.', { kind: 'rate' });
        }
        const wait = retryDelay(data, attempt);
        onWait(res.status === 429 ? `Gemini rate limit: waiting ${Math.round(wait)}s` : `Gemini busy: retrying in ${Math.round(wait)}s`);
        await sleep(wait * 1000, signal);
        continue;
      }
      if (res.status === 400 && /thinking/i.test(msg) && body.generationConfig.thinkingConfig) {
        delete body.generationConfig.thinkingConfig; // model doesn't support this level; use its default
        continue;
      }
      if (res.status === 400 && /API key/i.test(msg)) throw new SketchError('Gemini rejected the API key. Check it in settings.', { kind: 'auth' });
      if (res.status === 401 || res.status === 403) throw new SketchError(`Gemini refused the key: ${msg}`, { kind: 'auth' });
      if (res.status === 429) throw new SketchError(`Gemini’s rate limit for ${chain[current]} kept blocking requests. Wait a few minutes and try again.`, { kind: 'rate' });
      if (res.status === 404) throw new SketchError(`Gemini model “${chain[current]}” isn’t available to this key.`, { kind: 'input' });
      throw new SketchError(`Gemini error (${res.status}): ${msg}`, { kind: res.status === 400 ? 'input' : 'error' });
    }

    const u = data.usageMetadata ?? {};
    onUsage({
      input_tokens: (u.promptTokenCount ?? 0) - (u.cachedContentTokenCount ?? 0),
      cache_read_input_tokens: u.cachedContentTokenCount ?? 0,
      output_tokens: (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0),
    });
    if (data.promptFeedback?.blockReason) throw new SketchError(`Gemini blocked this material (${data.promptFeedback.blockReason}).`, { kind: 'refusal' });
    const cand = data.candidates?.[0];
    if (!cand) throw new SketchError('Gemini returned no answer.');
    if (BLOCKED.has(cand.finishReason)) throw new SketchError(`Gemini declined (${cand.finishReason}).`, { kind: 'refusal' });
    if (cand.finishReason === 'MAX_TOKENS') throw new SketchError('The answer was cut off. Try less material at once.');
    const text = (cand.content?.parts ?? []).filter((p) => !p.thought && typeof p.text === 'string').map((p) => p.text).join('');
    try {
      return JSON.parse(text);
    } catch (cause) {
      throw new SketchError('Gemini returned something that wasn’t valid JSON.', { cause });
    }
  }

  // Free-tier per-minute limits are tight: one request at a time avoids most 429s.
  return { call, get model() { return chain[current]; }, provider: 'gemini', limits: { concurrency: 1 } };
}
