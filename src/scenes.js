// Scene templates: the model picks a shape and fills its slots (words only); this file draws it.
// Layout is done here, so labels never collide and cheap models get the same picture quality as strong ones.
// Pure string work: runs in the browser and in Node. Output still goes through cleanSvg like any drawing.
import { ICONS, iconBadge, icon } from './icons.js';

export const TEMPLATES = ['machine', 'cycle', 'journey', 'dominoes', 'building'];

const PAPER = '#FBF7EE', INK = '#1B1A17', RED = '#E4472B', BLUE = '#2B6CB0', GREEN = '#2F855A', OCHRE = '#D69E2E', VIOLET = '#6B46C1';
const FONT = 'Avenir Next, Helvetica Neue, Arial, sans-serif';
const MAX_STEPS = { cycle: 7 };
const LIMITS = { label: 48, note: 110, handoff: 40, edge: 60, hook: 110, stat: 12 };

const r1 = (v) => Math.round(v * 10) / 10;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const str = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/**
 * Validate a model-filled scene. Returns null when it can't be drawn (caller falls back to free drawing).
 * @returns {{ steps: {label: string, note: string, handoff: string, icon: string, stat: string}[], start: string, end: string, center: string,
 *   pitfall: {after: number, text: string}, hook: {at: number, text: string} } | null}
 */
export function normalizeScene(raw, shape) {
  if (!TEMPLATES.includes(shape) || !raw || !Array.isArray(raw.steps)) return null;
  const steps = raw.steps
    .map((s) => ({
      label: str(s?.label, LIMITS.label), note: str(s?.note, LIMITS.note), handoff: str(s?.handoff, LIMITS.handoff),
      icon: ICONS.includes(s?.icon) ? s.icon : '', stat: str(s?.stat, LIMITS.stat),
    }))
    .filter((s) => s.label)
    .slice(0, MAX_STEPS[shape] ?? 6);
  if (steps.length < 2) return null;
  // A badge is for a number or formula; words, and repeats of text already drawn, are dropped.
  const shown = new Set([raw.start, raw.end, raw.center].map((v) => str(v, LIMITS.edge).toLowerCase()));
  for (const st of steps) if (!/[\p{N}=×÷→±%]/u.test(st.stat) || shown.has(st.stat.toLowerCase()) || st.stat.toLowerCase() === st.label.toLowerCase()) st.stat = '';
  const idx = (v, n) => (Number.isInteger(v) && v >= 0 && v < n ? v : -1);
  const pitText = str(raw.pitfall?.text, LIMITS.hook);
  const hookText = str(raw.hook?.text, LIMITS.hook);
  return {
    steps,
    start: str(raw.start, LIMITS.edge),
    end: str(raw.end, LIMITS.edge),
    center: str(raw.center, LIMITS.edge),
    pitfall: { after: pitText ? idx(raw.pitfall?.after, steps.length) : -1, text: pitText },
    hook: { at: hookText ? Math.max(0, idx(raw.hook?.at, steps.length)) : -1, text: hookText },
  };
}

// Glue and generic process words any course may use for a step; they never make a label "invented".
const GENERIC = new Set(('with from into onto over that this then than each their phase stage step process formation production '
  + 'synthesis regeneration release entry input output yield total overall gain loss transfer reaction splitting start final first second third').split(' '));
const stem = (w) => w.replace(/(ations?|ions?|ings?|ed|es|s)$/, '').slice(0, 5);
const stems = (s) => (String(s).toLowerCase().match(/\p{L}{4,}/gu) ?? []).filter((w) => !GENERIC.has(w)).map(stem);

/**
 * Step labels are what students recall, so each must be the material's own term, not a name the model made up
 * ("Carbon Stripping" for α-ketoglutarate). A label passes if every word's stem appears in the text or key terms.
 * `text` is null when the material isn't plain text (PDF, image): nothing to check against.
 * O(text) per call — fine for notes; the set could be cached per deck if sources get large.
 */
export function labelIssues(scene, text, terms = []) {
  if (!scene || text == null) return [];
  const known = new Set(stems(`${text} ${terms.join(' ')}`));
  return scene.steps
    .filter((st) => stems(st.label).some((w) => !known.has(w)))
    .map((st) => `the label "${st.label}" is not a term from the material; use the material's own word for this step`);
}

/**
 * Draw a scene. `issues` lists words that had to be cut to fit, so a redraw can shorten them.
 * @returns {{ svg: string, issues: string[] }}
 */
export function renderScene(shape, title, scene) {
  const pen = makePen();
  const body = DRAW[shape](pen, scene);
  return { svg: frame(pen, title, body), issues: pen.issues };
}

