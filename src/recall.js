// Blank-out practice: which labels to hide, and quick local grading before asking the model.

const STOP = new Set(['a', 'an', 'the', 'of', 'and', 'to', 'in', 'on', 'for']);

export function normalize(s) {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w && !STOP.has(w))
    .join(' ');
}

// O(n·m) — labels are a few words, so this is cheap.
export function levenshtein(a, b) {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

/** 'right' | 'wrong' | 'unsure' — unsure answers go to the model. */
export function localGrade(expected, given) {
  const e = normalize(expected);
  const g = normalize(given);
  if (!g) return 'wrong';
  if (e === g) return 'right';
  const dist = levenshtein(e, g);
  if (dist <= Math.max(1, Math.floor(e.length * 0.2))) return 'right'; // spelling slip
  return 'unsure';
}

/**
 * Pick which labels to hide: everything the student got wrong before, topped up with
 * the least-practised ones, about half the labels and at least two.
 * @param {string[]} labels
 * @param {Record<string, {right:number, wrong:number}>} stats
 */
export function pickBlanks(labels, stats = {}, random = Math.random, now = Date.now()) {
  if (labels.length === 0) return [];
  const want = Math.min(labels.length, Math.max(2, Math.ceil(labels.length / 2)));
  const scored = labels.map((label, i) => {
    const s = stats[label] ?? { right: 0, wrong: 0 };
    // Due for review or missed before → first; never seen → next; well known → last. Random breaks ties.
    const first = isDue(stats[label], now) || s.wrong > s.right;
    return { i, key: (first ? 0 : s.right + s.wrong === 0 ? 1 : 2 + s.right - s.wrong) + random() * 0.5 };
  });
  return scored.sort((a, b) => a.key - b.key).slice(0, want).map((s) => s.i).sort((a, b) => a - b);
}

// Spaced review (Leitner boxes): a right answer moves a label up a box, a miss sends it back to box 0 (due now).
export const REVIEW_DAYS = [0, 1, 3, 7, 16, 35];
const DAY = 86_400_000;

export function recordResult(stats, label, correct, now = Date.now()) {
  const s = stats[label] ?? { right: 0, wrong: 0 };
  const box = correct ? Math.min(REVIEW_DAYS.length - 1, (s.box ?? 0) + 1) : 0;
  return { ...stats, [label]: { ...s, right: s.right + (correct ? 1 : 0), wrong: s.wrong + (correct ? 0 : 1), box, last: now } };
}

/** Practised before and its review interval has passed. Labels never practised are new, not due. */
export function isDue(s, now = Date.now()) {
  return s?.last != null && now >= s.last + REVIEW_DAYS[s.box ?? 0] * DAY;
}

/** Due labels per picture in a deck, in deck order: [{ key, due }]. */
export function dueByPicture(deck, now = Date.now()) {
  const keys = [...(deck.overview?.svg ? ['overview'] : []), ...deck.ideas.filter((i) => i.svg).map((i) => i.id)];
  return keys
    .map((key) => ({ key, due: Object.values(deck.recall?.[key] ?? {}).filter((s) => isDue(s, now)).length }))
    .filter((p) => p.due > 0);
}

/**
 * Which key terms an explanation mentions. A term counts when each of its words appears, allowing one typo in
 * words of 5+ letters; "two" matches "2". Used to check explanations without a key. O(terms × words × textWords).
 */
const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
const digits = (w) => { const n = NUMBER_WORDS.indexOf(w); return n >= 0 ? String(n) : w; };

export function termsMentioned(terms, text) {
  const said = normalize(text).split(' ').map(digits);
  const has = (w) => said.some((s) => s === w || (w.length >= 5 && Math.abs(s.length - w.length) <= 1 && levenshtein(s, w) <= 1));
  return terms.map((term) => {
    const words = normalize(term).split(' ').filter(Boolean).map(digits);
    return { term, said: words.length > 0 && words.every(has) };
  });
}
