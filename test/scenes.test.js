import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DOMParser } from 'linkedom';
import { TEMPLATES, normalizeScene, renderScene, renderOverview, fit } from '../src/scenes.js';
import { cleanSvg, blankOut } from '../src/svg.js';
import { SCENES, STRESS, MAP } from './fixtures/scenes.js';

const clean = (s) => cleanSvg(s, { DOMParser });
const draw = ({ shape, title, scene }) => renderScene(shape, title, normalizeScene(scene, shape));

test('every template draws a clean SVG whose recall labels are the scene\'s terms', () => {
  assert.deepEqual(SCENES.map((s) => s.shape).sort(), [...TEMPLATES].sort());
  for (const fx of SCENES) {
    const { svg: raw, issues } = draw(fx);
    assert.deepEqual(issues, [], `${fx.shape}: nothing cut`);
    const { svg, recall } = clean(raw);
    assert.equal(svg.length > 1000, true);
    const s = fx.scene;
    const expected = [...s.steps.map((st) => st.label), s.start, s.end, s.center].filter(Boolean);
    assert.deepEqual([...recall].sort(), [...expected].sort(), `${fx.shape}: recall labels`);
  }
});

test('multi-line labels read as words, and blank-out hides them whole', () => {
  const { svg } = clean(draw(SCENES.find((s) => s.shape === 'cycle')).svg);
  const { recall } = clean(svg);
  assert.ok(recall.includes('α-Ketoglutarate (5C)'), 'wrapped label keeps its space');
  const hidden = blankOut(svg, [0], { DOMParser });
  assert.ok(hidden.includes('①'));
  assert.equal(clean(hidden).recall.length, recall.length);
});

test('worst-case scenes still fit without cutting words', () => {
  for (const fx of STRESS) assert.deepEqual(draw(fx).issues, [], fx.shape);
});

test('model words are escaped, never markup', () => {
  const scene = structuredClone(SCENES[0].scene);
  scene.steps[0].label = '<script>alert(1)</script> & "x"';
  const { svg: raw } = renderScene('machine', 'T <b>', normalizeScene(scene, 'machine'));
  assert.ok(!raw.includes('<script>'));
  assert.ok(raw.includes('&lt;script&gt;'));
  assert.ok(clean(raw).recall.some((r) => r.startsWith('<script>alert(1)</script> & "x"'.slice(0, 10))));
});

test('fit shrinks before it wraps further, and cuts only as a last resort', () => {
  assert.deepEqual(fit('Krebs cycle', 400, { size: 22 }), { lines: ['Krebs cycle'], size: 22, cut: false });
  const wrapped = fit('one two three four five six', 100, { size: 20, min: 14, lines: 3 });
  assert.equal(wrapped.cut, false);
  assert.ok(wrapped.lines.length <= 3);
  const cut = fit('pneumonoultramicroscopicsilicovolcanoconiosis is long', 60, { size: 20, min: 14, lines: 2 });
  assert.equal(cut.cut, true);
  assert.equal(cut.lines.length, 2);
  assert.ok(cut.lines[1].endsWith('…'));
});

test('a word too long to fit is reported so a redraw can shorten it', () => {
  const scene = structuredClone(SCENES[0].scene);
  scene.steps[0].label = 'Supercalifragilisticexpialidociousness';
  scene.steps.push(...structuredClone(scene.steps), ...structuredClone(scene.steps));
  const { issues } = renderScene('machine', 'T', normalizeScene(scene, 'machine'));
  assert.ok(issues.some((i) => i.includes('Supercalifragilistic') && i.includes('fewer words')));
});

test('normalizeScene rejects what can\'t be drawn and clamps the rest', () => {
  const ok = SCENES[0].scene;
  assert.equal(normalizeScene(ok, 'scene'), null, 'not a template shape');
  assert.equal(normalizeScene({ ...ok, steps: [ok.steps[0]] }, 'machine'), null, 'one step is not a picture');
  assert.equal(normalizeScene(null, 'machine'), null);
  const many = { ...ok, steps: Array.from({ length: 12 }, (_, i) => ({ label: `s${i}`, note: '', handoff: '' })) };
  assert.equal(normalizeScene(many, 'machine').steps.length, 6);
  assert.equal(normalizeScene(many, 'cycle').steps.length, 7);
  const odd = normalizeScene({ ...ok, hook: { at: 99, text: 'x' }, pitfall: { after: 7, text: 'y' } }, 'journey');
  assert.equal(odd.hook.at, 0, 'bad hook index falls back to the first step');
  assert.equal(odd.pitfall.after, -1, 'bad pitfall index drops the pitfall');
  assert.equal(normalizeScene({ ...ok, hook: { at: 1, text: '' } }, 'machine').hook.at, -1, 'empty hook is no hook');
});

test('the overview is drawn from the map: ideas in order, titles as recall labels', () => {
  const { svg: raw, issues } = renderOverview(MAP);
  assert.deepEqual(issues, []);
  const { recall } = clean(raw);
  assert.deepEqual(recall, MAP.ideas.map((i) => i.title));
});
