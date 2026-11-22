const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 800, height: 600 }, deviceScaleFactor: 3 });
  for (const [f, out] of [['bo-cuc', '3-36-mockup-bo-cuc'], ['phien-kham', '3-37-mockup-phien-kham'], ['dat-lich', '3-38-mockup-dat-lich']]) {
    await p.goto('file://' + path.join(__dirname, f + '.html'));
    await p.waitForTimeout(200);
    const el = await p.$('.frame');
    await el.screenshot({ path: path.join(__dirname, '..', 'hinh', out + '.png') });
    console.log('ok', out);
  }
  await b.close();
})();
