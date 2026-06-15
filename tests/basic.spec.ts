import { test, expect } from '@playwright/test';

test.describe('OrbitStart E2E Basic Verification', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the local Vite dev server
    await page.goto('/');
    // Wait for the app shell to render
    await page.waitForSelector('.app-shell', { timeout: 10000 });
  });

  test('should load the workspace and display core branding', async ({ page }) => {
    // Verify application title in the sidebar
    const brandTitle = page.locator('.brand-mark strong');
    await expect(brandTitle).toBeVisible();
    await expect(brandTitle).toHaveText('OrbitStart');

    // Verify presence of primary navigation buttons
    const railButtons = page.locator('.rail-button');
    await expect(railButtons).not.toHaveCount(0);
  });

  test('should read computed CSS variables on document root', async ({ page }) => {
    // Get computed style properties of the document element
    const styles = await page.evaluate(() => {
      const el = document.documentElement;
      const computed = window.getComputedStyle(el);
      return {
        bg: computed.getPropertyValue('--bg').trim(),
        accent: computed.getPropertyValue('--accent').trim(),
        fontUi: computed.getPropertyValue('--font-ui').trim(),
      };
    });

    console.log('Detected theme CSS variables:', styles);

    // Verify standard tokens are defined (not empty)
    expect(styles.bg).not.toBe('');
    expect(styles.accent).not.toBe('');
    expect(styles.fontUi).not.toBe('');
  });

  test('should navigate to Settings and inspect settings view', async ({ page }) => {
    const settingsButton = page.locator('.rail-button[title="设置"]').first();
    await expect(settingsButton).toBeVisible();
    await settingsButton.click();
    await expect(page.locator('.settings-shell')).toBeVisible();
  });

  test('should verify Atelier Zero theme variables if active', async ({ page }) => {
    // Get the dataset theme ID of document.documentElement
    const themeId = await page.evaluate(() => document.documentElement.dataset.theme);
    console.log('Currently active theme ID:', themeId);

    if (themeId === 'atelier-zero') {
      const styles = await page.evaluate(() => {
        const computed = window.getComputedStyle(document.documentElement);
        return {
          bg: computed.getPropertyValue('--bg').trim(),
          accent: computed.getPropertyValue('--accent').trim(),
          fontTitle: computed.getPropertyValue('--font-title').trim(),
        };
      });

      console.log('Atelier Zero theme verified with tokens:', styles);

      // Verify they match THEME_SPEC.md specification
      expect(styles.bg.toLowerCase()).toBe('#fbf6ee');
      expect(styles.accent.toLowerCase()).toBe('#9b5b32');
      expect(styles.fontTitle).toContain('Georgia');
    } else {
      console.log('Atelier Zero is not currently the active theme; skipping active token validation.');
    }
  });
});
