// Dev helper: render SVG files (or a URL) to PNG with headless Chromium. Usage: node scripts/shot.mjs out.png file.svg|url [w h]
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const [out, target, w = 1200, h = 800] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
if (/^https?:/.test(target)) await page.goto(target, { waitUntil: 'networkidle' });
else await page.setContent(`<body style="margin:0">${readFileSync(target, 'utf8')}</body>`);
await page.screenshot({ path: out, fullPage: true });
await browser.close();
