// Vẽ sơ đồ trong so-do/ thành hinh/<tên>.png (nền trắng, nét đen):
//   *.puml bằng PlantUML (use case, hoạt động, tuần tự, trạng thái, ERD), *.mmd bằng Mermaid.
//   PLANTUML_JAR=/path/plantuml.jar MERMAID_JS=/path/mermaid.min.js node ve-so-do.cjs [tên…]
// Cần Java + Graphviz cho PlantUML, Playwright cho Mermaid.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const dir = path.join(__dirname, 'so-do');
const out = path.join(__dirname, 'hinh');
const only = process.argv.slice(2);
const { execFileSync } = require('child_process');
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.puml')).sort()) {
  const name = f.replace(/\.puml$/, '');
  if (only.length && !only.includes(name)) continue;
  try {
    execFileSync('java', ['-Djava.awt.headless=true', '-DPLANTUML_LIMIT_SIZE=16384', '-jar', process.env.PLANTUML_JAR, '-charset', 'UTF-8', '-tpng', '-o', out, path.join(dir, f)], { stdio: 'pipe' });
    console.log('ok', name);
  } catch (e) {
    console.log('LỖI', name, String(e.stderr || e.message).split('\n').slice(-3).join(' '));
  }
}
if (!fs.readdirSync(dir).some((x) => x.endsWith('.mmd') && (!only.length || only.includes(x.replace(/\.mmd$/, ''))))) process.exit(0);
const mermaidJs = fs.readFileSync(process.env.MERMAID_JS, 'utf8');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: 2.5, viewport: { width: 1400, height: 1000 } });
  await page.setContent('<html><body style="margin:0;background:#fff"><div id="c"></div></body></html>');
  await page.addScriptTag({ content: mermaidJs });
  await page.evaluate(() => {
    mermaid.initialize({
      startOnLoad: false, theme: 'base', securityLevel: 'loose',
      fontFamily: 'Times New Roman, serif',
      themeVariables: {
        fontFamily: 'Times New Roman, serif', fontSize: '16px',
        primaryColor: '#ffffff', primaryTextColor: '#000000', primaryBorderColor: '#000000',
        lineColor: '#000000', secondaryColor: '#f2f2f2', tertiaryColor: '#ffffff',
        actorBkg: '#ffffff', actorBorder: '#000000', noteBkgColor: '#f2f2f2', noteBorderColor: '#000000',
        clusterBkg: '#fafafa', clusterBorder: '#555555', edgeLabelBackground: '#ffffff',
      },
      er: { useMaxWidth: false }, sequence: { useMaxWidth: false, mirrorActors: false }, flowchart: { useMaxWidth: false },
      state: { useMaxWidth: false }, class: { useMaxWidth: false },
    });
  });
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.mmd')).sort()) {
    const name = f.replace(/\.mmd$/, '');
    if (only.length && !only.includes(name)) continue;
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    try {
      const svg = await page.evaluate(async ([id, code]) => (await mermaid.render(id, code)).svg, ['g' + Math.random().toString(36).slice(2), src]);
      await page.evaluate((s) => { document.getElementById('c').innerHTML = s; }, svg);
      const el = await page.$('#c svg');
      await el.screenshot({ path: path.join(out, name + '.png'), omitBackground: false });
      console.log('ok', name);
    } catch (e) {
      console.log('LỖI', name, String(e.message || e).split('\n')[0]);
    }
  }
  await browser.close();
})();