/** The big picture: the ideas in study order; next-step links arc above, other links arc below. No model call. */
export function renderOverview(map) {
  const pen = makePen();
  const n = map.ideas.length, slot = 1120 / n, w = Math.min(slot - 36, 240), top = 330, h = 110;
  const idx = new Map(map.ideas.map((idea, i) => [idea.id, i]));
  const cx = (i) => 40 + slot * (i + 0.5);
  const back = [], mid = [], front = [];
  let below = 0;
  for (const l of map.links) {
    const a = idx.get(l.from), b = idx.get(l.to);
    if (a == null || b == null || a === b) continue;
    if (b === a + 1) {
      const xa = cx(a) + w * 0.2, xb = cx(b) - w * 0.2, m = (cx(a) + cx(b)) / 2;
      back.push(`<path d="M${r1(xa)},${top - 2} Q${r1(m)},${top - 100} ${r1(xb)},${top - 6}" fill="none" stroke="${VIOLET}" stroke-width="3" marker-end="url(#ah-v)"/>`);
      front.push(pen.text(m, top - 116, l.label, { w: slot - 14, size: 17, min: 12, lines: 2, fill: VIOLET, italic: true }));
    } else {
      // Deeper for longer jumps and for each extra link, so arcs and their labels stack instead of colliding.
      const depth = 90 + 40 * Math.abs(b - a) + 50 * below++;
      const xa = cx(a) + (b > a ? 0.15 : -0.15) * w, xb = cx(b) + (b > a ? -0.15 : 0.15) * w, m = (xa + xb) / 2;
      back.push(`<path d="M${r1(xa)},${top + h + 2} Q${r1(m)},${r1(top + h + depth)} ${r1(xb)},${top + h + 6}" fill="none" stroke="${VIOLET}" stroke-width="3" marker-end="url(#ah-v)"/>`);
      front.push(pen.pill(m, top + h + depth / 2 + 2, l.label, { w: Math.min(300, Math.abs(xb - xa) - 20), size: 16, min: 12, lines: 2, fill: VIOLET, italic: true }));
    }
  }
  map.ideas.forEach((idea, i) => {
    const x = cx(i);
    mid.push(box(x - w / 2, top, w, h, BLUE));
    mid.push(`<circle cx="${r1(x - w / 2 + 4)}" cy="${top + 4}" r="19" fill="${INK}"/>`);
    front.push(pen.text(x - w / 2 + 4, top + 4, String(i + 1), { w: 30, size: 20, weight: 700, fill: PAPER, lines: 1 }));
    const steps = idea.scene?.steps ?? [];
    const pic = steps[idea.scene?.hook?.at]?.icon || steps.find((st) => st.icon)?.icon;
    if (pic) mid.push(iconBadge(pic, x + w / 2 - 4, top + 4, 22, BLUE));
    front.push(pen.text(x, top + h / 2, idea.title, { w: w - 24, size: 22, min: 14, lines: 3, weight: 700, recall: true }));
  });
  return { svg: frame(pen, map.title, [...back, ...mid, ...front].join('')), issues: pen.issues };
}

// ─── shapes ──────────────────────────────────────────────────────────────────

