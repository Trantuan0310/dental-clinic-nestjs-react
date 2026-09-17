import { test, expect } from './fixtures';

test.describe('A11y — keyboard & landmarks', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('skip-link is reachable by Tab and jumps to #main-content', async ({ page }) => {
    // Reload to put the skip link first in tab order. Without waiting for
    // the reload to settle, Tab can fire before React has mounted/hydrated
    // — there's nothing focusable yet, so it's a no-op and the assertion
    // below sees "inactive" instead of the skip link.
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.keyboard.press('Tab');
    const skipLink = page.getByRole('link', { name: /skip to main|chuyển tới/i }).first();
    await expect(skipLink).toBeFocused();
    await skipLink.press('Enter');
    await expect(page).toHaveURL(/#main-content/);
    const main = page.locator('#main-content');
    await expect(main).toBeFocused();
  });

  test('main landmark exists and is reachable', async ({ page }) => {
    const main = page.getByRole('main');
    await expect(main).toBeVisible();
    await expect(main).toHaveId('main-content');
  });

  test('navigation landmarks are properly labelled', async ({ page }) => {
    // Header banner
    const header = page.getByRole('banner');
    await expect(header).toBeVisible();

    // At least one navigation region (desktop sidebar or mobile drawer).
    const navs = page.getByRole('navigation');
    expect(await navs.count()).toBeGreaterThan(0);
    for (const nav of await navs.all()) {
      expect(await nav.getAttribute('aria-label') || await nav.getAttribute('aria-labelledby')).toBeTruthy();
    }
  });

  test('all icon-only buttons have an accessible name', async ({ page }) => {
    await page.goto('/patients/new');
    await page.waitForLoadState('networkidle');
    // Collect every <button> in the header / shell, ensure none have no name.
    const buttons = page.locator('header button, aside button, main button');
    const count = await buttons.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      const btn = buttons.nth(i);
      // Skip hidden buttons (e.g. mobile-only ones that may be `display: none`).
      if (!(await btn.isVisible())) continue;
      const name = await btn.evaluate((el) => {
        const aria = el.getAttribute('aria-label');
        const text = (el.textContent ?? '').trim();
        const labelledBy = el.getAttribute('aria-labelledby');
        return aria ?? (labelledBy ? `#labelledby:${labelledBy}` : text);
      });
      expect(name, `Button #${i} has no accessible name`).toBeTruthy();
      expect(name.length, `Button #${i} has empty name`).toBeGreaterThan(0);
    }
  });

  test('command palette traps focus and is dismissable with Escape', async ({ page }) => {
    await page.keyboard.press('Control+K');
    const palette = page.getByRole('dialog', { name: /command palette/i });
    await expect(palette).toBeVisible();

    // Focus is inside the dialog.
    const focusedInsidePalette = await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"][aria-label="Command Palette"]');
      return dialog ? dialog.contains(document.activeElement) : false;
    });
    expect(focusedInsidePalette).toBe(true);
    await page.keyboard.press('Shift+Tab');
    expect(await palette.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    await page.keyboard.press('Tab');
    expect(await palette.evaluate((el) => el.contains(document.activeElement))).toBe(true);

    // Escape closes.
    await page.keyboard.press('Escape');
    await expect(palette).toBeHidden();
  });

  test('all form inputs have an accessible label', async ({ page }) => {
    await page.goto('/patients/new');
    await page.waitForLoadState('networkidle');
    // Search inputs typically have placeholder but may lack label.
    // We assert every visible <input>/<select>/<textarea> in main has a name or aria-label.
    const inputs = page.locator('main input, main select, main textarea');
    const count = await inputs.count();
    for (let i = 0; i < count; i++) {
      const input = inputs.nth(i);
      if (!(await input.isVisible())) continue;
      const tag = await input.evaluate((el) => el.tagName);
      // Skip hidden inputs and submit/button types — they're not user-fillable.
      const type = await input.getAttribute('type');
      if (type === 'hidden' || type === 'submit') continue;
      // Find a label: <label for>, parent <label>, aria-label, or aria-labelledby.
      const id = await input.getAttribute('id');
      const hasLabel = await input.evaluate((el) =>
        Array.from((el as HTMLInputElement).labels ?? []).some((label) => label.textContent?.trim()),
      );
      const ariaLabel = await input.getAttribute('aria-label');
      const ariaLabelledBy = await input.getAttribute('aria-labelledby');
      // placeholder alone is NOT a valid accessible label per WCAG.
      const accessible = hasLabel || (ariaLabel && ariaLabel.trim().length > 0) || !!ariaLabelledBy;
      expect(
        accessible,
        `${tag}#${id} has no associated <label> or aria-label`,
      ).toBe(true);
    }
  });
});
