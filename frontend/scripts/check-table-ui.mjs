// Run with Vite running: node scripts/check-table-ui.mjs
import { chromium, expect } from '@playwright/test';
import { existsSync } from 'node:fs';
const browser = await chromium.launch({
  ...(process.env.CHROMIUM_PATH || existsSync('/usr/bin/chromium')
    ? { executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium' } : {}),
});
const page = await browser.newPage({ viewport: { width: 1024, height: 900 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.route('**/api/**', route => route.fulfill({ status: 401, json: { message: 'UI fixture' } }));
try {
  await page.goto(process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173');
  await page.evaluate(async () => {
    const { default: React } = await import('/node_modules/.vite/deps/react.js');
    const { default: { createRoot } } = await import('/node_modules/.vite/deps/react-dom_client.js');
    const { DataTable } = await import('/src/components/ui/DataTable.tsx');
    const { Pagination } = await import('/src/components/ui/Pagination.tsx');
    const h = React.createElement;
    document.getElementById('root').style.display = 'none';
    const host = document.createElement('div');
    host.style.padding = '16px';
    document.body.append(host);
    const data = Array.from({ length: 2000 }, (_, i) => ({ id: `row-${i + 1}`, name: `Patient ${i + 1}`, details: i % 3 ? 'Short note' : 'Longer clinical note that wraps across several lines on mobile to test measured variable-height rows.' }));
    function Harness() {
      const [rowClicks, setRowClicks] = React.useState(0);
      const [buttonClicks, setButtonClicks] = React.useState(0);
      const [currentPage, setCurrentPage] = React.useState(5);
      const [mode, setMode] = React.useState('data');
      const columns = [
        { accessorKey: 'name', header: 'Patient name' },
        { accessorKey: 'details', header: 'Clinical notes' },
        { id: 'actions', header: 'Actions', cell: () => h('button', { onClick: () => setButtonClicks(n => n + 1) }, 'Inspect') },
      ];
      return h('div', {},
        h('output', { 'data-testid': 'row-clicks' }, rowClicks),
        h('output', { 'data-testid': 'button-clicks' }, buttonClicks),
        h('button', { onClick: () => setMode('loading') }, 'Show loading'),
        h('button', { onClick: () => setMode('empty') }, 'Show empty'),
        h('section', { 'data-testid': 'virtual' }, h(DataTable, { data: mode === 'empty' ? [] : data, columns, virtual: true, isLoading: mode === 'loading', rowKey: row => row.id, onRowClick: () => setRowClicks(n => n + 1) })),
        h('section', { 'data-testid': 'regular' }, h(DataTable, { data: data.slice(0, 25), columns, pageSize: 10, onRowClick: () => setRowClicks(n => n + 1) })),
        h('section', { 'data-testid': 'pagination' }, h(Pagination, { currentPage, totalPages: 100, totalItems: 1000, pageSize: 10, onPageChange: setCurrentPage })),
        h('section', { 'data-testid': 'empty-pagination' }, h(Pagination, { currentPage: 1, totalPages: 0, totalItems: 0, pageSize: 10, onPageChange: () => {} })));
    }
    createRoot(host).render(h(Harness));
  });
  const virtual = page.getByTestId('virtual');
  await expect(virtual.getByText('Patient 1', { exact: true })).toBeVisible();
  async function checkAlignment() {
    const delta = await virtual.evaluate(el => {
      const headers = [...el.querySelectorAll('th')].map(th => th.getBoundingClientRect());
      const cells = [...el.querySelector('tr[data-index]').querySelectorAll('td')].map(td => td.getBoundingClientRect());
      return Math.max(...headers.map((th, i) => Math.max(Math.abs(th.x - cells[i].x), Math.abs(th.width - cells[i].width))));
    });
    expect(delta, 'header and body columns align').toBeLessThan(1);
  }
  await checkAlignment();
  expect(await virtual.locator('tr[data-index]').count()).toBeLessThan(50);
  for (const section of [virtual, page.getByTestId('regular')]) {
    const action = section.getByRole('button', { name: 'Inspect', exact: true }).first();
    await action.click();
    await action.press('Enter');
    await action.press('Space');
    await expect(page.getByTestId('row-clicks')).toHaveText('0');
  }
  await expect(page.getByTestId('button-clicks')).toHaveText('6');
  const firstRow = virtual.locator('tr[data-index]').first();
  await firstRow.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('row-clicks')).toHaveText('1');
  // Repeated bottom jumps account for newly measured variable row heights.
  await expect(async () => {
    await virtual.locator('.overflow-y-auto').evaluate(el => { el.scrollTop = el.scrollHeight; });
    await expect(virtual.getByText('Patient 2000', { exact: true })).toBeVisible({ timeout: 1000 });
  }).toPass();
  await checkAlignment();
  await page.setViewportSize({ width: 320, height: 900 });
  await expect(async () => {
    await virtual.locator('.overflow-y-auto').evaluate(el => { el.scrollTop = el.scrollHeight; });
    await expect(virtual.getByText('Patient 2000', { exact: true })).toBeVisible({ timeout: 1000 });
  }).toPass();
  await checkAlignment();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const pagination = page.getByTestId('pagination');
  await pagination.getByRole('button', { name: 'Trang sau' }).click();
  await expect(pagination.getByText('Trang 6 / 100')).toBeVisible();
  await pagination.getByRole('button', { name: 'Trang trước' }).click();
  await expect(pagination.getByText('Trang 5 / 100')).toBeVisible();
  const empty = page.getByTestId('empty-pagination');
  await expect(empty.getByText('Hiển thị 0–0 của 0')).toBeVisible();
  for (const name of ['Trang trước', 'Trang sau']) await expect(empty.getByRole('button', { name })).toBeDisabled();
  await page.getByRole('button', { name: 'Show loading' }).click();
  await expect(virtual.getByText('Đang tải…')).toBeVisible();
  await page.getByRole('button', { name: 'Show empty' }).click();
  await expect(virtual.getByText('Không có dữ liệu')).toBeVisible();
  expect(errors).toEqual([]);
  console.log('PASS virtual table column alignment and 2,000-row scrolling at desktop/mobile; nested button click/Enter/Space isolation; row Enter; mobile/empty pagination; loading/empty states; no runtime errors');
} finally {
  await browser.close();
}