const DRAW = {
  /** Stations on a conveyor belt; handoffs ride arcs from station to station. */
  machine(pen, s) {
    const N = s.steps.length;
    const x0 = 40 + (s.start ? 130 : 0), x1 = 1160 - (s.end ? 130 : 0);
    const slot = (x1 - x0) / N, bw = slot - 28, top = 280, bh = 150, belt = 452;
    const cx = (i) => x0 + slot * (i + 0.5);
    const back = [], mid = [], front = [];
    for (let x = 64; x < 1160; x += 56) back.push(`<circle cx="${x}" cy="${belt + 32}" r="11" fill="${PAPER}" stroke="${INK}" stroke-width="2.5"/>`);
    back.push(`<rect x="40" y="${belt}" width="1120" height="22" rx="11" fill="${INK}"/>`);
    for (let x = 100; x < 1140; x += 112) back.push(`<path d="M${x},${belt + 5} l8,6 l-8,6" fill="none" stroke="${PAPER}" stroke-width="2.5"/>`);
    const notes = [];
    s.steps.forEach((st, i) => {
      const x = cx(i);
      mid.push(`<rect x="${r1(x - bw / 2 + 14)}" y="${top + bh - 2}" width="10" height="${belt - top - bh + 2}" fill="${INK}"/>`);
      mid.push(`<rect x="${r1(x + bw / 2 - 24)}" y="${top + bh - 2}" width="10" height="${belt - top - bh + 2}" fill="${INK}"/>`);
      mid.push(box(x - bw / 2, top, bw, bh, BLUE));
      if (st.icon) mid.push(iconBadge(st.icon, x, top, 26, BLUE));
      if (st.stat) front.push(pen.stat(x, top + bh, st.stat, { w: bw + 10 }));
      // The label sits between the icon (top edge) and the number (bottom edge).
      const lt = top + (st.icon ? 28 : 8), lb = top + bh - (st.stat ? 16 : 8);
      front.push(pen.text(x, (lt + lb) / 2, st.label, { w: bw - 14, size: 22, min: 12, lines: 3, weight: 700, recall: true }));
      const note = pen.block(x, 506, st.note, { w: slot - 14, size: 18, min: 13, lines: 6 });
      notes.push(note.h);
      front.push(note.svg);
      if (i < N - 1 && st.handoff) {
        const off = Math.max(bw * 0.22, 34), a = x + off, b = cx(i + 1) - off, m = (x + cx(i + 1)) / 2; // clear of the icon badges
        back.push(`<path d="M${r1(a)},${top - 2} Q${r1(m)},${top - 96} ${r1(b)},${top - 6}" fill="none" stroke="${VIOLET}" stroke-width="3" marker-end="url(#ah-v)"/>`);
        front.push(pen.text(m, top - 112, st.handoff, { w: slot - 16, size: 17, min: 12, lines: 2, fill: VIOLET, italic: true }));
      }
    });
    if (s.start) front.push(crate(pen, 105, belt, s.start, GREEN, 'IN'));
    if (s.end) front.push(crate(pen, 1095, belt, s.end, RED, 'OUT'));
    if (s.hook.at >= 0) front.push(hookBox(pen, { x: clamp(cx(s.hook.at) - 310, 40, 540), y: 672, w: 620, lines: 3, text: s.hook.text, to: { x: cx(s.hook.at), y: 506 + notes[s.hook.at] + 8 } }));
    return [...back, ...mid, ...front].join('');
  },

  /** Stops around a wheel; handoffs ride the rim, the hub says what the cycle is for. */
  cycle(pen, s) {
    const statted = s.steps.some((st) => st.stat);
    const N = s.steps.length, C = { x: 600, y: 445 }, RX = 300, RY = 215, BW = 200, BH = statted ? 88 : 72;
    const ang = (i) => -Math.PI / 2 + (i * 2 * Math.PI) / N;
    const at = (a, k = 0) => ({ x: C.x + (RX - k) * Math.cos(a), y: C.y + (RY - k) * Math.sin(a) });
    // Walk along the rim until it leaves the badge (plus air for the arrowhead). O(steps) per badge.
    const leave = (a, dir) => {
      const p = at(a);
      let t = a;
      while (Math.abs(t - a) < Math.PI / N) {
        const q = at(t);
        if (Math.abs(q.x - p.x) > BW / 2 + 8 || Math.abs(q.y - p.y) > BH / 2 + 8) break;
        t += dir * 0.01;
      }
      return t;
    };
    const badges = s.steps.map((_, i) => at(ang(i)));
    // Icons ride the spokes, just inside each stop and clear of its number; never closer to the hub than RY - k allows.
    const icons = s.steps.map((st, i) => {
      if (!st.icon) return null;
      const a = ang(i), p = at(a);
      let k = 0, q = p;
      while (k < RY - 110 && Math.abs(q.x - p.x) < BW / 2 + 30 && Math.abs(q.y - p.y) < BH / 2 + 44) q = at(a, (k += 4));
      return q;
    });
    const back = [`<ellipse cx="${C.x}" cy="${C.y}" rx="${RX}" ry="${RY}" fill="none" stroke="${INK}" stroke-opacity="0.12" stroke-width="14"/>`], mid = [], front = [];
    s.steps.forEach((st, i) => {
      const a = ang(i), b = ang(i + 1);
      const p = at(a);
      back.push(`<line x1="${C.x}" y1="${C.y}" x2="${r1(p.x)}" y2="${r1(p.y)}" stroke="${INK}" stroke-opacity="0.15" stroke-width="2"/>`);
      const s0 = at(leave(a, 1)), s1 = at(leave(b, -1) - 0.03);
      back.push(`<path d="M${r1(s0.x)},${r1(s0.y)} A${RX},${RY} 0 0 1 ${r1(s1.x)},${r1(s1.y)}" fill="none" stroke="${INK}" stroke-width="4" marker-end="url(#ah)"/>`);
      if (st.handoff) {
        // Slide inward from the rim until the label clears every badge and the hub.
        const o = { w: 130, size: 16, min: 12, lines: 2, fill: VIOLET, italic: true };
        const m = pen.measure(st.handoff, o), hw = Math.min(o.w, Math.max(...m.lines.map((l) => l.length)) * m.size * GLYPH.regular) / 2 + 4, hh = m.h / 2 + 4;
        const clear = (h) => badges.every((p) => Math.abs(h.x - p.x) > hw + BW / 2 || Math.abs(h.y - p.y) > hh + BH / 2)
          && icons.every((q) => !q || Math.abs(h.x - q.x) > hw + 26 || Math.abs(h.y - q.y) > hh + 26)
          && (Math.abs(h.x - C.x) > hw + 74 || Math.abs(h.y - C.y) > hh + 74);
        let h;
        for (let k = 60; k <= 150 && !clear(h = at((a + b) / 2, k)); k += 6);
        front.push(pen.text(h.x, h.y, st.handoff, o));
      }
      mid.push(`<rect x="${r1(p.x - BW / 2)}" y="${r1(p.y - BH / 2)}" width="${BW}" height="${BH}" rx="${BH / 2}" fill="${PAPER}"/>`);
      mid.push(`<rect x="${r1(p.x - BW / 2)}" y="${r1(p.y - BH / 2)}" width="${BW}" height="${BH}" rx="${BH / 2}" fill="${BLUE}" fill-opacity="0.14" stroke="${BLUE}" stroke-width="3"/>`);
      front.push(pen.text(p.x, p.y - (st.stat ? 10 : 0), st.label, { w: BW - 24, size: 21, min: 13, lines: 2, weight: 700, recall: true }));
      if (icons[i]) mid.push(iconBadge(st.icon, icons[i].x, icons[i].y, 24, BLUE));
      if (st.stat) front.push(pen.stat(p.x, p.y + BH / 2, st.stat, { w: BW }));
      const c = Math.cos(a);
      if (Math.abs(c) > 0.3) {
        const x = c > 0 ? p.x + BW / 2 + 12 : p.x - BW / 2 - 12;
        const w = Math.min(240, c > 0 ? 1160 - x : x - 40);
        front.push(pen.text(x, p.y, st.note, { w, size: 17, min: 12, lines: 4, anchor: c > 0 ? 'start' : 'end' }));
      } else if (Math.sin(a) < 0) {
        front.push(pen.block(p.x, p.y - BH / 2 - 10, st.note, { w: 340, size: 17, min: 12, lines: 2, valign: 'bottom' }).svg);
      } else {
        front.push(pen.block(p.x, p.y + BH / 2 + (st.stat ? 24 : 10), st.note, { w: 340, size: 17, min: 12, lines: 3 }).svg);
      }
      if (i === s.hook.at) front.push(bolt(p.x + (p.x < C.x ? -1 : 1) * (BW / 2 - 8), p.y - BH / 2 + 2)); // outer corner, away from the rim labels
    });
    mid.push(`<circle cx="${C.x}" cy="${C.y}" r="74" fill="${PAPER}" stroke="${INK}" stroke-width="2.5"/><circle cx="${C.x}" cy="${C.y}" r="74" fill="${OCHRE}" fill-opacity="0.22"/>`);
    if (s.center) front.push(pen.text(C.x, C.y, s.center, { w: 124, size: 20, min: 12, lines: 3, weight: 700, recall: true }));
    const top = at(ang(0));
    if (s.start) {
      front.push(caps(48, 108, 'IN', GREEN, 'start'), pen.block(48, 116, s.start, { w: 300, size: 20, min: 14, lines: 2, weight: 700, fill: GREEN, anchor: 'start', recall: true }).svg);
      back.push(`<path d="M120,180 Q120,${r1(top.y)} ${r1(top.x - BW / 2 - 12)},${r1(top.y)}" fill="none" stroke="${GREEN}" stroke-width="3" marker-end="url(#ah-g)"/>`);
    }
    if (s.end) {
      front.push(caps(1152, 108, 'OUT', RED, 'end'), pen.block(1152, 116, s.end, { w: 300, size: 20, min: 14, lines: 2, weight: 700, fill: RED, anchor: 'end', recall: true }).svg);
      back.push(`<path d="M${r1(top.x + BW / 2 + 12)},${r1(top.y)} Q1080,${r1(top.y)} 1080,184" fill="none" stroke="${RED}" stroke-width="3" marker-end="url(#ah-r)"/>`);
    }
    if (s.hook.at >= 0) {
      const p = at(ang(s.hook.at));
      const w = statted ? 330 : 440; // narrower so it clears the numbers under the bottom stops
      front.push(hookBox(pen, { x: p.x > C.x ? 1160 - w : 40, y: 676, w, lines: statted ? 4 : 3, text: s.hook.text }));
    }
    return [...back, ...mid, ...front].join('');
  },

  /** Signposts along a winding road; the pitfall is a dashed wrong turn to a dead end. */
  journey(pen, s) {
    const N = s.steps.length;
    const x0 = s.start ? 200 : 60, x1 = s.end ? 1000 : 1140, slot = (x1 - x0) / N;
    const ry = (x) => 430 + 30 * Math.sin(((x - 40) / 1120) * Math.PI * 3);
    const road = Array.from({ length: 57 }, (_, k) => 40 + k * 20).map((x) => `${x},${r1(ry(x))}`).join(' L');
    const back = [`<path d="M${road}" fill="none" stroke="#E6DCC6" stroke-width="58" stroke-linecap="round"/>`, `<path d="M${road}" fill="none" stroke="${PAPER}" stroke-width="3" stroke-dasharray="14 12"/>`];
    const mid = [], front = [];
    const mx = (i) => x0 + slot * (i + 0.5);
    const iconic = s.steps.some((st) => st.icon);
    s.steps.forEach((st, i) => {
      const x = mx(i), y = ry(x), up = i % 2 === 0, half = Math.min(slot - 14, 170);
      // Signs on one side are two slots apart; edge signs shrink rather than shift into their neighbour.
      const sx = Math.max(x - half, x0 - 6), w = Math.min(x + half, x1 + 6) - sx;
      const label = pen.measure(st.label, { w: w - 24, size: 21, min: 14, lines: 2, weight: 700 });
      const note = pen.measure(st.note, { w: w - 24, size: 17, min: 12, lines: up ? 4 : 3 });
      // A number badge straddles the sign's far edge; make room for it there.
      const pad = st.stat ? 12 : 0, dy = up ? pad : 0;
      const h = 14 + label.h + (st.note ? 6 + note.h : 0) + 14 + pad;
      const sy = up ? y - 64 - h : y + 64;
      back.push(`<line x1="${r1(x)}" y1="${r1(y)}" x2="${r1(x)}" y2="${r1(up ? sy + h : sy)}" stroke="${INK}" stroke-width="3"/>`);
      mid.push(`<rect x="${r1(sx)}" y="${r1(sy)}" width="${r1(w)}" height="${r1(h)}" rx="8" fill="#FFFDF7" stroke="${INK}" stroke-width="2.5"/>`);
      front.push(pen.block(sx + w / 2, sy + 14 + dy, st.label, { w: w - 24, size: 21, min: 14, lines: 2, weight: 700, recall: true }).svg);
      if (st.note) front.push(pen.block(sx + w / 2, sy + 14 + dy + label.h + 6, st.note, { w: w - 24, size: 17, min: 12, lines: up ? 4 : 3 }).svg);
      if (st.stat) front.push(pen.stat(sx + w / 2, up ? sy : sy + h, st.stat, { w: w - 70 }));
      mid.push(st.icon ? iconBadge(st.icon, x, y, 24, BLUE) : `<circle cx="${r1(x)}" cy="${r1(y)}" r="13" fill="${BLUE}" stroke="${INK}" stroke-width="2.5"/>`);
      if (i === s.hook.at) front.push(bolt(sx + w - 6, sy + 6));
      if (i < N - 1 && st.handoff) {
        const hx = x + slot / 2;
        front.push(pen.pill(hx, ry(hx), st.handoff, { w: slot - (iconic ? 66 : 50), size: 15, min: 11, lines: 2, fill: VIOLET, italic: true }));
      }
    });
    if (s.start) front.push(flag(pen, 115, ry(115), s.start, GREEN, 'START'));
    if (s.end) front.push(flag(pen, 1085, ry(1085), s.end, RED, 'END'));
    const pit = s.pitfall.after >= 0;
    if (pit) {
      const a = s.pitfall.after, bx = a < N - 1 ? mx(a) + slot / 2 : mx(a) + slot * 0.35, by = ry(bx);
      // A short dashed spur off the road to a red ✕; the same ✕ marks the WRONG TURN box below.
      back.push(`<path d="M${r1(bx)},${r1(by)} q6,26 26,40" fill="none" stroke="${RED}" stroke-width="5" stroke-dasharray="8 6"/>`);
      front.push(cross(bx + 30, by + 44));
      mid.push(`<rect x="${s.hook.at >= 0 ? 620 : 300}" y="706" width="540" height="80" rx="8" fill="${PAPER}"/><rect x="${s.hook.at >= 0 ? 620 : 300}" y="706" width="540" height="80" rx="8" fill="${RED}" fill-opacity="0.12" stroke="${RED}" stroke-width="2.5"/>`);
      const px = s.hook.at >= 0 ? 620 : 300;
      front.push(cross(px + 30, 746), caps(px + 56, 730, 'WRONG TURN', RED, 'start'), pen.block(px + 56, 738, s.pitfall.text, { w: 466, size: 18, min: 12, lines: 2, weight: 600, anchor: 'start' }).svg);
    }
    if (s.hook.at >= 0) front.push(hookBox(pen, { x: 40, y: 706, w: pit ? 560 : 640, lines: 2, text: s.hook.text }));
    return [...back, ...mid, ...front].join('');
  },

  /** A row of falling dominoes: each cause knocks over the next. */
  dominoes(pen, s) {
    const N = s.steps.length, ground = 470, TW = 44, TH = 160;
    const x0 = s.start ? 190 : 60, x1 = s.end ? 990 : 1140, slot = (x1 - x0) / N;
    const cx = (i) => x0 + slot * (i + 0.5);
    const back = [`<line x1="40" y1="${ground}" x2="1160" y2="${ground}" stroke="${INK}" stroke-width="3"/>`], mid = [], front = [];
    const notes = [], noteY = s.steps.some((st) => st.stat) ? 520 : 492;
    s.steps.forEach((st, i) => {
      const x = cx(i), lean = N > 1 ? ((N - 1 - i) / (N - 1)) * 16 : 0;
      mid.push(`<g transform="rotate(${r1(lean)} ${r1(x + TW / 2)} ${ground})"><rect x="${r1(x - TW / 2)}" y="${ground - TH}" width="${TW}" height="${TH}" rx="6" fill="${PAPER}" stroke="${INK}" stroke-width="2.5"/><rect x="${r1(x - TW / 2)}" y="${ground - TH}" width="${TW}" height="${TH}" rx="6" fill="${BLUE}" fill-opacity="0.2"/><line x1="${r1(x - TW / 2 + 6)}" y1="${ground - TH / 2}" x2="${r1(x + TW / 2 - 6)}" y2="${ground - TH / 2}" stroke="${INK}" stroke-width="2"/>${st.icon ? icon(st.icon, x, ground - TH * 0.75, 38) : `<circle cx="${r1(x)}" cy="${ground - TH * 0.75}" r="5" fill="${INK}"/>`}<circle cx="${r1(x)}" cy="${ground - TH * 0.25}" r="5" fill="${INK}"/></g>`);
      if (st.stat) front.push(pen.stat(x, ground + 25, st.stat, { w: slot - 10 }));
      front.push(pen.block(x, 286, st.label, { w: slot - 14, size: 21, min: 13, lines: 3, weight: 700, recall: true, valign: 'bottom' }).svg);
      const note = pen.block(x, noteY, st.note, { w: slot - 14, size: 17, min: 12, lines: 6 });
      notes.push(note.h);
      front.push(note.svg);
      if (i < N - 1 && st.handoff) {
        const m = x + slot / 2;
        back.push(`<line x1="${r1(x + TW / 2 + 10)}" y1="${ground - 9}" x2="${r1(cx(i + 1) - TW / 2 - 8)}" y2="${ground - 9}" stroke="${VIOLET}" stroke-width="2.5" marker-end="url(#ah-v)"/>`);
        front.push(pen.text(m + 6, ground - 42, st.handoff, { w: slot - 66, size: 15, min: 12, lines: 3, fill: VIOLET, italic: true }));
      }
    });
    if (s.start) {
      mid.push(`<path d="M52,372 h${x0 - 130} v-14 l30,24 l-30,24 v-14 h-${x0 - 130} z" fill="${GREEN}" fill-opacity="0.85"/>`);
      front.push(caps(115, 236, 'FIRST PUSH', GREEN, 'middle'), pen.block(115, 246, s.start, { w: 140, size: 19, min: 13, lines: 4, weight: 700, fill: GREEN, recall: true }).svg);
    }
    if (s.end) {
      back.push(`<line x1="${r1(cx(N - 1) + TW / 2 + 10)}" y1="${ground - 9}" x2="1006" y2="${ground - 9}" stroke="${RED}" stroke-width="3" marker-end="url(#ah-r)"/>`);
      mid.push(`<rect x="1012" y="290" width="148" height="180" rx="8" fill="${PAPER}" stroke="${INK}" stroke-width="2.5"/><rect x="1012" y="290" width="148" height="180" rx="8" fill="${RED}" fill-opacity="0.15"/>`);
      front.push(caps(1086, 278, 'RESULT', RED, 'middle'), pen.text(1086, 380, s.end, { w: 128, size: 20, min: 12, lines: 6, weight: 700, recall: true }));
    }
    if (s.hook.at >= 0) front.push(hookBox(pen, { x: clamp(cx(s.hook.at) - 310, 40, 540), y: 672, w: 620, lines: 3, text: s.hook.text, to: { x: cx(s.hook.at), y: noteY + notes[s.hook.at] + 8 } }));
    return [...back, ...mid, ...front].join('');
  },

  /** Floors from the foundation up; each rests on the one below. */
  building(pen, s) {
    const N = s.steps.length, L = 320, Rx = 880, top = 200, bottom = 660, fh = (bottom - top) / N;
    const back = [], mid = [], front = [];
    const fy = (i) => bottom - (i + 1) * fh;
    const statted = s.steps.some((st) => st.stat), noteW = statted ? 160 : 272;
    mid.push(`<polygon points="290,${top} 600,118 910,${top}" fill="${PAPER}" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/><polygon points="290,${top} 600,118 910,${top}" fill="${RED}" fill-opacity="0.15"/>`);
    if (s.end) front.push(pen.text(600, 176, s.end, { w: 300, size: 19, min: 12, lines: 2, weight: 700, recall: true }));
    s.steps.forEach((st, i) => {
      const y = fy(i);
      mid.push(`<rect x="${L}" y="${r1(y)}" width="${Rx - L}" height="${r1(fh)}" fill="${PAPER}" stroke="${INK}" stroke-width="2.5"/><rect x="${L}" y="${r1(y)}" width="${Rx - L}" height="${r1(fh)}" fill="${BLUE}" fill-opacity="${i % 2 ? 0.1 : 0.2}"/>`);
      mid.push(`<line x1="580" y1="${r1(y + 10)}" x2="580" y2="${r1(y + fh - 10)}" stroke="${INK}" stroke-opacity="0.3" stroke-width="2"/>`);
      if (st.icon) mid.push(iconBadge(st.icon, L + 32, y + fh / 2, Math.min(24, (fh - 12) / 2), BLUE));
      front.push(pen.text(st.icon ? 474 : 450, y + fh / 2, st.label, { w: st.icon ? 188 : 236, size: 22, min: 13, lines: clamp(Math.floor((fh - 12) / 27), 1, 3), weight: 700, recall: true }));
      front.push(pen.text(594, y + fh / 2, st.note, { w: noteW, size: 17, min: 12, lines: clamp(Math.floor((fh - 10) / 21), 1, 5), anchor: 'start' }));
      if (st.stat) front.push(pen.stat(826, y + fh / 2, st.stat, { w: 104 }));
      if (i < N - 1 && st.handoff) {
        back.push(`<line x1="896" y1="${r1(y + 16)}" x2="896" y2="${r1(y - 14)}" stroke="${VIOLET}" stroke-width="2.5" marker-end="url(#ah-v)"/>`);
        front.push(pen.text(910, y, st.handoff, { w: 250, size: 16, min: 12, lines: 2, fill: VIOLET, italic: true, anchor: 'start' }));
      }
    });
    back.push(`<line x1="200" y1="${bottom}" x2="1000" y2="${bottom}" stroke="${INK}" stroke-width="4"/>`);
    for (let x = 210; x < 1000; x += 24) back.push(`<line x1="${x}" y1="${bottom + 4}" x2="${x - 12}" y2="${bottom + 16}" stroke="${INK}" stroke-opacity="0.4" stroke-width="2"/>`);
    if (s.start) front.push(caps(600, 694, 'STANDS ON', GREEN, 'middle'), pen.block(600, 702, s.start, { w: 600, size: 19, min: 13, lines: 2, weight: 700, fill: GREEN, recall: true }).svg);
    if (s.hook.at >= 0) {
      const y = fy(s.hook.at) + fh / 2;
      const h = pen.measure(s.hook.text, { w: 192, size: 19, min: 14, lines: 5, weight: 600 }).h + 28;
      front.push(hookBox(pen, { x: 40, y: clamp(y - h / 2, 110, 780 - h), w: 252, lines: 5, text: s.hook.text, to: { x: L, y } }));
    }
    return [...back, ...mid, ...front].join('');
  },
};

