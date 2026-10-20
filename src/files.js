// Read dropped/picked files into sketch sources. Browser only.
import { SketchError } from './llm.js';

const MAX_BYTES = 30 * 1024 * 1024; // API request limit is 32 MB; leave room for base64 + prompt
const TEXT = /\.(txt|md|markdown|csv|tex|rtf|html?)$/i;
const IMAGE = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

export async function readFiles(fileList) {
  const files = [...fileList];
  const total = files.reduce((n, f) => n + f.size, 0);
  if (total > MAX_BYTES) throw new SketchError(`That's ${(total / 1e6).toFixed(0)} MB. sketch takes up to 30 MB at once — split the material.`, { kind: 'input' });
  return Promise.all(files.map(readOne));
}

async function readOne(file) {
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) return { kind: 'pdf', name: file.name, data: await base64(file) };
  if (IMAGE.has(file.type)) return { kind: 'image', name: file.name, mediaType: file.type, data: await base64(file) };
  if (file.type.startsWith('text/') || TEXT.test(file.name)) return { kind: 'text', name: file.name, data: await file.text() };
  throw new SketchError(`sketch can't read "${file.name}" yet. Use PDF, images, or text files.`, { kind: 'input' });
}

function base64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',', 2)[1]);
    r.onerror = () => reject(new SketchError(`Couldn't read "${file.name}".`, { kind: 'input' }));
    r.readAsDataURL(file);
  });
}
