// Verify independent theme/language preferences using real UI controls.
import { chromium, expect } from '@playwright/test';
import { existsSync, mkdirSync } from 'node:fs';
const browser=await chromium.launch({...((process.env.CHROMIUM_PATH||existsSync('/usr/bin/chromium'))?{executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium'}:{})});
const context=await browser.newContext({viewport:{width:1440,height:900},colorScheme:'light'});
await context.route('**/api/**',r=>r.fulfill({status:401,json:{message:'No session'}}));
const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
const base=process.env.PLAYWRIGHT_BASE_URL||'http://localhost:5173';
try {
 await page.goto(base+'/login');
 await page.getByRole('button',{name:'Ngôn ngữ',exact:true}).click();
 await page.getByRole('menuitemradio',{name:/English/}).click();
 await expect(page.locator('html')).toHaveAttribute('lang','en');
 await expect(page.getByRole('button',{name:'Language',exact:true})).toBeVisible();
 await expect(page.getByLabel(/^Password/)).toBeVisible();
 // The theme controls already used on staff pages are mounted here to isolate
 // preference behavior from auth and data APIs. This is not a duplicate control.
 await page.evaluate(async()=>{
  const {default:React}=await import('/node_modules/.vite/deps/react.js');
  const {default:{createRoot}}=await import('/node_modules/.vite/deps/react-dom_client.js');
  const {ThemeToggle}=await import('/src/components/ui/ThemeToggle.tsx');
  const host=document.createElement('div');host.id='theme-test';document.body.prepend(host);
  createRoot(host).render(React.createElement(ThemeToggle,{variant:'segmented'}));
 });
 await page.getByRole('radio',{name:'Dark',exact:true}).click();
 await expect(page.locator('html')).toHaveClass(/dark/);
 await page.reload();
 await expect(page.locator('html')).toHaveClass(/dark/);
 await expect(page.locator('html')).toHaveAttribute('lang','en');
 await page.getByRole('button',{name:'Language',exact:true}).click();
 await page.getByRole('menuitemradio',{name:/Tiếng Việt/}).click();
 await expect(page.locator('html')).toHaveAttribute('lang','vi');
 await expect(page.locator('html')).toHaveClass(/dark/);
 await page.reload();
 await expect(page.locator('html')).toHaveClass(/dark/);
 await expect(page.locator('html')).toHaveAttribute('lang','vi');
 await page.evaluate(async()=>{
  const {useThemeStore}=await import('/src/stores/themeStore.ts');
  const {i18n}=await import('/src/locales/index.ts');
  useThemeStore.getState().setMode('system');await i18n.changeLanguage('en-US');
 });
 await expect(page.locator('html')).not.toHaveClass(/dark/);
 await expect(page.locator('html')).toHaveAttribute('lang','en');
 await page.getByRole('button',{name:'Language',exact:true}).click();
 await expect(page.getByRole('menuitemradio',{name:/English/})).toHaveAttribute('aria-checked','true');
 await page.keyboard.press('Escape');
 await page.emulateMedia({colorScheme:'dark'});
 await expect(page.locator('html')).toHaveClass(/dark/);
 await page.emulateMedia({colorScheme:'light'});
 await expect(page.locator('html')).not.toHaveClass(/dark/);
 const formatted=await page.evaluate(async()=>{
  const {formatDate,formatVnd,formatPct}=await import('/src/lib/format.ts');
  return {month:formatDate('2026-10-11','MMMM'),money:formatVnd(123456),pct:formatPct(.1)};
 });
 expect(formatted).toEqual({month:'October',money:'123,456 ₫',pct:'10.00%'});
 expect(errors).toEqual([]);
 mkdirSync('artifacts/theme-language',{recursive:true});
 await page.screenshot({path:'artifacts/theme-language/preferences-en.png',fullPage:true});
 console.log('PASS live VI/EN switching, reload persistence, independent theme preference, system changes, regional locale normalization, format helpers');
}finally{await browser.close();}