// ─── drawing kit ─────────────────────────────────────────────────────────────

function frame(pen, title, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 800" width="1200" height="800" font-family="${FONT}">`
    + `<rect width="1200" height="800" fill="${PAPER}"/>`
    + `<defs>${marker('ah', INK)}${marker('ah-v', VIOLET)}${marker('ah-r', RED)}${marker('ah-g', GREEN)}</defs>`
    + pen.text(48, 62, title, { w: 1100, size: 36, min: 24, lines: 1, weight: 700, anchor: 'start' })
    + body
    + '</svg>';
}

const marker = (id, fill) => `<marker id="${id}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${fill}"/></marker>`;

const box = (x, y, w, h, color) => `<rect x="${r1(x)}" y="${r1(y)}" width="${r1(w)}" height="${r1(h)}" rx="10" fill="${PAPER}" stroke="${INK}" stroke-width="2.5"/><rect x="${r1(x)}" y="${r1(y)}" width="${r1(w)}" height="${r1(h)}" rx="10" fill="${color}" fill-opacity="0.14"/>`;

const caps = (x, y, word, fill, anchor) => `<text x="${r1(x)}" y="${r1(y)}" font-size="13" font-weight="700" letter-spacing="2" fill="${fill}" text-anchor="${anchor}">${word}</text>`;

