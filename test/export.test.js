import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DOMParser } from 'linkedom';
import { deckToHtml, deckToJson, deckFromJson, slug } from '../src/export.js';
import { cleanSvg } from '../src/svg.js';

const clean = (s) => cleanSvg(s, { DOMParser });
const deck = {
  id: 'd1', title: 'Cells <b>', subject: 'Bio', passAt: 0.8, links: [], overview: null, recall: { i1: { x: { right: 1, wrong: 0 } } },
  ideas: [{ id: 'i1', n: 1, title: 'Resp & co', core: 'c', shape: 'machine', why_shape: 'w', key_terms: [], questions: [{ q: 'Why <x>?', answer: 'y' }], svg: '<svg xmlns="http://www.w3.org/2000/svg"><text data-recall="true">ATP</text></svg>', recall: ['ATP'], caption: 'cap', hook: 'h', score: 1 }],
};

test('html export escapes text and keeps pictures', () => {
  const html = deckToHtml(deck);
  assert.match(html, /Cells &lt;b&gt;/);
  assert.match(html, /Why &lt;x&gt;\?/);
  assert.match(html, /Resp &amp; co/);
  assert.match(html, /<svg/);
});

test('json round-trip drops recall history and re-cleans pictures', () => {
  const evil = JSON.parse(deckToJson(deck));
  evil.deck.ideas[0].svg = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><text data-recall="true">ATP</text></svg>';
  const back = deckFromJson(JSON.stringify(evil), clean);
  assert.ok(!back.ideas[0].svg.includes('script'));
  assert.deepEqual(back.ideas[0].recall, ['ATP']);
  assert.deepEqual(back.recall, {});
  assert.notEqual(back.id, 'd1');
  assert.throws(() => deckFromJson('{"x":1}', clean), /Not an sketch deck/);
});

test('slug', () => {
  assert.equal(slug('The Krebs Cycle!'), 'the-krebs-cycle');
  assert.equal(slug(''), 'sketch');
});
