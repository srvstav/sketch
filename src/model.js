// Pick the backend from the key: "sk-ant-…" Anthropic, other "sk-…" OpenAI, anything else Gemini.
import { createClaude, DEFAULT_MODEL } from './llm.js';
import { createGemini, GEMINI_DEFAULT_MODEL } from './gemini.js';
import { createOpenAI, OPENAI_DEFAULT_MODEL } from './openai.js';

export function providerFor(key) {
  const k = String(key ?? '').trim();
  if (k.startsWith('sk-ant-')) return 'claude';
  if (k.startsWith('sk-')) return 'openai';
  return 'gemini';
}

export const PROVIDER_NAMES = { claude: 'Anthropic (Claude)', openai: 'OpenAI', gemini: 'Google (Gemini)' };

export const MODELS = {
  claude: [
    { id: DEFAULT_MODEL, label: 'Claude Opus 5.5' },
    { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 (faster, cheaper)' },
    { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5 (fastest, cheapest)' },
  ],
  openai: [
    { id: OPENAI_DEFAULT_MODEL, label: 'GPT-6 Astra' },
    { id: 'gpt-6.1-sol', label: 'GPT-6.1 Sol (balanced)' },
    { id: 'gpt-6-luna', label: 'GPT-6 Luna (fastest, cheapest)' },
  ],
  gemini: [
    { id: GEMINI_DEFAULT_MODEL, label: 'Gemini 3.8 Flash (free tier)' },
    { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite (free tier, faster)' },
    { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro (paid keys only)' },
  ],
};

/** A model id that belongs to the key's provider; falls back to that provider's default. */
export function modelFor(key, wanted) {
  const list = MODELS[providerFor(key)];
  return list.some((m) => m.id === wanted) ? wanted : list[0].id;
}

/**
 * @param {object} opts  { apiKey, model, onUsage, onWait, Anthropic (only needed for Claude keys), browser, fetch }
 */
export function createModel({ apiKey, model, Anthropic, ...rest }) {
  const id = modelFor(apiKey, model);
  const provider = providerFor(apiKey);
  if (provider === 'claude') return createClaude({ Anthropic, apiKey, model: id, ...rest });
  if (provider === 'openai') return createOpenAI({ apiKey, model: id, ...rest });
  return createGemini({ apiKey, model: id, ...rest });
}
