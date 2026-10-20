import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalize, localGrade, pickBlanks, recordResult, termsMentioned, isDue, dueByPicture } from '../src/recall.js';

test('normalize drops case, accents, punctuation and filler words', () => {
  assert.equal(normalize('The Krebs-Cycle!'), 'krebs cycle');
  assert.equal(normalize('Café'), 'cafe');
});

test('localGrade: exact, slip, unsure, blank', () => {
  assert.equal(localGrade('Mitochondria', 'mitochondria'), 'right');
  assert.equal(localGrade('Mitochondria', 'mitocondria'), 'right');
  assert.equal(localGrade('Electron transport chain', 'the ETC'), 'unsure');
  assert.equal(localGrade('ATP', ''), 'wrong');
});

test('pickBlanks hides about half, at least two, missed labels first', () => {
  const labels = ['a', 'b', 'c', 'd', 'e', 'f'];
  const stats = { e: { right: 0, wrong: 2 }, a: { right: 5, wrong: 0 } };
  const picked = pickBlanks(labels, stats, () => 0);
  assert.equal(picked.length, 3);
  assert.ok(picked.includes(4), 'missed label e is hidden');
  assert.ok(!picked.includes(0), 'well-known label a is not');
  assert.deepEqual(pickBlanks(['x'], {}), [0]);
  assert.deepEqual(pickBlanks([], {}), []);
});

test('recordResult is immutable', () => {
  const s0 = {};
  const s1 = recordResult(s0, 'x', false, 5);
  assert.deepEqual(s0, {});
  assert.deepEqual(recordResult(s1, 'x', true, 9), { x: { right: 1, wrong: 1, box: 1, last: 9 } });
});

test('spaced review: right answers push a label out 1, 3, 7… days; a miss makes it due now', () => {
  const day = 86_400_000, t0 = Date.UTC(2026, 0, 1);
  let s = recordResult({}, 'x', true, t0);
  assert.equal(isDue(s.x, t0 + day - 1), false);
  assert.equal(isDue(s.x, t0 + day), true);
  s = recordResult(s, 'x', true, t0 + day);
  assert.equal(isDue(s.x, t0 + 3 * day), false);
  assert.equal(isDue(s.x, t0 + 4 * day), true);
  s = recordResult(s, 'x', false, t0 + 4 * day);
  assert.equal(isDue(s.x, t0 + 4 * day), true);
  assert.equal(isDue(undefined, t0), false, 'never practised is new, not due');
  const deck = { overview: { svg: '<svg/>' }, ideas: [{ id: 'i1', svg: '<svg/>' }, { id: 'i2', svg: '<svg/>' }], recall: { i2: s, i1: recordResult({}, 'y', true, t0 + 4 * day) } };
  assert.deepEqual(dueByPicture(deck, t0 + 4 * day), [{ key: 'i2', due: 1 }]);
  assert.deepEqual(pickBlanks(['a', 'b', 'c', 'x', 'e', 'f'], s, () => 0, t0 + 4 * day).includes(3), true);
});

test('termsMentioned finds key terms in an explanation, allowing small typos', () => {
  const r = termsMentioned(['Krebs cycle', 'oxaloacetate', 'ATP synthase'], 'The krebs cycle regenerates oxaloacetete each turn, two times per glucose.');
  assert.deepEqual(r.map((x) => x.said), [true, true, false]);
  assert.equal(termsMentioned(['2 turns'], 'it takes two turns')[0].said, true);
});
