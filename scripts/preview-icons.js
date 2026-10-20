// Every icon on one sheet, to eyeball them. Usage: node scripts/preview-icons.js [out.png]   (default runs/preview/icons.png)
import { chromium } from 'playwright';
import { ICONS, iconBadge, icon } from '../src/icons.js';
const cols = 10, cell = 110;
const rows = Math.ceil(ICONS.length / cols);
let body = '';
ICONS.forEach((n, i) => { const x = (i % cols) * cell + 55, y = Math.floor(i / cols) * cell + 45;
  body += iconBadge(n, x, y, 30) + `<text x="${x}" y="${y + 50}" font-size="12" text-anchor="middle" font-family="Helvetica">${n}</text>`; });
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${cols*cell}" height="${rows*cell}"><rect width="100%" height="100%" fill="#FBF7EE"/>${body}</svg>`;
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: cols*cell, height: rows*cell } });
await p.setContent(`<body style="margin:0">${svg}</body>`); await p.screenshot({ path: process.argv[2] ?? "runs/preview/icons.png" }); await b.close();