/** A crate on the belt with the input/output written above it. */
function crate(pen, x, belt, text, color, word) {
  return `<rect x="${x - 50}" y="${belt - 54}" width="100" height="54" rx="4" fill="${PAPER}" stroke="${INK}" stroke-width="2.5"/><rect x="${x - 50}" y="${belt - 54}" width="100" height="54" rx="4" fill="${color}" fill-opacity="0.25"/><line x1="${x - 50}" y1="${belt - 27}" x2="${x + 50}" y2="${belt - 27}" stroke="${INK}" stroke-opacity="0.4" stroke-width="2"/>`
    + caps(x, belt - 70, word, color, 'middle')
    + pen.block(x, belt - 84, text, { w: 124, size: 19, min: 13, lines: 5, weight: 700, fill: color, recall: true, valign: 'bottom' }).svg;
}

/** A flag on the road with the start/end written above it. */
function flag(pen, x, y, text, color, word) {
  return `<line x1="${x}" y1="${r1(y)}" x2="${x}" y2="${r1(y - 70)}" stroke="${INK}" stroke-width="3"/><path d="M${x},${r1(y - 70)} l40,12 l-40,12 z" fill="${color}"/>`
    + caps(x, y - 84, word, color, 'middle')
    + pen.block(x, y - 96, text, { w: 140, size: 19, min: 13, lines: 5, weight: 700, fill: color, recall: true, valign: 'bottom' }).svg;
}

