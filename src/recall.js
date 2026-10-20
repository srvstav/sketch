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
export function pickBlanks(labels, stats = {}, random = Math.random) {
  if (labels.length === 0) return [];
  const want = Math.min(labels.length, Math.max(2, Math.ceil(labels.length / 2)));
  const scored = labels.map((label, i) => {
    const s = stats[label] ?? { right: 0, wrong: 0 };
    // Missed before → first; never seen → next; well known → last. Random breaks ties.
    return { i, key: (s.wrong > s.right ? 0 : s.right + s.wrong === 0 ? 1 : 2 + s.right - s.wrong) + random() * 0.5 };
  });
  return scored.sort((a, b) => a.key - b.key).slice(0, want).map((s) => s.i).sort((a, b) => a - b);
}

export function recordResult(stats, label, correct) {
  const s = stats[label] ?? { right: 0, wrong: 0 };
  return { ...stats, [label]: correct ? { ...s, right: s.right + 1 } : { ...s, wrong: s.wrong + 1 } };
}
