// Small pictograms sketch draws on each step, picked by name by the model.
// Each is drawn in a 48×48 box centred on 0,0 (content within ±20), ink strokes with one accent fill.
// Names are plain nouns a model can pick without seeing them; keep them stable, they are part of the scene schema.

const INK = '#1B1A17', RED = '#E4472B', BLUE = '#2B6CB0', GREEN = '#2F855A', OCHRE = '#D69E2E', VIOLET = '#6B46C1', PAPER = '#FBF7EE';
const S = `stroke="${INK}" stroke-width="2.5"`;
const F = (c, o = 1) => `fill="${c}"${o < 1 ? ` fill-opacity="${o}"` : ''}`;
const N = 'fill="none"';

/** name → [what it can stand for (shown to the model), SVG fragment] */
const SET = {
  battery: ['energy store, charge, ATP', `<rect x="-16" y="-10" width="28" height="20" rx="3" ${F(PAPER)} ${S}/><rect x="12" y="-4" width="5" height="8" rx="1" ${F(INK)}/><rect x="-12" y="-6" width="6" height="12" ${F(GREEN)}/><rect x="-4" y="-6" width="6" height="12" ${F(GREEN)}/><rect x="4" y="-6" width="5" height="12" ${F(GREEN, 0.35)}/>`],
  flame: ['heat, burning, reaction, passion', `<path d="M0,-19 C8,-9 14,-3 14,6 C14,14 8,19 0,19 C-8,19 -14,14 -14,6 C-14,-2 -8,-6 -6,-12 C-3,-6 -2,-3 0,-1 C2,-6 2,-12 0,-19 Z" ${F(RED)} ${S} stroke-linejoin="round"/><path d="M0,6 C4,9 5,12 3,16 C1,18 -3,18 -4,15 C-5,12 -2,10 0,6 Z" ${F(OCHRE)}/>`],
  drop: ['water, liquid, blood, solution', `<path d="M0,-19 C6,-9 14,-1 14,7 C14,15 8,19 0,19 C-8,19 -14,15 -14,7 C-14,-1 -6,-9 0,-19 Z" ${F(BLUE, 0.85)} ${S} stroke-linejoin="round"/><path d="M-7,6 C-7,11 -4,14 0,14" ${N} stroke="${PAPER}" stroke-width="2.5" stroke-linecap="round"/>`],
  scissors: ['split, cut, divide, break apart', `<circle cx="-9" cy="12" r="6" ${F(RED)} ${S}/><circle cx="9" cy="12" r="6" ${F(RED)} ${S}/><line x1="-5" y1="7" x2="10" y2="-18" ${S} stroke-linecap="round"/><line x1="5" y1="7" x2="-10" y2="-18" ${S} stroke-linecap="round"/><circle cx="0" cy="-1" r="2" ${F(INK)}/>`],
  gear: ['process, mechanism, enzyme, system', `<path d="M-3,-19 h6 l1,6 l4,2 l5,-4 l4,4 l-4,5 l2,4 l6,1 v6 l-6,1 l-2,4 l4,5 l-4,4 l-5,-4 l-4,2 l-1,6 h-6 l-1,-6 l-4,-2 l-5,4 l-4,-4 l4,-5 l-2,-4 l-6,-1 v-6 l6,-1 l2,-4 l-4,-5 l4,-4 l5,4 l4,-2 Z" ${F(OCHRE, 0.8)} ${S} stroke-linejoin="round"/><circle r="6" ${F(PAPER)} ${S}/>`],
  factory: ['production, industry, making, synthesis', `<path d="M-19,18 V-2 l10,-7 v7 l10,-7 v7 l10,-7 V18 Z" ${F(BLUE, 0.3)} ${S} stroke-linejoin="round"/><rect x="11" y="-18" width="7" height="36" ${F(PAPER)} ${S}/><rect x="-14" y="6" width="6" height="6" ${F(OCHRE)}/><rect x="-3" y="6" width="6" height="6" ${F(OCHRE)}/>`],
  chain: ['link, bond, connection, joining', `<rect x="-19" y="-7" width="22" height="14" rx="7" ${N} ${S} transform="rotate(-30)"/><rect x="-3" y="-7" width="22" height="14" rx="7" ${N} stroke="${VIOLET}" stroke-width="3" transform="rotate(-30)"/>`],
  magnet: ['attraction, pull, force, charge', `<path d="M-14,-16 V2 A14,14 0 0 0 14,2 V-16 H6 V2 A6,6 0 0 1 -6,2 V-16 Z" ${F(RED)} ${S} stroke-linejoin="round"/><rect x="-14" y="-16" width="8" height="7" ${F(PAPER)} ${S}/><rect x="6" y="-16" width="8" height="7" ${F(PAPER)} ${S}/>`],
  key: ['key factor, unlock, solution, access', `<circle cx="-9" cy="0" r="9" ${F(OCHRE)} ${S}/><circle cx="-11" cy="0" r="3" ${F(PAPER)} ${S}/><path d="M0,0 H19 M13,0 v7 M18,0 v5" ${N} ${S} stroke-linecap="round"/>`],
  lock: ['blocked, security, inhibition, closed', `<path d="M-9,-3 V-10 A9,9 0 0 1 9,-10 V-3" ${N} ${S}/><rect x="-14" y="-3" width="28" height="21" rx="4" ${F(OCHRE)} ${S}/><circle cy="6" r="3" ${F(INK)}/><line x1="0" y1="6" x2="0" y2="12" ${S}/>`],
  door: ['entry, exit, gate, opportunity, membrane channel', `<rect x="-12" y="-19" width="24" height="38" rx="2" ${F(PAPER)} ${S}/><path d="M-12,-19 L4,-14 V19 L-12,19 Z" ${F(BLUE, 0.45)} ${S} stroke-linejoin="round"/><circle cx="0" cy="2" r="2" ${F(INK)}/>`],
  clock: ['time, rate, timing, period, age', `<circle r="18" ${F(PAPER)} ${S}/><path d="M0,-11 V0 L8,5" ${N} ${S} stroke-linecap="round" stroke-linejoin="round"/><circle r="2" ${F(RED)}/>`],
  coin: ['money, cost, price, payment, profit', `<ellipse cx="0" cy="5" rx="17" ry="8" ${F(OCHRE)} ${S}/><ellipse cx="0" cy="-3" rx="17" ry="8" ${F(OCHRE)} ${S}/><ellipse cx="0" cy="-3" rx="9" ry="3.5" ${N} stroke="${INK}" stroke-width="1.5"/>`],
  heart: ['love, health, heart, care, blood flow', `<path d="M0,17 C-14,7 -19,-1 -19,-8 C-19,-15 -13,-19 -8,-19 C-4,-19 -1,-16 0,-13 C1,-16 4,-19 8,-19 C13,-19 19,-15 19,-8 C19,-1 14,7 0,17 Z" ${F(RED)} ${S} stroke-linejoin="round"/>`],
  brain: ['thinking, mind, memory, nervous system', `<path d="M0,-16 C-4,-20 -12,-19 -13,-13 C-19,-12 -20,-4 -16,0 C-20,4 -17,12 -11,12 C-9,18 -2,18 0,14 C2,18 9,18 11,12 C17,12 20,4 16,0 C20,-4 19,-12 13,-13 C12,-19 4,-20 0,-16 Z" ${F('#F4B6C2')} ${S} stroke-linejoin="round"/><path d="M0,-16 V14 M-8,-6 C-4,-4 -4,2 -9,4 M8,-6 C4,-4 4,2 9,4" ${N} stroke="${INK}" stroke-width="2" stroke-linecap="round"/>`],
  eye: ['see, observe, light detection, evidence', `<path d="M-19,0 C-10,-12 10,-12 19,0 C10,12 -10,12 -19,0 Z" ${F(PAPER)} ${S} stroke-linejoin="round"/><circle r="7" ${F(BLUE)} ${S}/><circle r="3" ${F(INK)}/>`],
  book: ['knowledge, law, text, record, theory', `<path d="M0,-12 C-6,-16 -13,-16 -19,-14 V14 C-13,12 -6,12 0,16 C6,12 13,12 19,14 V-14 C13,-16 6,-16 0,-12 Z" ${F(PAPER)} ${S} stroke-linejoin="round"/><path d="M0,-12 V16" ${S}/><path d="M-14,-7 h9 M-14,-1 h9 M5,-7 h9 M5,-1 h9" stroke="${BLUE}" stroke-width="2" stroke-linecap="round"/>`],
  person: ['a person, individual, role, worker', `<circle cy="-11" r="7" ${F(OCHRE)} ${S}/><path d="M-14,18 C-14,4 -8,-1 0,-1 C8,-1 14,4 14,18 Z" ${F(BLUE)} ${S} stroke-linejoin="round"/>`],
  people: ['group, society, population, team, voters', `<circle cx="-9" cy="-9" r="6" ${F(OCHRE)} ${S}/><circle cx="9" cy="-9" r="6" ${F(OCHRE)} ${S}/><path d="M-20,16 C-20,4 -15,0 -9,0 C-3,0 2,4 2,16 Z" ${F(BLUE)} ${S} stroke-linejoin="round"/><path d="M-2,16 C-2,4 3,0 9,0 C15,0 20,4 20,16 Z" ${F(GREEN)} ${S} stroke-linejoin="round"/>`],
  leaf: ['plant, growth, nature, photosynthesis', `<path d="M-16,16 C-18,-6 -4,-18 18,-18 C18,4 6,18 -16,16 Z" ${F(GREEN)} ${S} stroke-linejoin="round"/><path d="M-16,16 L10,-10 M-6,6 h8 M-1,1 v-8" ${N} stroke="${PAPER}" stroke-width="2" stroke-linecap="round"/>`],
  sun: ['light, energy source, day, warmth', `<circle r="9" ${F(OCHRE)} ${S}/><path d="M0,-19 v5 M0,14 v5 M-19,0 h5 M14,0 h5 M-13,-13 l4,4 M9,9 l4,4 M-13,13 l4,-4 M9,-9 l4,-4" ${S} stroke-linecap="round"/>`],
  cloud: ['gas, weather, air, uncertainty', `<path d="M-12,12 C-19,12 -20,2 -13,0 C-14,-9 -3,-13 2,-7 C6,-14 17,-11 15,-2 C21,-1 21,12 13,12 Z" ${F(PAPER)} ${S} stroke-linejoin="round"/><path d="M-8,16 l-2,4 M0,16 l-2,4 M8,16 l-2,4" stroke="${BLUE}" stroke-width="2.5" stroke-linecap="round"/>`],
  mountain: ['obstacle, barrier, peak, challenge, land', `<path d="M-20,16 L-6,-10 L1,1 L8,-17 L20,16 Z" ${F(GREEN, 0.55)} ${S} stroke-linejoin="round"/><path d="M8,-17 L4,-8 L8,-10 L12,-8 Z" ${F(PAPER)} stroke="${INK}" stroke-width="1.5" stroke-linejoin="round"/>`],
  house: ['home, shelter, safety, household', `<path d="M-18,-1 L0,-17 L18,-1" ${N} ${S} stroke-linecap="round" stroke-linejoin="round"/><path d="M-13,-4 V17 H13 V-4" ${F(OCHRE, 0.5)} ${S} stroke-linejoin="round"/><rect x="-4" y="5" width="8" height="12" ${F(RED)} ${S}/>`],
  truck: ['transport, carry, delivery, carrier', `<rect x="-19" y="-11" width="22" height="18" rx="2" ${F(BLUE, 0.5)} ${S}/><path d="M3,-5 H12 L18,2 V7 H3 Z" ${F(PAPER)} ${S} stroke-linejoin="round"/><circle cx="-11" cy="10" r="4" ${F(INK)}/><circle cx="11" cy="10" r="4" ${F(INK)}/>`],
  'arrow-up': ['increase, rise, growth, more', `<path d="M0,-19 L16,0 H7 V18 H-7 V0 H-16 Z" ${F(GREEN)} ${S} stroke-linejoin="round"/>`],
  'arrow-down': ['decrease, fall, decline, less', `<path d="M0,19 L16,0 H7 V-18 H-7 V0 H-16 Z" ${F(RED)} ${S} stroke-linejoin="round"/>`],
  chart: ['data, statistics, results, trend', `<path d="M-18,-18 V18 H18" ${N} ${S} stroke-linecap="round"/><rect x="-12" y="4" width="7" height="12" ${F(BLUE)}/><rect x="-2" y="-4" width="7" height="20" ${F(GREEN)}/><rect x="8" y="-12" width="7" height="28" ${F(OCHRE)}/>`],
  scale: ['balance, trade-off, justice, equilibrium', `<path d="M0,-17 V16 M-10,16 H10 M-17,-10 H17" ${N} ${S} stroke-linecap="round"/><path d="M-17,-10 L-22,4 H-12 Z M17,-10 L12,4 H22 Z" ${F(OCHRE, 0.6)} stroke="${INK}" stroke-width="2" stroke-linejoin="round"/><circle cy="-17" r="2.5" ${F(INK)}/>`],
  shield: ['protection, defence, immunity, rights', `<path d="M0,-19 L16,-13 C16,3 10,13 0,19 C-10,13 -16,3 -16,-13 Z" ${F(BLUE)} ${S} stroke-linejoin="round"/><path d="M-6,0 L-1,5 L7,-5" ${N} stroke="${PAPER}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`],
  warning: ['danger, risk, side effect, caution', `<path d="M0,-18 L19,16 H-19 Z" ${F(OCHRE)} ${S} stroke-linejoin="round"/><path d="M0,-6 V5" stroke="${INK}" stroke-width="3" stroke-linecap="round"/><circle cy="10" r="2" ${F(INK)}/>`],
  flask: ['chemistry, experiment, reaction, test', `<path d="M-5,-18 H5 M-4,-18 V-6 L-16,14 C-17,17 -15,18 -13,18 H13 C15,18 17,17 16,14 L4,-6 V-18" ${F(PAPER)} ${S} stroke-linejoin="round"/><path d="M-10,6 H10 L14,15 H-14 Z" ${F(VIOLET, 0.6)}/>`],
  atom: ['particle, atom, physics, electron', `<ellipse rx="19" ry="7" ${N} ${S}/><ellipse rx="19" ry="7" ${N} ${S} transform="rotate(60)"/><ellipse rx="19" ry="7" ${N} ${S} transform="rotate(-60)"/><circle r="4" ${F(RED)}/>`],
  crown: ['power, ruler, authority, best', `<path d="M-18,12 L-18,-10 L-9,0 L0,-15 L9,0 L18,-10 L18,12 Z" ${F(OCHRE)} ${S} stroke-linejoin="round"/><rect x="-18" y="12" width="36" height="5" ${F(INK)}/>`],
  flag: ['nation, goal reached, claim, start', `<path d="M-14,19 V-19" ${S} stroke-linecap="round"/><path d="M-14,-17 C-4,-21 4,-11 16,-15 V3 C4,7 -4,-3 -14,1 Z" ${F(RED)} ${S} stroke-linejoin="round"/>`],
  globe: ['world, global, earth, international', `<circle r="18" ${F(BLUE, 0.35)} ${S}/><ellipse rx="8" ry="18" ${N} ${S}/><path d="M-18,0 H18 M-15,-9 H15 M-15,9 H15" ${N} stroke="${INK}" stroke-width="1.8"/>`],
  hand: ['give, take, help, trade, handover', `<path d="M-10,18 V-2 C-10,-6 -5,-6 -5,-2 V-14 C-5,-18 0,-18 0,-14 V-3 V-16 C0,-20 5,-20 5,-16 V-3 V-12 C5,-16 10,-16 10,-12 V4 C10,12 6,18 -2,18 Z" ${F(OCHRE, 0.6)} ${S} stroke-linejoin="round"/><path d="M-10,2 C-14,-2 -19,1 -15,6 L-10,12" ${N} ${S} stroke-linecap="round"/>`],
  recycle: ['reuse, regenerate, cycle, renew', `<path d="M-4,-16 A16,16 0 0 1 15,2" ${N} stroke="${GREEN}" stroke-width="4" stroke-linecap="round"/><path d="M11,10 A16,16 0 0 1 -14,8" ${N} stroke="${GREEN}" stroke-width="4" stroke-linecap="round"/><path d="M-16,-1 A16,16 0 0 1 -10,-13" ${N} stroke="${GREEN}" stroke-width="4" stroke-linecap="round"/><path d="M10,2 L15,9 L20,2 Z M-18,14 L-14,6 L-9,13 Z M-12,-19 L-6,-12 L-14,-9 Z" ${F(INK)}/>`],
  bulb: ['idea, insight, discovery, invention', `<path d="M-7,8 C-7,3 -14,-1 -14,-7 C-14,-15 -7,-19 0,-19 C7,-19 14,-15 14,-7 C14,-1 7,3 7,8 Z" ${F(OCHRE)} ${S} stroke-linejoin="round"/><path d="M-6,12 H6 M-4,17 H4" ${S} stroke-linecap="round"/>`],
  target: ['goal, aim, precision, receptor', `<circle r="18" ${F(PAPER)} ${S}/><circle r="11" ${F(RED)} ${S}/><circle r="4" ${F(PAPER)} ${S}/>`],
  rocket: ['launch, speed, fast growth, start', `<path d="M0,-19 C8,-12 9,-2 7,8 H-7 C-9,-2 -8,-12 0,-19 Z" ${F(PAPER)} ${S} stroke-linejoin="round"/><circle cy="-6" r="3.5" ${F(BLUE)} ${S}/><path d="M-7,1 L-13,10 L-7,8 Z M7,1 L13,10 L7,8 Z" ${F(RED)} ${S} stroke-linejoin="round"/><path d="M-4,10 L0,19 L4,10 Z" ${F(OCHRE)}/>`],
  explosion: ['burst, war, sudden change, shock', `<path d="M0,-19 L5,-8 L17,-12 L10,-2 L19,5 L7,6 L9,18 L0,9 L-9,18 L-7,6 L-19,5 L-10,-2 L-17,-12 L-5,-8 Z" ${F(OCHRE)} ${S} stroke-linejoin="round"/><circle r="5" ${F(RED)}/>`],
  snowflake: ['cold, freezing, slow, frozen', `<path d="M0,-19 V19 M-16,-9 L16,9 M-16,9 L16,-9 M-4,-15 L0,-11 L4,-15 M-4,15 L0,11 L4,15" ${N} stroke="${BLUE}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`],
  thermometer: ['temperature, heat, fever, measure', `<path d="M-4,6 V-14 A4,4 0 0 1 4,-14 V6 A8,8 0 1 1 -4,6 Z" ${F(PAPER)} ${S} stroke-linejoin="round"/><circle cy="12" r="5" ${F(RED)}/><rect x="-1.5" y="-6" width="3" height="16" ${F(RED)}/>`],
  wave: ['signal, sound, wave, frequency', `<path d="M-19,0 C-15,-12 -11,-12 -7,0 C-3,12 1,12 5,0 C9,-12 13,-12 17,0" ${N} stroke="${VIOLET}" stroke-width="3.5" stroke-linecap="round"/>`],
  magnifier: ['search, detail, investigation, analysis', `<circle cx="-4" cy="-4" r="12" ${F(BLUE, 0.25)} ${S}/><path d="M5,5 L17,17" stroke="${INK}" stroke-width="5" stroke-linecap="round"/>`],
  pencil: ['write, draft, design, plan', `<path d="M-15,15 L-12,4 L8,-16 L16,-8 L-4,12 Z" ${F(OCHRE)} ${S} stroke-linejoin="round"/><path d="M-15,15 L-12,4 L-4,12 Z" ${F(PAPER)} ${S} stroke-linejoin="round"/><path d="M4,-12 L12,-4" ${S}/>`],
  speech: ['speech, argument, communication, claim', `<path d="M-18,-14 H18 V8 H-2 L-10,17 V8 H-18 Z" ${F(PAPER)} ${S} stroke-linejoin="round"/><path d="M-11,-6 H11 M-11,1 H5" stroke="${VIOLET}" stroke-width="2.5" stroke-linecap="round"/>`],
  pump: ['pump, push against, active transport, force', `<rect x="-8" y="-2" width="16" height="20" rx="2" ${F(BLUE, 0.5)} ${S}/><path d="M0,-2 V-14 M-10,-14 H10" ${N} ${S} stroke-linecap="round"/><path d="M8,8 H16 V14" ${N} ${S} stroke-linecap="round"/>`],
  funnel: ['filter, select, narrow down, sort', `<path d="M-18,-15 H18 L4,2 V16 L-4,19 V2 Z" ${F(VIOLET, 0.45)} ${S} stroke-linejoin="round"/>`],
  sword: ['war, conflict, attack, fight', `<path d="M-15,15 L11,-11 L16,-16 L11,-11" ${N} ${S}/><path d="M-14,14 L10,-10 L16,-16 L14,-8 L-12,16 Z" ${F(PAPER)} ${S} stroke-linejoin="round"/><path d="M-14,4 L-4,14" stroke="${OCHRE}" stroke-width="4" stroke-linecap="round"/>`],
  dna: ['genes, heredity, DNA, code', `<path d="M-8,-19 C-8,-8 8,-8 8,0 C8,8 -8,8 -8,19 M8,-19 C8,-8 -8,-8 -8,0 C-8,8 8,8 8,19" ${N} ${S} stroke-linecap="round"/><path d="M-5,-14 H5 M-5,14 H5 M-6,-4 H6 M-6,4 H6" stroke="${RED}" stroke-width="2.5"/>`],
  cell: ['cell, organism, unit, organelle', `<ellipse rx="19" ry="15" ${F(GREEN, 0.35)} ${S}/><circle cx="-3" cy="-1" r="6" ${F(VIOLET, 0.7)} ${S}/><circle cx="9" cy="6" r="2" ${F(INK)}/><circle cx="7" cy="-7" r="1.8" ${F(INK)}/>`],
  stack: ['layers, accumulation, storage, pile', `<path d="M0,-18 L18,-9 L0,0 L-18,-9 Z" ${F(BLUE, 0.6)} ${S} stroke-linejoin="round"/><path d="M-18,-1 L0,8 L18,-1 M-18,7 L0,16 L18,7" ${N} ${S} stroke-linejoin="round"/>`],
};

export const ICONS = Object.keys(SET);

/** One line per icon for prompts: "name (what it can stand for)". */
export const ICON_GUIDE = ICONS.map((n) => `${n} (${SET[n][0]})`).join(', ');

/** An icon drawn at (x, y), `size` px across. Unknown names draw nothing. */
export function icon(name, x, y, size = 48) {
  const it = SET[name];
  if (!it) return '';
  const k = Math.round((size / 48) * 100) / 100;
  return `<g transform="translate(${Math.round(x * 10) / 10} ${Math.round(y * 10) / 10}) scale(${k})">${it[1]}</g>`;
}

/** An icon on a round paper badge with a coloured ring. */
export function iconBadge(name, x, y, r = 26, ring = INK) {
  if (!SET[name]) return '';
  return `<circle cx="${Math.round(x * 10) / 10}" cy="${Math.round(y * 10) / 10}" r="${r}" fill="${PAPER}" stroke="${ring}" stroke-width="2.5"/>${icon(name, x, y, r * 1.55)}`;
}
