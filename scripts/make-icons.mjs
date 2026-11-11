// Erzeugt die App-Icons aus einer SVG-Vorlage: node scripts/make-icons.mjs
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');

const svg = (pad) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<rect width="512" height="512" fill="#16181d"/>
<g transform="translate(256 256) scale(${pad}) translate(-256 -256)">
<path d="M256 70 l40 60 70 -20 -8 72 66 30 -48 54 30 66 -72 6 -22 70 -56 -46 -56 46 -22 -70 -72 -6 30 -66 -48 -54 66 -30 -8 -72 70 20z" fill="#ff7a1a"/>
<circle cx="256" cy="256" r="118" fill="#16181d"/>
<path d="M150 285 q6 -34 40 -40 l28 -34 q8 -9 22 -9 h58 q14 0 24 9 l30 34 q26 6 30 34 v22 h-34 a26 26 0 0 0 -52 0 h-76 a26 26 0 0 0 -52 0 h-18z" fill="#f2f3f5"/>
<path d="M228 244 l20 -26 h46 l22 26z" fill="#16181d"/>
<path d="M206 150 l14 26 28 -30 16 30 28 -30 14 26 -10 28 h-80z" fill="#ffd23f"/>
</g></svg>`;

const browser = await chromium.launch();
for (const [name, size, pad] of [['icon-512', 512, 0.8], ['icon-192', 192, 0.8], ['apple-touch-icon', 180, 0.92]]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<style>body{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${svg(pad)}`);
  await page.screenshot({ path: `public/icons/${name}.png` });
  await page.close();
}
await browser.close();
