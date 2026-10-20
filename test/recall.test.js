import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalize, localGrade, pickBlanks, recordResult } from '../src/recall.js';

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
  const s1 = recordResult(s0, 'x', false);
  assert.deepEqual(s0, {});
  assert.deepEqual(recordResult(s1, 'x', true), { x: { right: 1, wrong: 1 } });
});
