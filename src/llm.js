// Thin Claude client: one call shape (system + optional cached source + task → JSON).
// The SDK class is injected so the browser can load it from a CDN and Node from npm.
import { SYSTEM } from './prompts.js';

export const DEFAULT_MODEL = 'claude-opus-5-5';

export class SketchError extends Error {
  constructor(message, { kind = 'error', cause } = {}) {
    super(message, { cause });
    this.kind = kind; // 'auth' | 'rate' | 'refusal' | 'input' | 'network' | 'error'
  }
}

/** Build Claude content blocks from the student's material. */
export function sourceBlocks(sources) {
  if (!Array.isArray(sources) || sources.length === 0) throw new SketchError('Add some material first.', { kind: 'input' });
  const blocks = sources.map((s) => {
    switch (s.kind) {
      case 'pdf':
        return { type: 'document', title: s.name, source: { type: 'base64', media_type: 'application/pdf', data: s.data } };
      case 'image':
        return { type: 'image', source: { type: 'base64', media_type: s.mediaType, data: s.data } };
      case 'text':
        if (!s.data.trim()) throw new SketchError(`"${s.name}" is empty.`, { kind: 'input' });
        return { type: 'document', title: s.name, source: { type: 'text', media_type: 'text/plain', data: s.data } };
      default:
        throw new SketchError(`Unsupported material: ${s.name}`, { kind: 'input' });
    }
  });
  // One breakpoint after the last source block: every source-side call shares this prefix.
  blocks[blocks.length - 1] = { ...blocks.at(-1), cache_control: { type: 'ephemeral' } };
  return blocks;
}

/**
 * @param {object} opts
 * @param {Function} opts.Anthropic  SDK class
 * @param {string} opts.apiKey
 * @param {string} [opts.model]
 * @param {(usage: object) => void} [opts.onUsage]
 * @returns {{ call: (req: CallRequest) => Promise<object> }}
 */
export function createClaude({ Anthropic, apiKey, model = DEFAULT_MODEL, onUsage = () => {}, browser = false }) {
  if (!apiKey || !/^sk-ant-/.test(apiKey.trim())) throw new SketchError('That doesn\'t look like an Anthropic API key (it starts with "sk-ant-").', { kind: 'auth' });
  const client = new Anthropic({ apiKey: apiKey.trim(), dangerouslyAllowBrowser: browser, maxRetries: 3 });

  /**
   * @typedef {object} CallRequest
   * @property {object[]} [source]  blocks from sourceBlocks(); omit for calls that must not see the material
   * @property {object[]} [content] extra leading blocks (e.g. an image for the judge)
   * @property {string} task
   * @property {object} schema
   * @property {'low'|'medium'|'high'|'xhigh'|'max'} [effort]
   * @property {number} [maxTokens]
   * @property {AbortSignal} [signal]
   */
  async function call({ source = [], content = [], task, schema, effort = 'medium', maxTokens = 32000, signal }) {
    let message;
    try {
      // Streaming avoids HTTP timeouts on long SVG outputs; fallbacks reroute a safety decline to another model.
      const stream = client.beta.messages.stream(
        {
          model,
          max_tokens: maxTokens,
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          thinking: { type: 'adaptive' },
          output_config: { effort, format: { type: 'json_schema', schema } },
          system: SYSTEM,
          messages: [{ role: 'user', content: [...source, ...content, { type: 'text', text: task }] }],
        },
        { signal },
      );
      message = await stream.finalMessage();
    } catch (err) {
      throw toEtchError(err, Anthropic);
    }
    onUsage(message.usage);
    if (message.stop_reason === 'refusal') {
      throw new SketchError(`Claude declined this material${message.stop_details?.explanation ? `: ${message.stop_details.explanation}` : '.'}`, { kind: 'refusal' });
    }
    if (message.stop_reason === 'max_tokens') throw new SketchError('The answer was cut off. Try less material at once.', { kind: 'error' });
    const text = message.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    try {
      return JSON.parse(text);
    } catch (cause) {
      throw new SketchError('Claude returned something that wasn\'t valid JSON.', { kind: 'error', cause });
    }
  }

  return { call, model };
}

function toEtchError(err, Anthropic) {
  if (err instanceof SketchError) return err;
  if (err?.name === 'AbortError' || err instanceof (Anthropic.APIUserAbortError ?? class {})) return new SketchError('Stopped.', { kind: 'abort', cause: err });
  if (err instanceof Anthropic.AuthenticationError) return new SketchError('Your API key was rejected. Check it in settings.', { kind: 'auth', cause: err });
  if (err instanceof Anthropic.PermissionDeniedError) return new SketchError('This key can\'t use that model.', { kind: 'auth', cause: err });
  if (err instanceof Anthropic.RateLimitError) return new SketchError('Rate limit hit. Wait a minute and try again.', { kind: 'rate', cause: err });
  if (err instanceof Anthropic.BadRequestError) return new SketchError(`The request was rejected: ${err.message}`, { kind: 'input', cause: err });
  if (err instanceof Anthropic.APIConnectionError) return new SketchError('Couldn\'t reach Claude. Check your connection.', { kind: 'network', cause: err });
  if (err instanceof Anthropic.APIError) return new SketchError(`Claude error (${err.status ?? '?'}): ${err.message}`, { kind: 'error', cause: err });
  return new SketchError(err?.message ?? String(err), { kind: 'error', cause: err });
}
