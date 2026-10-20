// SVG → <img> URL and SVG → PNG. Browser only.

export const svgUrl = (svg) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

/** Rasterize at the SVG's own size (1200×800 by default). Returns base64 PNG without the data: prefix. */
export async function rasterize(svg, scale = 1) {
  const img = new Image();
  img.src = svgUrl(svg);
  await img.decode();
  const w = img.naturalWidth || 1200;
  const h = img.naturalHeight || 800;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#FBF7EE';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return { mediaType: 'image/png', data: canvas.toDataURL('image/png').split(',', 2)[1] };
}

export function download(name, data, type) {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const pngBlob = (b64) => new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], { type: 'image/png' });

/**
 * Layout problems in the rendered picture: labels that overlap each other or run off the canvas.
 * Renders the (already cleaned) SVG in a detached, hidden container, measures every <text>, removes it.
 * O(n²) over labels — fine for the ~10–40 labels a picture has.
 */
export async function findLayoutIssues(svg, doc = document) {
  const host = doc.createElement('div');
  host.style.cssText = 'position:fixed;left:-10000px;top:0;width:1200px;height:800px;visibility:hidden;pointer-events:none';
  const parsed = new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement;
  host.append(doc.importNode(parsed, true));
  doc.body.append(host);
  try {
    const root = host.firstElementChild;
    root.setAttribute('width', '1200');
    root.setAttribute('height', '800');
    const frame = root.getBoundingClientRect();
    const labels = [...root.querySelectorAll('text')]
      .map((t) => ({ text: t.textContent.trim(), r: t.getBoundingClientRect() }))
      .filter((l) => l.text && l.r.width > 0);
    const issues = [];
    for (const l of labels) {
      if (l.r.left < frame.left - 2 || l.r.right > frame.right + 2 || l.r.top < frame.top - 2 || l.r.bottom > frame.bottom + 2) issues.push(`"${l.text}" runs off the edge`);
    }
    for (let i = 0; i < labels.length; i++) {
      for (let j = i + 1; j < labels.length; j++) {
        const a = labels[i].r, b = labels[j].r;
        const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        // Overlap must cover a real share of the smaller label; touching descenders don't count.
        if (w > 0 && h > 0 && w * h > 0.15 * Math.min(a.width * a.height, b.width * b.height)) issues.push(`"${labels[i].text}" overlaps "${labels[j].text}"`);
      }
    }
    // Text hidden under a solid shape painted after it (later in document order = on top).
    const all = [...root.querySelectorAll('*')];
    const solids = all
      .filter((el) => ['rect', 'circle', 'ellipse', 'polygon'].includes(el.localName))
      .map((el) => ({ el, i: all.indexOf(el), cs: getComputedStyle(el) }))
      .filter(({ cs }) => cs.fill !== 'none' && Number(cs.fillOpacity) * Number(cs.opacity) > 0.6);
    for (const t of root.querySelectorAll('text')) {
      const text = t.textContent.trim();
      const r = t.getBoundingClientRect();
      if (!text || !r.width) continue;
      const ti = all.indexOf(t);
      const cover = solids.find(({ el, i }) => {
        if (i < ti || el.closest('text')) return false;
        const s = el.getBoundingClientRect();
        if (s.width >= frame.width * 0.95 && s.height >= frame.height * 0.95) return false; // a background panel
        const w = Math.min(r.right, s.right) - Math.max(r.left, s.left);
        const h = Math.min(r.bottom, s.bottom) - Math.max(r.top, s.top);
        return w > 0 && h > 0 && w * h > 0.3 * r.width * r.height;
      });
      if (cover) issues.push(`"${text}" is hidden under a shape drawn on top of it`);
    }
    return issues.slice(0, 8);
  } finally {
    host.remove();
  }
}
