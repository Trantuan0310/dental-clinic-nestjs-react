// Run with Vite on :5173. All API data is mocked; no backend writes.
import { chromium, expect } from '@playwright/test';
import { existsSync, mkdirSync } from 'node:fs';
const browser = await chromium.launch({
  ...(process.env.CHROMIUM_PATH || existsSync('/usr/bin/chromium')
    ? { executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium' } : {}),
});
const page = await browser.newPage();
const base = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173';
const artifacts = 'artifacts/ui-polish';
mkdirSync(artifacts, { recursive: true });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const patient = { id:'patient-ui', code:'BN-00001234', fullName:'Nguyễn Thị Hoàng Anh Minh', dob:'1990-01-15', gender:'FEMALE', primaryPhone:'0912345678', status:'active', createdAt:'2026-10-01T01:00:00Z', updatedAt:'2026-10-01T01:00:00Z', allergies:[], chronicDiseases:[], currentMedications:[], summary:{totalEncounters:0,totalInvoices:0,totalPaid:0,totalOutstanding:0,lastVisitAt:null,lastVisitBy:null} };
const encounter = { id:'encounter-ui',code:'HS-00001234',patientId:patient.id,patientName:patient.fullName,patientCode:patient.code,dentistId:'ui',dentistName:'Nguyễn Văn Hoàng Minh',status:'in_progress',startedAt:'2026-10-11T01:00:00Z',notes:[],treatments:[],prescriptions:[],chiefComplaint:'Đau răng và cần tư vấn điều trị tổng quát' };
let patientFails = false;
await page.route('**/api/**', route => {
 const path = new URL(route.request().url()).pathname;
 if(path.endsWith('/auth/refresh')) return route.fulfill({json:{data:{accessToken:'ui-fixture',user:{id:'ui',fullName:'Nguyễn Quản Trị',email:'ui@example.test',roles:['clinic_admin'],permissions:['patient.read','patient.create','patient.update','encounter.read','encounter.read.any','encounter.complete','encounter.cancel','appointment.create','dental_chart.write'],status:'active'}}}});
 if(path.endsWith('/medical-records/encounters/encounter-ui')) return route.fulfill({json:{data:encounter}});
 if(path.endsWith('/patients/patient-ui')) return patientFails ? route.fulfill({status:503,json:{message:'Temporary outage'}}) : route.fulfill({json:{data:patient}});
 if(path.endsWith('/dental-chart/latest')) return route.fulfill({json:{data:{id:'chart-ui',patientId:patient.id,teeth:{}}}});
 return route.fulfill({json:{data:[],total:0,pagination:{page:1,pageSize:20,total:0,totalPages:0}}});
});
async function fits(label){
 const overflow = await page.evaluate(() => ({width:innerWidth,scroll:document.documentElement.scrollWidth, offenders:[...document.querySelectorAll('main *')].filter(el=>el.getBoundingClientRect().right>innerWidth+1 && getComputedStyle(el).position!=='fixed').slice(0,8).map(el=>`${el.tagName}.${el.className}`)}));
 expect(overflow.scroll,`${label}: ${JSON.stringify(overflow)}`).toBeLessThanOrEqual(overflow.width);
}
try {
 for (const width of [320,375]) {
  await page.setViewportSize({width,height:900});
  await page.goto(base+'/encounters/encounter-ui');
  const tabs = page.getByRole('tablist',{name:'Nội dung hồ sơ khám'});
  await expect(tabs).toBeVisible();
  await fits(`encounter notes ${width}`);
  const notes = tabs.getByRole('tab',{name:'Ghi chú',exact:true});
  await notes.focus(); await page.keyboard.press('ArrowRight');
  const treatments=tabs.getByRole('tab',{name:'Điều trị',exact:true});
  await expect(treatments).toBeFocused(); await expect(treatments).toHaveAttribute('aria-selected','true');
  await expect(page.getByRole('tabpanel',{name:'Điều trị',exact:true})).toBeVisible();
  await page.keyboard.press('End');
  await expect(tabs.getByRole('tab',{name:'Tổng quan',exact:true})).toBeFocused();
  await page.keyboard.press('ArrowRight'); await expect(notes).toBeFocused();
  await page.keyboard.press('ArrowLeft'); await expect(tabs.getByRole('tab',{name:'Tổng quan',exact:true})).toBeFocused();
  await page.keyboard.press('Home'); await expect(notes).toBeFocused();
  await tabs.getByRole('tab',{name:'Sơ đồ răng',exact:true}).click();
  await expect(page.getByTestId('dental-chart-panel')).toBeVisible();
  await fits(`encounter chart ${width}`);
  await page.screenshot({path:`${artifacts}/encounter-chart-${width}.png`,fullPage:true});
  await page.goto(base+'/patients/patient-ui');
  await expect(page.getByRole('heading',{name:patient.fullName,exact:true})).toBeVisible();
  await fits(`patient detail ${width}`);
  await page.goto(base+'/patients/patient-ui/edit');
  await expect(page.getByLabel(/họ tên/i)).toHaveValue(patient.fullName);
  await fits(`patient edit ${width}`);
  await page.screenshot({path:`${artifacts}/patient-edit-${width}.png`,fullPage:true});
 }
 patientFails=true;
 await page.goto(base+'/patients/patient-ui/edit');
 await expect(page.getByText('Không thể tải hồ sơ bệnh nhân',{exact:true})).toBeVisible({timeout:15000});
 patientFails=false;
 await page.getByRole('button',{name:'Thử lại',exact:true}).click();
 await expect(page.getByLabel(/họ tên/i)).toHaveValue(patient.fullName);
 await page.getByRole('button',{name:'Chuyển sang giao diện tối'}).click();
 await expect(page.locator('html')).toHaveClass(/dark/);
 await expect(page.getByRole('heading',{name:'Sửa thông tin bệnh nhân'})).toHaveCSS('color','rgb(243, 244, 246)');
 await page.screenshot({path:`${artifacts}/patient-edit-dark-375.png`,fullPage:true});
 expect(errors).toEqual([]);
 console.log('PASS: clinical mobile overflow at 320/375, encounter tab arrows/wrap/Home/End and panel linkage, patient edit retry, no runtime errors');
} finally { await browser.close(); }