/**
 * The memory hook: an ochre callout with a bolt. Tied to its step by a dashed leader (`to`) where the path is
 * clear, otherwise by a matching bolt drawn on the step itself.
 */
function hookBox(pen, { x, y, w, lines, text, to }) {
  const t = pen.block(x + 50, y + 14, text, { w: w - 66, size: 19, min: 14, lines, weight: 600, anchor: 'start' });
  const h = t.h + 28;
  const from = to && { x: clamp(to.x, x + 20, x + w - 20), y: to.y < y ? y : to.y > y + h ? y + h : y + h / 2 };
  return (to ? `<path d="M${r1(from.x)},${r1(from.y)} L${r1(to.x)},${r1(to.y)}" stroke="${OCHRE}" stroke-width="2.5" stroke-dasharray="6 5"/><circle cx="${r1(to.x)}" cy="${r1(to.y)}" r="5" fill="${OCHRE}"/>` : '')
    + `<rect x="${r1(x)}" y="${r1(y)}" width="${w}" height="${r1(h)}" rx="12" fill="${PAPER}" stroke="${OCHRE}" stroke-width="2.5"/><rect x="${r1(x)}" y="${r1(y)}" width="${w}" height="${r1(h)}" rx="12" fill="${OCHRE}" fill-opacity="0.16"/>`
    + `<path d="M${r1(x + 28)},${r1(y + h / 2 - 16)} ${BOLT}" fill="${OCHRE}" stroke="${INK}" stroke-width="1.5" stroke-linejoin="round"/>`
    + t.svg;
}

