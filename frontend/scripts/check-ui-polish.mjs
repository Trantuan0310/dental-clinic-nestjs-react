// Run with Vite running: node scripts/check-ui-polish.mjs
// Uses API fixtures; does not require or modify a backend database.
import { chromium, expect } from '@playwright/test';
import { existsSync, mkdirSync } from 'node:fs';
const browser = await chromium.launch({
  ...(process.env.CHROMIUM_PATH || existsSync('/usr/bin/chromium')
    ? { executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium' } : {}),
});
const base = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173';
const artifacts = 'artifacts/ui-polish';
mkdirSync(artifacts, { recursive: true });
const page = await browser.newPage();
page.setDefaultTimeout(10_000);
let staff = false;
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.route('**/api/**', route => {
  const path = new URL(route.request().url()).pathname;
  if (path.endsWith('/auth/refresh') && staff) return route.fulfill({json:{data:{accessToken:'ui-fixture',user:{id:'ui',fullName:'Nguyễn Thị Quản Trị Phòng Khám',email:'ui@example.test',roles:['clinic_admin'],permissions:['patient.read','patient.create','appointment.read','invoice.read','report.read'],status:'active'}}}});
  if (path.endsWith('/public/booking/options')) return route.fulfill({json:{data:[{id:'service',name:'Khám và tư vấn răng miệng',category:'GENERAL',durationMinutes:30,basePrice:150000,dentists:[{id:'dentist',fullName:'Bác sĩ Nguyễn An',specialties:[]}]}]}});
  if (path.endsWith('/public/booking/slots')) return route.fulfill({json:{data:{availableSlots:['09:00','10:00']}}});
  return route.fulfill({status:400,json:{message:'UI fixture unavailable'}});
});
try {
  for (const width of [320,375,768,1440]) {
    await page.setViewportSize({width,height:900});
    for (const path of ['/login','/booking','/']) {
      await page.goto(base+path);
      await expect(page.getByRole('heading').first()).toBeVisible();
      if (path==='/booking') await expect(page.getByLabel('Dịch vụ',{exact:true})).toBeVisible();
      expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth), `${path} fits ${width}px`).toBe(true);
      if(width===375) await page.screenshot({path:`${artifacts}/${path.slice(1)||'landing'}-mobile.png`,fullPage:true});
    }
  }
  console.log('PASS public pages: 12 viewport/page combinations');
  staff = true;
  await page.setViewportSize({width:375,height:812});
  await page.goto(base+'/patients/new');
  await expect(page.getByLabel(/họ và tên/i)).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  for (const width of [320,375,768,1440]) {
    await page.setViewportSize({width,height:900});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth), `Patient form fits ${width}px`).toBe(true);
  }
  await page.setViewportSize({width:375,height:812});
  await page.evaluate(()=>document.documentElement.classList.add('dark'));
  await page.waitForTimeout(250); // Allow the existing theme color transition to finish.
  await page.screenshot({path:`${artifacts}/patient-dark-mobile.png`,fullPage:true});
  await page.evaluate(()=>document.documentElement.classList.remove('dark'));
  await page.waitForTimeout(250);
  await page.screenshot({path:`${artifacts}/patient-mobile.png`,fullPage:true});
  const menu = page.getByRole('button',{name:/mở menu/i});
  await menu.click();
  const drawer = page.getByRole('dialog',{name:/menu điều hướng/i});
  await expect(drawer).toBeVisible();
  await page.keyboard.press('Shift+Tab');
  expect(await drawer.evaluate(el=>el.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(menu).toBeFocused();
  await menu.click();
  await page.setViewportSize({width:1024,height:812});
  await expect(drawer).toBeHidden();
  await expect.poll(()=>page.evaluate(()=>document.body.style.overflow)).not.toBe('hidden');
  await page.keyboard.press('Control+k');
  const palette = page.getByRole('dialog',{name:/command palette/i});
  await expect(palette).toBeVisible();
  await palette.getByRole('button',{name:/hủy|cancel/i}).focus();
  await page.keyboard.press('Enter');
  await expect(palette).toBeHidden();
  expect(new URL(page.url()).pathname).toBe('/patients/new');
  console.log('PASS mobile navigation, resize cleanup, palette close by keyboard');
  // Mount real shared components using Vite modules to exercise rerenders/nesting.
  await page.evaluate(async()=>{
    const { default: React } = await import('/node_modules/.vite/deps/react.js');
    const {default: {createRoot}} = await import('/node_modules/.vite/deps/react-dom_client.js');
    const {Modal} = await import('/src/components/ui/Modal.tsx');
    const {Input} = await import('/src/components/ui/Input.tsx');
    const {Button} = await import('/src/components/ui/Button.tsx');
    const {Pagination} = await import('/src/components/ui/Pagination.tsx');
    const h=React.createElement;
    const host=document.createElement('div');document.body.append(host);
    function Harness(){
      const [outer,setOuter]=React.useState(false),[inner,setInner]=React.useState(false),[value,setValue]=React.useState('');
      return h('div',{style:{position:'relative',background:'white',padding:16}},
        h(Button,{asChild:true},h('a',{href:'#check','data-testid':'styled-link'},'Styled link')),
        h(Pagination,{currentPage:5,totalPages:100,totalItems:1000,pageSize:10,onPageChange:()=>{}}),
        h('button',{onClick:()=>setOuter(true)},'Open test modal'),
        h(Modal,{open:outer,onClose:()=>setOuter(false),title:'Outer test'},
          h(Input,{label:'First field'}),h(Input,{label:'Typing field',value,onChange:e=>setValue(e.target.value)}),
          h('button',{onClick:()=>setInner(true)},'Open nested'),
          h(Modal,{open:inner,onClose:()=>setInner(false),title:'Inner test'},h('button',{},'Nested action'))));
    }
    createRoot(host).render(h(Harness));
  });
  await expect(page.getByTestId('styled-link')).toHaveClass(/inline-flex/);
  await page.getByRole('button',{name:'Open test modal'}).click();
  const typing=page.getByLabel('Typing field');
  await typing.pressSequentially('Focus stays here');
  await expect(typing).toHaveValue('Focus stays here');
  await expect(typing).toBeFocused();
  await page.getByRole('button',{name:'Open nested'}).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog',{name:'Inner test',exact:true})).toBeHidden();
  await expect(page.getByRole('dialog',{name:'Outer test',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.body.style.overflow)).toBe('hidden');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button',{name:'Open test modal'})).toBeFocused();
  await expect.poll(()=>page.evaluate(()=>document.body.style.overflow)).not.toBe('hidden');
  await page.setViewportSize({width:320,height:812});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect(errors).toEqual([]);
  console.log('PASS modal typing/nested Escape/focus/scroll, link button styles, mobile pagination; no runtime errors');
} finally { await browser.close(); }
