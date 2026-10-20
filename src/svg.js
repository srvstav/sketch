// SVG cleaning and blank-out. Pure functions over an injected DOMParser (browser or linkedom).
// Defence in depth: allowlist here, and the UI only ever shows pictures through <img>, which never runs scripts.

const SVG_NS = 'http://www.w3.org/2000/svg';

const ELEMENTS = new Set([
  'svg', 'g', 'defs', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'path', 'text', 'tspan',
  'marker', 'lineargradient', 'radialgradient', 'stop', 'clippath', 'pattern', 'use', 'title', 'desc',
]);

const ATTRS = new Set([
  'xmlns', 'viewbox', 'width', 'height', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'd', 'points',
  'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-dasharray', 'stroke-dashoffset',
  'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'opacity', 'transform', 'id', 'class',
  'font-family', 'font-size', 'font-weight', 'font-style', 'letter-spacing', 'text-anchor', 'dominant-baseline',
  'alignment-baseline', 'dx', 'dy', 'rotate', 'textlength', 'lengthadjust',
  'marker-start', 'marker-mid', 'marker-end', 'markerwidth', 'markerheight', 'refx', 'refy', 'orient', 'markerunits',
  'offset', 'stop-color', 'stop-opacity', 'gradientunits', 'gradienttransform', 'fx', 'fy',
  'clip-path', 'clippathunits', 'patternunits', 'patterntransform', 'preserveaspectratio', 'href', 'xlink:href',
  'data-recall', 'xmlns:xlink', 'paint-order', 'vector-effect', 'style',
]);

// Only same-document references survive: url(#id) and href="#id".
const isLocalRef = (v) => /^#[\w.-]+$/.test(v.trim());
const hasRemoteUrl = (v) => /url\(\s*(?!['"]?#)/i.test(v) || /javascript:|expression\(|@import/i.test(v);
const CIRCLED = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳';

/** Pull the first <svg>…</svg> out of model output (it sometimes wraps it in a code fence). */
export function extractSvg(raw) {
  if (typeof raw !== 'string') return null;
  const m = raw.match(/<svg[\s\S]*<\/svg>/i);
  return m ? m[0] : null;
}

/**
 * Clean an SVG string. Throws if it isn't a usable SVG.
 * @returns {{ svg: string, recall: string[] }} cleaned markup and the recall labels in document order
 */
export function cleanSvg(raw, { DOMParser }) {
  const src = extractSvg(raw);
  if (!src) throw new Error('No SVG in the drawing.');
  const doc = new DOMParser().parseFromString(src, 'image/svg+xml');
  const root = doc.documentElement;
  if (!root || root.nodeName.toLowerCase() !== 'svg' || doc.getElementsByTagName('parsererror').length) {
    throw new Error('The drawing is not valid SVG.');
  }
  scrub(root);
  root.setAttribute('xmlns', SVG_NS);
  if (!root.getAttribute('viewBox') && !root.getAttribute('viewbox')) root.setAttribute('viewBox', '0 0 1200 800');
  const recall = [...root.getElementsByTagName('text')]
    .filter((t) => t.getAttribute('data-recall') === 'true')
    .map((t) => t.textContent.trim())
    .filter(Boolean);
  const texts = [...root.getElementsByTagName('text')].map((t) => t.textContent.trim()).filter(Boolean);
  return { svg: root.outerHTML, recall, texts };
}

function scrub(el) {
  for (const child of [...el.childNodes]) {
    if (child.nodeType === 1) {
      if (!ELEMENTS.has(child.nodeName.toLowerCase())) child.remove();
      else scrub(child);
    } else if (child.nodeType !== 3) {
      child.remove(); // comments, processing instructions, CDATA
    }
  }
  for (const { name, value } of [...el.attributes]) {
    const n = name.toLowerCase();
    const keep = ATTRS.has(n) && !n.startsWith('on')
      && !((n === 'href' || n === 'xlink:href') && !isLocalRef(value))
      && !hasRemoteUrl(value);
    if (!keep) el.removeAttribute(name);
  }
}

/**
 * Hide chosen recall labels behind numbered blanks.
 * @param {string} svg  cleaned SVG
 * @param {number[]} hide  indexes into the recall list
 * @returns {string} SVG with those labels replaced by ①, ②, …
 */
export function blankOut(svg, hide, { DOMParser }) {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const labels = [...doc.getElementsByTagName('text')].filter(
    (t) => t.getAttribute('data-recall') === 'true' && t.textContent.trim(),
  );
  hide.forEach((idx, n) => {
    const t = labels[idx];
    if (!t) return;
    t.textContent = ` ${CIRCLED[n] ?? `(${n + 1})`} `;
    t.setAttribute('fill', '#E4472B');
    t.setAttribute('font-weight', '800');
  });
  return doc.documentElement.outerHTML;
}

export const blankMark = (n) => CIRCLED[n] ?? `(${n + 1})`;

/**
 * Text that games the picture-only quiz: numbered lists, or labels that copy a quiz question.
 * Pure string work, so it runs anywhere.
 * @param {string[]} texts  every <text> content in the picture
 * @param {{ q: string }[]} questions
 * @returns {string[]} problems, empty if none
 */
export function textIssues(texts, questions = []) {
  const issues = [];
  // Count list markers across labels and inside one label (tspans join without separators).
  const listed = texts.flatMap((t) => t.match(/(?:^|[^\d])\d{1,2}[.)]\s+\S|(?:^|\s)[•–]\s+\S/g) ?? []);
  if (listed.length >= 3) issues.push(`the picture contains a written list (${listed.length} items); show each fact on the metaphor instead`);
  const words = (s) => new Set(String(s).toLowerCase().match(/[\p{L}\p{N}]{4,}/gu) ?? []);
  for (const q of questions) {
    const qw = words(q.q);
    if (qw.size < 3) continue;
    // A single label carrying most of a question's words is the question pasted in.
    if (texts.some((t) => { const tw = words(t); let hit = 0; for (const w of qw) if (tw.has(w)) hit++; return hit / qw.size >= 0.7; })) {
      issues.push(`a label repeats the quiz question "${q.q}"`);
    }
  }
  if (/answer|exam q/i.test(texts.join(' '))) issues.push('the picture labels something as answers to the quiz');
  return issues;
}
