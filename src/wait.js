// Sleep that a Stop button can interrupt. Shared by the REST backends.
import { SketchError } from './llm.js';

export function abortableSleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new SketchError('Stopped.', { kind: 'abort' }));
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(t); reject(new SketchError('Stopped.', { kind: 'abort' })); }, { once: true });
  });
}
