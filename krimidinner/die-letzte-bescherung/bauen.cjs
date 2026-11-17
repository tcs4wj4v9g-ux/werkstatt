// Baut aus den Markdown-Texten in ./texte die PDF-Hefte in ./pdf.
// Aufruf: node bauen.cjs   (braucht pandoc und Playwright mit Chromium)
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const TITEL = 'Die letzte Bescherung';
const wurzel = __dirname;
const texte = path.join(wurzel, 'texte');
const ziel = path.join(wurzel, 'pdf');
fs.mkdirSync(ziel, { recursive: true });

const einladung = fs.readFileSync(path.join(texte, '_einladung.md'), 'utf8');
const hinweisIntro = (name) => `::: hinweisbox
Hallo ${name}, in diesem Heft stehen deine Hinweise für die vier Spielrunden. **Jede Runde steht auf einer eigenen Seite. Nicht vorblättern!** Zurückblättern ist erlaubt.

Erzähl alle Hinweise, die dich nicht selbst belasten. Was dich belastet, darfst du verschweigen. Wirst du aber direkt gefragt, musst du ehrlich antworten. Ausweichen ist erlaubt. **Nur die Mörderin oder der Mörder darf lügen.** Erzähl die Hinweise möglichst frei, statt sie abzulesen.
:::`;

const css = `
@page { size: A4; margin: 16mm 17mm 18mm 17mm; }
:root { --rot:#8b1e1e; --gruen:#24563a; --gold:#b8892b; --papier:#fffdf8; --text:#2a2320; }
html { background: var(--papier); }
body { font-family: 'Bitstream Charter','Caladea','DejaVu Serif',serif; font-size: 11.3pt; line-height: 1.45; color: var(--text); background: var(--papier); margin:0; }
h1,h2,h3 { font-family: 'Inter','DejaVu Sans',sans-serif; color: var(--rot); line-height:1.2; break-after: avoid; }
h1 { font-size: 22pt; margin: 0 0 10pt; padding-bottom: 6pt; border-bottom: 2.5pt solid var(--gold); }
h2 { font-size: 14.5pt; margin: 16pt 0 6pt; color: var(--gruen); }
h2::before { content: "✶ "; color: var(--gold); }
h3 { font-size: 12pt; margin: 12pt 0 4pt; }
p { margin: 0 0 7pt; orphans:3; widows:3; }
ul { margin: 0 0 8pt; padding-left: 16pt; } li { margin-bottom: 3pt; }
strong { color: #3b1414; }
blockquote { margin: 8pt 0 10pt; padding: 10pt 14pt; background: #fbf3e2; border-left: 4pt solid var(--gold); font-style: italic; border-radius: 3pt; break-inside: avoid; }
blockquote p:last-child { margin:0; }
table { border-collapse: collapse; width: 100%; margin: 6pt 0 12pt; font-size: 10pt; break-inside: auto; }
th, td { border: 0.6pt solid #d8c7a6; padding: 4pt 6pt; text-align: left; vertical-align: top; }
th { background: var(--gruen); color: #fff; font-family: 'Inter',sans-serif; font-weight:600; }
tr:nth-child(even) td { background: #faf4e8; }
.seitenumbruch { break-after: page; height:0; }
h2.runde { break-before: page; }
.titel { text-align: center; padding: 40pt 0 24pt; margin-bottom: 18pt; border: 2pt solid var(--gold); border-radius: 6pt;
  background: linear-gradient(180deg,#8b1e1e 0%,#6c1515 100%); color: #fff; }
.titel h1 { color:#fff; border:none; font-size: 32pt; margin-bottom: 6pt; }
.titel p { color: #f6e6c4; font-size: 13pt; margin: 4pt 0; } .titel strong { color:#fff; }
.kopf { text-align:center; margin-bottom: 12pt; color: var(--gold); font-family:'Inter',sans-serif; letter-spacing: 2pt; font-size: 9pt; text-transform: uppercase; }
.kopf .stern { font-size: 16pt; letter-spacing: 8pt; }
.hinweisbox { background: #eef4ee; border: 1pt solid #a9c5b1; border-radius: 5pt; padding: 9pt 12pt; margin: 8pt 0 12pt; font-size: 10.5pt; break-inside: avoid; }
.hinweisbox p:last-child { margin:0; }
.taeterbox { background: #8b1e1e; color: #fff; border-radius: 5pt; padding: 10pt 14pt; margin: 8pt 0 12pt; font-size: 12pt; break-inside: avoid; }
.taeterbox strong { color: #ffe9a8; } .taeterbox p { margin:0; }
.einladung { border: 1.5pt dashed var(--gold); border-radius: 6pt; padding: 4pt 14pt 8pt; margin-bottom: 12pt; background:#fffaf0; font-size: 10.5pt; }
.einladung h2 { color: var(--rot); }
.vorlesen { background: #fffaf0; border: 1pt solid #e5d3ad; border-radius: 6pt; padding: 10pt 14pt; }
.vorlesen > p:first-child { margin-top: 0; }
.namenskarten { display: grid; grid-template-columns: 1fr 1fr; gap: 10pt; margin: 10pt 0 18pt; }
.karte { border: 1.2pt dashed #9b8a6b; border-radius: 6pt; padding: 18pt 10pt; text-align: center; background: #fff; break-inside: avoid; }
.karte p { margin: 0; color: #6b5d4a; font-size: 10pt; }
.karte strong { display:block; font-family: 'Inter',sans-serif; font-size: 17pt; color: var(--rot); margin-bottom: 4pt; }
.grundriss { text-align:center; } .grundriss svg { width: 80%; height: auto; border-radius: 4pt; }
.danke { text-align:center; margin-top: 20pt; padding: 14pt; border-top: 2pt solid var(--gold); font-size: 13pt; }
`;

