// Render every fixture scene (and the overview) to PNG, with the browser layout check, so templates can be eyeballed.
// Usage: node scripts/preview-scenes.js [out dir]   (default runs/preview)
import { chromium } from 'playwright';
import { DOMParser } from 'linkedom';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { renderScene, renderOverview, normalizeScene } from '../src/scenes.js';
import { cleanSvg } from '../src/svg.js';
import { findLayoutIssues } from '../src/render.js';
import { SCENES, STRESS, MAP } from '../test/fixtures/scenes.js';

const out = process.argv[2] ?? join('runs', 'preview');
await mkdir(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
try {
  const jobs = [
    ...SCENES.map(({ shape, title, scene }) => ({ name: shape, ...renderScene(shape, title, normalizeScene(scene, shape)) })),
    ...STRESS.map(({ shape, title, scene }) => ({ name: `stress-${shape}`, ...renderScene(shape, title, normalizeScene(scene, shape)) })),
    { name: 'overview', ...renderOverview(MAP) },
  ];
  for (const { name, svg: raw, issues } of jobs) {
    const { svg, recall } = cleanSvg(raw, { DOMParser });
    await page.setContent('<body></body>');
    const layout = await page.evaluate(findLayoutIssues, svg);
    await page.setContent(`<body style="margin:0"><img id="p" src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}" width="1200" height="800"></body>`);
    await page.locator('#p').evaluate((img) => img.decode());
    await page.screenshot({ path: join(out, `${name}.png`), clip: { x: 0, y: 0, width: 1200, height: 800 } });
    await writeFile(join(out, `${name}.svg`), svg);
    console.log(`${name.padEnd(9)} recall ${recall.length} · cut ${issues.length} · layout ${layout.length}${[...issues, ...layout].map((i) => `\n    ${i}`).join('')}`);
  }
} finally {
  await browser.close();
}