const BOLT = 'l-10,18 h9 l-5,14 l14,-20 h-9 l6,-12 z';
const bolt = (x, y) => `<circle cx="${r1(x)}" cy="${r1(y)}" r="17" fill="${PAPER}" stroke="${OCHRE}" stroke-width="2.5"/><path d="M${r1(x + 2)},${r1(y - 16)} ${BOLT}" fill="${OCHRE}" stroke="${INK}" stroke-width="1.2" stroke-linejoin="round" transform="translate(0 2)"/>`;
const cross = (x, y) => `<circle cx="${r1(x)}" cy="${r1(y)}" r="13" fill="${RED}"/><path d="M${r1(x - 5)},${r1(y - 5)} l10,10 m0,-10 l-10,10" stroke="${PAPER}" stroke-width="3" stroke-linecap="round"/>`;

// ─── text ────────────────────────────────────────────────────────────────────

// Average glyph width as a share of font size. An estimate: the browser layout check measures for real.
const GLYPH = { regular: 0.5, bold: 0.56 };

/**
 * Wrap text into at most `lines` lines of width `w`, shrinking from `size` to `min`.
 * Last resort: cut with an ellipsis and report it.
 * O(words × sizes).
 */
export function fit(text, w, { size = 20, min = 12, lines = 2, bold = false } = {}) {
  const words = String(text).trim().split(/\s+/).filter(Boolean);
  const per = (s) => Math.max(1, Math.floor(w / (s * (bold ? GLYPH.bold : GLYPH.regular))));
  for (let s = size; s >= min; s--) {
    const out = wrap(words, per(s));
    if (out.length <= lines && out.every((l) => l.length <= per(s))) return { lines: out, size: s, cut: false };
  }
  const p = per(min);
  const out = wrap(words.flatMap((wd) => wd.match(new RegExp(`.{1,${p}}`, 'gu')) ?? []), p);
  if (out.length > lines) {
    out.length = lines;
    out[lines - 1] = `${out[lines - 1].slice(0, Math.max(1, p - 1))}…`;
  }
  return { lines: out, size: min, cut: true };
}

