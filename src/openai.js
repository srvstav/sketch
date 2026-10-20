// OpenAI backend (Responses API) with the same call shape as llm.js.
// Request/response shapes taken from developers.openai.com docs on 2026-10-20; not yet run against a live key.
import { SYSTEM } from './prompts.js';
import { SketchError } from './llm.js';
import { abortableSleep } from './wait.js';

export const OPENAI_DEFAULT_MODEL = 'gpt-6-astra';
const URL = 'https://api.openai.com/v1/responses';
const MAX_RETRIES = 5;

/** Claude-style content blocks → Responses API input items. */
export function toInput(blocks) {
  return blocks.map((b) => {
    if (b.type === 'text') return { type: 'input_text', text: b.text };
    if (b.type === 'image') return { type: 'input_image', image_url: `data:${b.source.media_type};base64,${b.source.data}` };
    if (b.type === 'document' && b.source.type === 'base64') return { type: 'input_file', filename: b.title || 'material.pdf', file_data: `data:${b.source.media_type};base64,${b.source.data}` };
    if (b.type === 'document' && b.source.type === 'text') return { type: 'input_text', text: `<document title="${String(b.title ?? '').replace(/"/g, "'")}">\n${b.source.data}\n</document>` };
    throw new SketchError(`Unsupported block for OpenAI: ${b.type}`, { kind: 'input' });
  });
}

/**
 * @param {object} opts  { apiKey, model, onUsage, onWait, fetch, sleep }
 */
export function createOpenAI({ apiKey, model = OPENAI_DEFAULT_MODEL, onUsage = () => {}, fetch: fetchImpl = globalThis.fetch, sleep = abortableSleep, onWait = () => {} }) {
  const key = String(apiKey ?? '').trim();
  if (!/^sk-/.test(key) || key.startsWith('sk-ant-')) throw new SketchError('That isn’t an OpenAI API key (it starts with "sk-").', { kind: 'auth' });

  async function call({ source = [], content = [], task, schema, effort = 'medium', maxTokens = 32000, signal }) {
    const body = {
      model,
      instructions: SYSTEM,
      // Source first so OpenAI's automatic prompt caching can reuse the prefix across calls.
      input: [{ role: 'user', content: toInput([...source, ...content, { type: 'text', text: task }]) }],
      text: { format: { type: 'json_schema', name: 'sketch_output', strict: true, schema } },
      reasoning: { effort },
      max_output_tokens: Math.max(maxTokens, 25000), // reasoning tokens count toward this limit
    };

    let data;
    for (let attempt = 0; ; attempt++) {
      let res;
      try {
        res = await fetchImpl(URL, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
          body: JSON.stringify(body),
          signal,
        });
      } catch (err) {
        if (err?.name === 'AbortError') throw new SketchError('Stopped.', { kind: 'abort', cause: err });
        if (attempt < 2) { await sleep(2000, signal); continue; }
        throw new SketchError('Couldn’t reach OpenAI. Check your connection.', { kind: 'network', cause: err });
      }
      data = await res.json().catch(() => null);
      if (res.ok) break;

      const msg = data?.error?.message ?? `HTTP ${res.status}`;
      const code = data?.error?.code ?? '';
      if (res.status === 429 && code === 'insufficient_quota') throw new SketchError('This OpenAI key has no credit left.', { kind: 'rate' });
      if ((res.status === 429 || res.status >= 500) && attempt < MAX_RETRIES) {
        const wait = Math.min(Number(res.headers.get?.('retry-after')) || 2 ** attempt * 2, 60);
        onWait(res.status === 429 ? `OpenAI rate limit: waiting ${wait}s` : `OpenAI busy: retrying in ${wait}s`);
        await sleep(wait * 1000, signal);
        continue;
      }
      if (res.status === 400 && /reasoning|effort/i.test(msg) && body.reasoning) {
        delete body.reasoning; // model doesn't take this effort level; use its default
        continue;
      }
      if (res.status === 401) throw new SketchError('OpenAI rejected the API key. Check it in settings.', { kind: 'auth' });
      if (res.status === 403) throw new SketchError(`OpenAI refused the key: ${msg}`, { kind: 'auth' });
      if (res.status === 404) throw new SketchError(`OpenAI model “${model}” isn’t available to this key.`, { kind: 'input' });
      if (res.status === 429) throw new SketchError('OpenAI rate limit hit. Wait a minute and try again.', { kind: 'rate' });
      throw new SketchError(`OpenAI error (${res.status}): ${msg}`, { kind: res.status === 400 ? 'input' : 'error' });
    }

    const u = data.usage ?? {};
    const cached = u.input_tokens_details?.cached_tokens ?? 0;
    onUsage({ input_tokens: (u.input_tokens ?? 0) - cached, cache_read_input_tokens: cached, output_tokens: u.output_tokens ?? 0 });

    const parts = (data.output ?? []).filter((o) => o.type === 'message').flatMap((o) => o.content ?? []);
    // Not certain of the refusal item's exact shape; treat any 'refusal' content item as a decline.
    const refusal = parts.find((p) => p.type === 'refusal');
    if (refusal) throw new SketchError(`OpenAI declined: ${refusal.refusal ?? 'no reason given'}`, { kind: 'refusal' });
    if (data.status === 'incomplete') {
      const why = data.incomplete_details?.reason;
      if (why === 'content_filter') throw new SketchError('OpenAI declined this material.', { kind: 'refusal' });
      throw new SketchError('The answer was cut off. Try less material at once.');
    }
    const text = parts.filter((p) => p.type === 'output_text').map((p) => p.text).join('');
    try {
      return JSON.parse(text);
    } catch (cause) {
      throw new SketchError('OpenAI returned something that wasn’t valid JSON.', { cause });
    }
  }

  return { call, model, provider: 'openai' };
}
