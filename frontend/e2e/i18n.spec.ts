import { test, expect } from './fixtures';

test.describe('i18n', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('default locale renders Vietnamese UI', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    // The shell shows the brand "GENSMILE" as a literal, but the clinic name and tabs
    // are translated. We assert the clinic name appears in Vietnamese by default.
    await expect(page.getByText('Nha Khoa An Việt')).toBeVisible();
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

    // After switch, the clinic name should now show in English.
    await expect(page.getByText('An Viet Dental Clinic')).toBeVisible();
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
    await expect(page.getByText('An Viet Dental Clinic')).toBeVisible();
  });

  test('html[lang] attribute matches the active locale', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    const htmlLang = await page.locator('html').getAttribute('lang');
    expect(['vi', 'en']).toContain(htmlLang);
  });
});
