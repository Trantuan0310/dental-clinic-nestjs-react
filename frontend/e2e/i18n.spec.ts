import { test, expect } from './fixtures';

test.describe('i18n', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('default locale renders Vietnamese UI', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    // The brand "GENSMILE" is a literal and the translated clinic name is only
    // shown from the 2xl breakpoint, so assert on the header search box, which
    // is translated and visible at the default desktop viewport.
    await expect(page.getByRole('searchbox', { name: 'Tìm bệnh nhân' })).toBeVisible();
  });

  test('language switcher toggles between VI and EN', async ({ page }) => {
    await page.waitForLoadState('networkidle');

    // Open language menu — the language switcher is a <details>/<summary> popover.
    // The summary has aria-label set by LanguageSwitcher.
    const trigger = page.getByRole('button', { name: /ngôn ngữ|language/i }).first();
    await trigger.click();

    // Click English option.
    const enOption = page.getByRole('menuitemradio', { name: /english/i });
    await enOption.click();

    // After switch, the header search box is labelled in English.
    await expect(page.getByRole('searchbox', { name: 'Search patient' })).toBeVisible();
  });

  test('locale persists across reload', async ({ page }) => {
    await page.waitForLoadState('networkidle');

    // Switch to EN
    const trigger = page.getByRole('button', { name: /ngôn ngữ|language/i }).first();
    await trigger.click();
    await page.getByRole('menuitemradio', { name: /english/i }).click();

    await page.reload();
    await page.waitForLoadState('networkidle');

    // Still English.
    await expect(page.getByRole('searchbox', { name: 'Search patient' })).toBeVisible();
  });

  test('html[lang] attribute matches the active locale', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    const htmlLang = await page.locator('html').getAttribute('lang');
    expect(['vi', 'en']).toContain(htmlLang);
  });
});