function wrap(words, per) {
  const out = [];
  let cur = '';
  for (const w of words) {
    if (cur && `${cur} ${w}`.length > per) { out.push(cur); cur = w; } else cur = cur ? `${cur} ${w}` : w;
  }
  if (cur) out.push(cur);
  return out;
}

function makePen() {
  const issues = [];
  const LH = 1.22;
  const layout = (str, o) => {
    const f = fit(str, o.w, { size: o.size, min: o.min ?? 12, lines: o.lines ?? 2, bold: (o.weight ?? 400) >= 600 });
    if (f.cut) issues.push(`"${str}" is too long to fit; use fewer words`);
    return { ...f, step: f.size * LH, h: f.lines.length * f.size * LH };
  };
  const draw = (x, firstBaseline, f, o) => {
    const attrs = [
      `x="${r1(x)}"`, `y="${r1(firstBaseline)}"`, `font-size="${f.size}"`,
      `fill="${o.fill ?? INK}"`, `text-anchor="${o.anchor ?? 'middle'}"`,
      o.weight && o.weight !== 400 ? `font-weight="${o.weight}"` : '',
      o.italic ? 'font-style="italic"' : '',
      o.recall ? 'data-recall="true"' : '',
    ].filter(Boolean).join(' ');
    // Each line but the last keeps a trailing space so textContent reads as words, not "Electrontransport".
    const inner = f.lines.length === 1
      ? esc(f.lines[0])
      : f.lines.map((l, i) => `<tspan x="${r1(x)}"${i ? ` dy="${r1(f.step)}"` : ''}>${esc(l)}${i < f.lines.length - 1 ? ' ' : ''}</tspan>`).join('');
    return `<text ${attrs}>${inner}</text>`;
  };
  return {
    issues,
    measure: (str, o) => (str ? layout(str, o) : { h: 0, lines: [] }),
    /** Text block centred vertically on cy. */
    text(x, cy, str, o) {
      if (!str) return '';
      const f = layout(str, o);
      return draw(x, cy - f.h / 2 + f.size * 0.86, f, o);
    },
    /** Text block hung from y (valign top) or stacked up to y (valign bottom). */
    block(x, y, str, o) {
      if (!str) return { svg: '', h: 0 };
      const f = layout(str, o);
      const top = o.valign === 'bottom' ? y - f.h : y;
      return { svg: draw(x, top + f.size * 0.86, f, o), h: f.h };
    },
    /** A number badge: bold paper text on an ink pill centred on (x, cy). A recall label: numbers are what tests ask. */
    stat(x, cy, str, o = {}) {
      if (!str) return '';
      const max = o.w ?? 160;
      const f = layout(str, { w: max - 18, size: o.size ?? 19, min: 12, lines: 1, weight: 700 });
      const w = Math.min(max, f.lines[0].length * f.size * GLYPH.bold + 20), h = f.size + 12;
      return `<rect x="${r1(x - w / 2)}" y="${r1(cy - h / 2)}" width="${r1(w)}" height="${r1(h)}" rx="${r1(h / 2)}" fill="${INK}"/>`
        + draw(x, cy - f.h / 2 + f.size * 0.86, f, { weight: 700, fill: PAPER, recall: true });
    },
    /** Centred text on a paper pill, for labels that sit on lines or roads. */
    pill(x, cy, str, o) {
      if (!str) return '';
      const f = layout(str, o);
      const w = Math.min(o.w, Math.max(...f.lines.map((l) => l.length)) * f.size * GLYPH.regular) + 16;
      return `<rect x="${r1(x - w / 2)}" y="${r1(cy - f.h / 2 - 4)}" width="${r1(w)}" height="${r1(f.h + 8)}" rx="${r1(Math.min(14, (f.h + 8) / 2))}" fill="${PAPER}" fill-opacity="0.95"/>`
        + draw(x, cy - f.h / 2 + f.size * 0.86, f, o);
    },
  };
}