function md2html(md) {
  return execFileSync('pandoc', ['-f', 'markdown+fenced_divs+pipe_tables+raw_html-implicit_figures', '-t', 'html5', '--wrap=none'],
    { input: md, encoding: 'utf8' });
}

function vorbereiten(datei, md) {
  md = md.replace(/^---[\s\S]*?---\s*/, '');
  const name = (datei.match(/_\d\d_(.+)\.md$/) || [])[1];
  md = md.replace('{{EINLADUNG}}', einladung);
  if (name) md = md.replace('{{HINWEIS_INTRO}}', hinweisIntro(name.replace('Lucia', 'Lucía')));
  return md;
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const dateien = fs.readdirSync(texte).filter(f => /^\d\d-.*\.md$/.test(f)).sort();
  for (const f of dateien) {
    const md = vorbereiten(f, fs.readFileSync(path.join(texte, f), 'utf8'));
    let body = md2html(md);
    // Runden-Überschriften in Hinweisheften immer auf neuer Seite (der Trenner davor wird überflüssig)
    body = body.replace(/<div class="seitenumbruch"><\/div>\s*(<h2[^>]*>Runde)/g, '$1').replace(/<h2([^>]*)>Runde/g, '<h2 class="runde"$1>Runde');
    const kopf = f.startsWith('01-') ? '' : `<div class="kopf"><div class="stern">✶ ✶ ✶</div>${TITEL} · Krimidinner für 6 Personen</div>`;
    const html = `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${f}</title><style>${css}</style></head><body>${kopf}${body}</body></html>`;
    await page.setContent(html, { waitUntil: 'load' });
    const pdfName = `${TITEL} - ${f.replace(/\.md$/, '')}.pdf`;
    await page.pdf({
      path: path.join(ziel, pdfName), format: 'A4', printBackground: true,
      displayHeaderFooter: true, headerTemplate: '<span></span>',
      footerTemplate: `<div style="width:100%;font-size:8pt;color:#8a7a60;text-align:center;font-family:sans-serif;">${TITEL} · Seite <span class="pageNumber"></span> von <span class="totalPages"></span></div>`,
      margin: { top: '16mm', bottom: '18mm', left: '17mm', right: '17mm' },
    });
    console.log('✓', pdfName);
  }
  await browser.close();
})();
