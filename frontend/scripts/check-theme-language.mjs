// Vite must be running. API fixtures never write to the backend.
// AUDIT_ONLY=1 reports in-progress findings; default fails on regressions.
import { chromium, expect } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
const browser = await chromium.launch({
  ...(process.env.CHROMIUM_PATH || existsSync('/usr/bin/chromium')
    ? { executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium' } : {}),
});
const base = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173';
const artifacts = 'artifacts/theme-language';
mkdirSync(artifacts, { recursive: true });
const permissions = [...new Set([...readFileSync('src/routes/AppRoutes.tsx', 'utf8').matchAll(/["']([a-z_]+\.[a-z_.]+)["']/g), ...readFileSync('src/lib/nav.ts', 'utf8').matchAll(/["']([a-z_]+\.[a-z_.]+)["']/g)].map(m=>m[1]))];
permissions.push('report.revenue.read','report.outstanding.read','appointment.read.any','encounter.read.any','inventory.create','patient.update','dental_chart.write','encounter.complete','encounter.cancel');
const user={id:'ui',fullName:'Clinic Administrator',email:'ui@example.test',roles:['clinic_admin'],permissions,status:'active'};
const patient={id:'patient-ui',code:'BN-001',fullName:'Patient Example',dob:'1990-01-15',gender:'FEMALE',primaryPhone:'0912345678',status:'active',createdAt:'2026-10-01T01:00:00Z',updatedAt:'2026-10-01T01:00:00Z',allergies:[],chronicDiseases:[],currentMedications:[],summary:{totalEncounters:0,totalInvoices:0,totalPaid:0,totalOutstanding:0,lastVisitAt:null,lastVisitBy:null}};
const encounter={id:'encounter-ui',code:'HS-001',patientId:patient.id,patientName:patient.fullName,patientCode:patient.code,dentistId:'ui',dentistName:'Dentist Example',status:'in_progress',startedAt:new Date().toISOString(),notes:[],treatments:[],prescriptions:[]};
const report={totalInvoiced:123456789,totalCollected:100000000,totalOutstanding:23456789,invoiceCount:12,byMonth:[],byDentist:[],byPaymentMethod:[],byStatus:[{status:'PAID',total:100000000,count:10}],excluded:{draft:{count:0,total:0},voided:{count:0,total:0}}};
async function fixtures(context, staff) {
 await context.route('**/api/**', route=>{
  const p=new URL(route.request().url()).pathname;
  let data=[];
  if(p.endsWith('/auth/refresh')) return route.fulfill(staff ? {json:{data:{accessToken:'fixture',user}}} : {status:401,json:{message:'No session'}});
  if(p.endsWith('/patients/patient-ui')) data=patient;
  else if(p.endsWith('/medical-records/encounters/encounter-ui'))data=encounter;
  else if(p.endsWith('/dental-chart/latest'))data={id:'chart-ui',patientId:patient.id,teeth:{}};
  else if(p.endsWith('/public/booking/options'))data=[{id:'service',name:'Dental examination',category:'GENERAL',durationMinutes:30,basePrice:150000,dentists:[{id:'dentist',fullName:'Dentist Example',specialties:[]}]}];
  else if(p.endsWith('/public/booking/slots'))data={availableSlots:['09:00','10:00']};
  else if(p.endsWith('/reports/revenue'))data=report;
  else if(p.endsWith('/reports/dashboard-kpis')) return route.fulfill({json:{patients:{total:12,pctChange:0},appointments:{total:12,pctChange:0},treatmentRevenue:{total:123456789,pctChange:0},collected:{total:100000000,pctChange:0}}});
  else if(p.endsWith('/reports/finance-summary'))return route.fulfill({json:{totalIncome:100000000,totalExpense:50000000}});
  else if(p.endsWith('/reports/outstanding-summary'))return route.fulfill({json:{totalDebt:23456789,invoiceCount:2}});
  else if(p.endsWith('/reports/appointment-stats'))data={summary:{total:0,pending:0,arrived:0,inClinic:0,completed:0,left:0,noShow:0,cancelled:0,cancelledAfterCheckIn:0,walkIn:0,online:0},rates:{arrivalPct:0,noShowPct:0,cancelPct:0,leftPct:0},bySource:[],byDentist:[],onlineFunnel:null};
  else if(p.endsWith('/inventory/items')) data=[{id:'item',sku:'VT001',name:'Composite A2',unit:'tube',quantityOnHand:1,minStockLevel:5,costPrice:500000,status:'ACTIVE',category:{id:'cat',name:'Dental material'}}];
  else if(p.endsWith('/inventory/categories'))data=[{id:'cat',name:'Dental material'}];
  return route.fulfill({json:{data,total:Array.isArray(data)?data.length:0,pagination:{page:1,pageSize:20,total:0,totalPages:0,hasMore:false,nextCursor:null},summary:{total:0,totalAmount:0,approvedAmount:0,count:0}}});
 });
}
const pages = [
 ['login','/login',false],['landing','/',false],['booking','/booking',false],['booking-status','/booking/status',false],
 ['dashboard','/',true],['patients','/patients',true],['patient-form','/patients/new',true],['patient-detail','/patients/patient-ui',true],['encounter','/encounters/encounter-ui',true],
 ['appointments','/appointments',true],['appointment-list','/appointments/list',true],['schedule','/schedule',true],['inventory','/inventory',true],['invoices','/billing/list',true],['reports','/reports',true],['expenses','/expenses',true],['staff','/staff',true],['dentists','/dentists',true],['users','/admin/users',true],['roles','/admin/roles',true],['audit-logs','/admin/audit',true],['clinic-settings','/admin/settings',true],['payroll','/payroll',true],['payroll-config','/payroll/config',true],['compensations','/payroll/compensations',true],['shift-approval','/payroll/shifts/approval',true],['my-shifts','/my-shifts',true],['services','/services',true],['account','/me',true],
];
const reportRows=[];
try {
 for(const locale of ['vi','en']) for(const theme of ['light','dark']) {
  for(const staff of [false,true]) {
   const context=await browser.newContext({viewport:{width:375,height:900},timezoneId:'Asia/Ho_Chi_Minh'});
   await context.addInitScript(({locale,theme})=>{
    localStorage.setItem('gensmile.i18n',locale);
    localStorage.setItem('gensmile.theme',JSON.stringify({state:{mode:theme},version:0}));
   },{locale,theme});
   await fixtures(context,staff);
   const page=await context.newPage();page.setDefaultTimeout(10000);
   let errors=[];page.on('pageerror',e=>errors.push(e.message));
   for(const [name,path,isStaff] of pages.filter(p=>p[2]===staff)) {
    if(process.env.ONLY && !process.env.ONLY.split(',').includes(name))continue;
    await page.goto(base+path);
    await expect(page.locator('html')).toHaveAttribute('lang',locale);
    await page.waitForLoadState('networkidle');
    for(const width of [375,1440]) {
     await page.setViewportSize({width,height:900});
     await page.waitForTimeout(250);
     const state=await page.evaluate(()=>{
      const text=document.body.innerText;
      const vietnamese=/[ÀÁẢÃẠĂẰẮẲẴẶÂẦẤẨẪẬÈÉẺẼẸÊỀẾỂỄỆÌÍỈĨỊÒÓỎÕỌÔỒỐỔỖỘƠỜỚỞỠỢÙÚỦŨỤƯỪỨỬỮỰỲÝỶỸỴĐàáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/;
      const leaks=text.split('\n').map(x=>x.trim()).filter(x=>vietnamese.test(x)&&!/^Tiếng Việt$|^©|GENSMILE|₫/.test(x));
      const labels=[...document.querySelectorAll('input,select,textarea,button')].filter(e=>e.getBoundingClientRect().width).flatMap(e=>[e.getAttribute('placeholder'),e.getAttribute('aria-label')]).filter(x=>x&&vietnamese.test(x));
      const contrast=[];
      for(const el of document.querySelectorAll('main h1,main h2,main label')){
       if(!el.getBoundingClientRect().width||!el.textContent.trim())continue;
       const color=getComputedStyle(el).color;let parent=el,bg='';
       while(parent){const c=getComputedStyle(parent).backgroundColor;if(c!=='rgba(0, 0, 0, 0)'&&c!=='transparent'){bg=c;break;}parent=parent.parentElement;}
       const lum=c=>{const n=(c.match(/[\d.]+/g)||[]).slice(0,3).map(Number).map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4});return n[0]*.2126+n[1]*.7152+n[2]*.0722;};
       if(bg){const a=lum(color),b=lum(bg),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);if(ratio<3)contrast.push({text:el.textContent.trim().slice(0,90),ratio:Math.round(ratio*100)/100,color,bg});}
      }
      return {dark:document.documentElement.classList.contains('dark'),overflow:document.documentElement.scrollWidth>innerWidth,leaks:[...new Set([...leaks,...labels])],rawKeys:text.match(/ui(?:Common|Clinical|Entry|Operations|Scheduling|Workforce)\.[\w.]+/g)||[],contrast};
     });
     const row={name,locale,theme,width,...state,leaks:locale==='en'?state.leaks:[],errors:[...errors]};reportRows.push(row);errors=[];
     if(width===375||locale==='en'&&theme==='dark')await page.screenshot({path:`${artifacts}/${name}-${locale}-${theme}-${width}.png`,fullPage:true});
    }
   }
   await context.close();
  }
  console.log(`Checked ${locale}/${theme}`);
 }
 writeFileSync(`${artifacts}/audit.json`,JSON.stringify(reportRows,null,2));
 const issues=reportRows.filter(r=>r.overflow||r.errors.length||r.rawKeys.length||r.contrast.length||r.dark!==(r.theme==='dark')||r.leaks.length);
 console.log(`${reportRows.length} cases, ${issues.length} with findings; ${artifacts}/audit.json`);
 for(const name of [...new Set(issues.map(r=>r.name))]){const r=issues.find(r=>r.name===name&&r.locale==='en'&&r.theme==='dark')||issues.find(r=>r.name===name);console.log(name,JSON.stringify({overflow:r.overflow,errors:r.errors,rawKeys:r.rawKeys,leaks:r.leaks.slice(0,8),contrast:r.contrast.slice(0,3)}));}
 if(!process.env.AUDIT_ONLY)expect(issues,'See artifacts/theme-language/audit.json').toEqual([]);
}finally{await browser.close();}
