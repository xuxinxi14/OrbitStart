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

  test('should show one resource under multiple group tabs', async ({ page }) => {
    await page.evaluate(() => {
      window.localStorage.setItem('orbitstart.browser.items', JSON.stringify([
        {
          id: 'multi-group-test',
          title: 'Multi Group Test',
          subtitle: 'Shared by two workflows',
          kind: 'app',
          group: 'apps,work',
          target: 'C:\\Test\\multi-group.exe',
          aliases: ['multi-group'],
          tags: ['workflow-a', 'workflow-b'],
          icon: 'AppWindow',
          accent: '#5cc8ff',
          favorite: false,
          launchCount: 0
        }
      ]));
    });

    await page.reload();
    await page.waitForSelector('.app-shell', { timeout: 10000 });

    await page.locator('.group-tabs button').nth(1).click();
    await expect(page.locator('.resource-row').filter({ hasText: 'Multi Group Test' })).toBeVisible();

    await page.locator('.group-tabs button').nth(2).click();
    await expect(page.locator('.resource-row').filter({ hasText: 'Multi Group Test' })).toBeVisible();
  });

  test('should keep Local Galaxy header and batch cards stable with many resources', async ({ page }) => {
    await page.setViewportSize({ width: 811, height: 500 });
    await page.evaluate(() => {
      const items = Array.from({ length: 72 }, (_, index) => {
        const group = index < 32 ? 'apps' : index < 56 ? 'work' : index < 66 ? 'web' : 'scripts';
        return {
          id: `layout-regression-${index}`,
          title: `Layout Regression ${index}`,
          subtitle: 'C:\\Program Files\\OrbitStart\\Long Resource Path\\resource.exe',
          kind: group === 'web' ? 'website' : 'app',
          group,
          target: `C:\\Test\\layout-regression-${index}.exe`,
          aliases: [],
          tags: [group],
          icon: group === 'web' ? 'Globe' : 'AppWindow',
          accent: '#5cc8ff',
          favorite: false,
          launchCount: index % 7
        };
      });
      window.localStorage.setItem('orbitstart.browser.items', JSON.stringify(items));
      const raw = window.localStorage.getItem('orbitstart.browser.snapshot');
      const snapshot = raw ? JSON.parse(raw) : {};
      snapshot.settings = { ...(snapshot.settings || {}), activeThemeId: 'local-galaxy', density: 'comfortable' };
      window.localStorage.setItem('orbitstart.browser.snapshot', JSON.stringify(snapshot));
    });

    await page.reload();
    await page.waitForSelector('.app-shell', { timeout: 10000 });

    for (const tabIndex of [0, 1, 2, 3]) {
      await page.locator('.group-tabs button').nth(tabIndex).click();
      const titleFits = await page.evaluate(() => {
        const topbar = document.querySelector('.topbar')?.getBoundingClientRect();
        const title = document.querySelector('.topbar > div:first-child')?.getBoundingClientRect();
        return Boolean(topbar && title && title.bottom <= topbar.bottom - 8);
      });
      expect(titleFits).toBe(true);
    }

    await page.locator('.section-actions button').click();
    const firstRowHeight = await page.locator('.resource-row').first().evaluate((element) => element.getBoundingClientRect().height);
    expect(firstRowHeight).toBeLessThan(180);
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
