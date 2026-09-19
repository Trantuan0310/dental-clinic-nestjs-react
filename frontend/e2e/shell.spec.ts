import { test, expect } from './fixtures';

test.describe('Shell — post-login', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('dashboard loads with KPI cards', async ({ page }) => {
    await expect(page).toHaveURL(/.*\/$/);
    await page.waitForLoadState('networkidle');
    const cards = page.getByTestId('kpi-card');
    await expect(cards).toHaveCount(4);
    for (const label of ['Bệnh nhân', 'Tổng lịch hẹn', 'Doanh số điều trị', 'Tiền đã thu']) {
      await expect(cards.filter({ hasText: label })).toBeVisible();
    }
    await expect(page.getByText('Không thể tải số liệu KPI', { exact: true })).toHaveCount(0);
  });

  test('command palette opens with ⌘K shortcut and navigates', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    // Open via shortcut (Meta on macOS, Control elsewhere).
    await page.keyboard.press('Control+K');
    const palette = page.getByRole('dialog', { name: /command palette/i });
    await expect(palette).toBeVisible();

    // Type a search query and press Enter. The palette only matches the
    // active locale's translated label (see CommandPalette's getHaystack),
    // and the app defaults to Vietnamese, so search the VI term.
    await palette.getByRole('searchbox').fill('bệnh nhân');
    await page.keyboard.press('Enter');

    // Should navigate to /patients.
    await page.waitForURL('**/patients*', { timeout: 10_000 });
  });

  test('theme toggle changes the document theme attribute', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    const html = page.locator('html');
    const startDark = await html.evaluate((el) => el.classList.contains('dark'));

    const toggle = page.getByRole('button', { name: /giao diện|theme/i }).first();
    await toggle.click();

    await expect.poll(async () => html.evaluate((el) => el.classList.contains('dark'))).not.toBe(startDark);

    // Persist check: reload and verify the theme sticks.
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect.poll(async () => html.evaluate((el) => el.classList.contains('dark'))).toBe(!startDark);
  });

  test('mobile sidebar drawer opens and closes', async ({ page }) => {
    // Resize to mobile breakpoint. beforeEach already navigated to '/' —
    // don't goto() again here: a second navigation races the first one's
    // still in-flight silent token refresh (SessionBoot fires it on every
    // mount), and two refresh calls presenting the same not-yet-rotated
    // cookie trip the backend's reuse-detection, revoking the whole
    // session and bouncing this test to the login page. The mobile layout
    // is pure CSS (`md:hidden`), so resizing the existing page is enough.
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForLoadState('networkidle');

    const openButton = page.getByRole('button', { name: /mở menu/i });
    await expect(openButton).toBeVisible();
    await openButton.click();
    const drawer = page.getByRole('dialog', { name: /menu điều hướng/i });
    await expect(drawer).toBeVisible();
    await page.keyboard.press('Shift+Tab');
    expect(await drawer.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    await page.keyboard.press('Tab');
    expect(await drawer.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
    await expect(openButton).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});
