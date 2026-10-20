import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DOMParser } from 'linkedom';
import { cleanSvg, blankOut, extractSvg } from '../src/svg.js';

const dom = { DOMParser };
const pic = (inner) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 800"><rect width="1200" height="800" fill="#FBF7EE"/>${inner}</svg>`;

test('extracts svg from a code fence', () => {
  assert.equal(extractSvg('```svg\n<svg></svg>\n```'), '<svg></svg>');
  assert.equal(extractSvg('no picture'), null);
});

test('keeps drawing elements and recall labels in order', () => {
  const { svg, recall } = cleanSvg(pic('<text data-recall="true" x="1" y="2">Mitochondria</text><circle r="3"/><text>Plain</text><text data-recall="true">ATP</text>'), dom);
  assert.deepEqual(recall, ['Mitochondria', 'ATP']);
  assert.match(svg, /<circle/);
  assert.match(svg, /Plain/);
});

test('strips scripts, foreignObject, images, event handlers and remote refs', () => {
  const dirty = pic(`
    <script>alert(1)</script>
    <foreignObject><div>x</div></foreignObject>
    <image href="https://evil.example/x.png"/>
    <rect onload="alert(1)" width="5" fill="url(https://evil.example/#a)"/>
    <use href="https://evil.example/s.svg#a"/>
    <use href="#ok"/>
    <a href="javascript:alert(1)"><text>link</text></a>
    <path style="fill:url(#grad)" d="M0 0"/>
    <!-- comment -->`);
  const { svg } = cleanSvg(dirty, dom);
  for (const bad of ['script', 'foreignObject', '<image', 'onload', 'evil.example', 'javascript:', '<a ', 'comment']) {
    assert.ok(!svg.includes(bad), `still contains ${bad}: ${svg}`);
  }
  assert.match(svg, /href="#ok"/);
  assert.match(svg, /url\(#grad\)/);
});

test('rejects non-svg', () => {
  assert.throws(() => cleanSvg('<div>hi</div>', dom), /No SVG/);
});

test('blankOut hides chosen labels with numbered marks', () => {
  const { svg } = cleanSvg(pic('<text data-recall="true">One</text><text data-recall="true">Two</text><text data-recall="true">Three</text>'), dom);
  const out = blankOut(svg, [0, 2], dom);
  assert.ok(!out.includes('>One<') && !out.includes('Three'));
  assert.match(out, /Two/);
  assert.match(out, /①/);
  assert.match(out, /②/);
});
