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
