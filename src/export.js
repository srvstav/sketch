// Deck export/import. Pure: no DOM except the injected cleaner on import.

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const slug = (s) => String(s || 'sketch').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 60) || 'sketch';

/** A single printable HTML file: every picture with its caption, hook and questions. SVGs are already cleaned. */
export function deckToHtml(deck) {
  const items = [
    ...(deck.overview?.svg ? [{ n: 0, title: 'The big picture', svg: deck.overview.svg, caption: deck.overview.caption, hook: '', questions: [] }] : []),
    ...deck.ideas.filter((i) => i.svg),
  ];
  const sections = items.map((i) => `
<section>
  <h2><span>${i.n || '★'}</span> ${esc(i.title)}</h2>
  <figure>${i.svg}</figure>
  ${i.caption ? `<p class="cap">${esc(i.caption)}</p>` : ''}
  ${i.hook ? `<p class="hook"><b>Hook</b> ${esc(i.hook)}</p>` : ''}
  ${i.questions?.length ? `<details><summary>Test yourself (${i.questions.length})</summary><ol>${i.questions.map((q) => `<li>${esc(q.q)}<br><i>${esc(q.answer)}</i></li>`).join('')}</ol></details>` : ''}
</section>`).join('\n');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(deck.title)} — sketch</title>
<style>
body{margin:0;background:#F3EDE1;color:#1B1A17;font:17px/1.5 Georgia,serif}
main{max-width:980px;margin:0 auto;padding:32px 16px}
h1{font-size:44px;line-height:1.05;margin:0 0 4px}
.sub{margin:0 0 32px;color:#5b564c}
section{break-inside:avoid;page-break-after:always;margin:0 0 56px}
h2{font-size:26px;margin:0 0 12px}h2 span{color:#E4472B}
figure{margin:0;background:#FBF7EE;border:1px solid #d9d1c1}figure svg{display:block;width:100%;height:auto}
.cap{font-size:20px;margin:12px 0 4px}.hook b{color:#E4472B}
details{margin-top:8px}li{margin:6px 0}i{color:#5b564c}
</style></head><body><main>
<h1>${esc(deck.title)}</h1><p class="sub">${esc(deck.subject)}</p>
${sections}
</main></body></html>`;
}

export function deckToJson(deck) {
  return JSON.stringify({ sketch: 1, deck: { ...deck, recall: {} } });
}

/** Parse a shared deck and re-clean every picture: imported files are untrusted. */
export function deckFromJson(text, clean) {
  const parsed = JSON.parse(text);
  if (parsed?.sketch !== 1 || !Array.isArray(parsed.deck?.ideas)) throw new Error('Not an sketch deck file.');
  const d = parsed.deck;
  const pic = (p) => {
    if (!p?.svg) return { svg: null, recall: [] };
    try { return clean(p.svg); } catch { return { svg: null, recall: [] }; }
  };
  const str = (v) => String(v ?? '');
  return {
    id: `d${Date.now().toString(36)}`,
    created: new Date().toISOString(),
    title: str(d.title) || 'Shared deck',
    subject: str(d.subject),
    focus: str(d.focus),
    sourceNames: (d.sourceNames ?? []).map(str),
    model: str(d.model),
    passAt: Number(d.passAt) || 0.8,
    links: (d.links ?? []).map((l) => ({ from: str(l.from), to: str(l.to), label: str(l.label) })),
    overview: d.overview?.svg ? { ...pic(d.overview), caption: str(d.overview.caption), hook: str(d.overview.hook) } : null,
    ideas: d.ideas.map((i, n) => ({
      id: str(i.id) || `i${n + 1}`,
      n: n + 1,
      title: str(i.title),
      core: str(i.core),
      shape: str(i.shape),
      why_shape: str(i.why_shape),
      key_terms: (i.key_terms ?? []).map(str),
      questions: (i.questions ?? []).map((q) => ({ q: str(q.q), answer: str(q.answer) })),
      ...pic(i),
      caption: str(i.caption),
      hook: str(i.hook),
      score: Number(i.score) || 0,
      rounds: [],
    })),
    recall: {},
    imported: true,
  };
}
