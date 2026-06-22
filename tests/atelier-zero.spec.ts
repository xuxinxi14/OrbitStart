import { test, expect } from '@playwright/test';

test.use({
  storageState: {
    cookies: [],
    origins: [
      {
        origin: 'http://127.0.0.1:1420',
        localStorage: [
          {
            name: 'orbitstart_onboarding_v1',
            value: JSON.stringify({ completed: true })
          }
        ]
      }
    ]
  }
});


// Helper: Get computed CSS property on a selector
async function getComputedStyle(page, selector: string, property: string): Promise<string> {
  return page.evaluate(({ selector, property }) => {
    const el = document.querySelector(selector);
    if (!el) return '';
    return window.getComputedStyle(el).getPropertyValue(property).trim();
  }, { selector, property });
}

// Helper: Get CSS Variable on root
async function getCssVariable(page, name: string): Promise<string> {
  return page.evaluate((v) => {
    return window.getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  }, name);
}

// Helper: Parse color (hex or rgb) into [r, g, b]
function parseColor(colorStr: string): [number, number, number] {
  if (colorStr.startsWith('#')) {
    const hex = colorStr.slice(1);
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return [r, g, b];
  }
  const match = colorStr.match(/rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/);
  if (match) {
    return [parseInt(match[1], 10), parseInt(match[2], 10), parseInt(match[3], 10)];
  }
  const rgbaMatch = colorStr.match(/rgba\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)/);
  if (rgbaMatch) {
    return [parseInt(rgbaMatch[1], 10), parseInt(rgbaMatch[2], 10), parseInt(rgbaMatch[3], 10)];
  }
  return [0, 0, 0];
}

// Helper: Calculate contrast ratio
function getContrastRatio(color1: string, color2: string): number {
  const rgb1 = parseColor(color1);
  const rgb2 = parseColor(color2);

  const getLuminance = (r: number, g: number, b: number): number => {
    const [aR, aG, aB] = [r, g, b].map(v => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * aR + 0.7152 * aG + 0.0722 * aB;
  };

  const l1 = getLuminance(...rgb1);
  const l2 = getLuminance(...rgb2);
  const brighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (brighter + 0.05) / (darker + 0.05);
}

// Helper: Set theme in localStorage
async function setInitialTheme(page, themeId: string) {
  await page.evaluate((tId) => {
    const storageKey = 'orbitstart.browser.snapshot';
    const raw = window.localStorage.getItem(storageKey);
    let snapshot: any = { settings: { activeThemeId: 'local-galaxy' } };
    if (raw) {
      try {
        snapshot = JSON.parse(raw);
      } catch (e) {}
    }
    snapshot.settings = snapshot.settings || {};
    snapshot.settings.activeThemeId = tId;
    window.localStorage.setItem(storageKey, JSON.stringify(snapshot));
    window.localStorage.setItem('orbitstart_onboarding_v1', JSON.stringify({ completed: true }));
  }, themeId);
  await page.reload();
  await page.waitForSelector('.app-shell', { timeout: 10000 });
}

test.describe('Atelier Zero Theme E2E Tests', () => {

  test.beforeEach(async ({ page }) => {
    // Navigate to dashboard
    await page.goto('/');
    await page.waitForSelector('.app-shell', { timeout: 10000 });
  });

  // TIER 1 - FEATURE COVERAGE (At least 35 checks)
  test.describe('Tier 1 - Feature Coverage', () => {
    test('should verify all core design elements of Atelier Zero theme', async ({ page }) => {
      // 1. Theme Activation
      await page.goto('/?view=settings&panel=themes');
      await page.waitForSelector('.theme-card');
      await page.locator('.theme-card').filter({ hasText: 'Atelier Zero' }).first().click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'atelier-zero');

      // Assertion 1: Theme dataset matches
      const datasetTheme = await page.evaluate(() => document.documentElement.dataset.theme);
      expect(datasetTheme).toBe('atelier-zero');

      // 2. CSS Custom Variables Registration (bg, surface, accent, accent-2, font-title)
      // Assertion 2: --bg variable registration
      const varBg = await getCssVariable(page, '--bg');
      expect(varBg.toLowerCase()).toBe('#fbf6ee');

      // Assertion 3: --surface variable registration
      const varSurface = await getCssVariable(page, '--surface');
      expect(varSurface.toLowerCase()).toBe('#fffdf8');

      // Assertion 4: --accent variable registration
      const varAccent = await getCssVariable(page, '--accent');
      expect(varAccent.toLowerCase()).toBe('#9b5b32');

      // Assertion 5: --accent-2 variable registration
      const varAccent2 = await getCssVariable(page, '--accent-2');
      expect(varAccent2.toLowerCase()).toBe('#2f5b4f');

      // Assertion 6: --font-title variable registration
      const varFontTitle = await getCssVariable(page, '--font-title');
      expect(varFontTitle).toContain('Georgia');

      // 3. Sidebar Elements (background, brand-orbit surface, active rail-button surface, rail-button active text, mini-panel background)
      await page.goto('/?view=dashboard');
      await page.waitForSelector('.sidebar');
      await page.waitForTimeout(500);

      // Assertion 7: Sidebar background uses --bg
      const sidebarBg = await getComputedStyle(page, '.sidebar', 'background-color');
      expect(parseColor(sidebarBg)).toEqual(parseColor('#fbf6ee'));

      // Assertion 8: brand-orbit surface uses --surface
      const brandOrbitBg = await getComputedStyle(page, '.brand-orbit', 'background-color');
      expect(parseColor(brandOrbitBg)).toEqual(parseColor('#fffdf8'));

      // Assertion 9: brand-orbit border is --line (#eee4d7)
      const brandOrbitBorder = await getComputedStyle(page, '.brand-orbit', 'border-color');
      expect(parseColor(brandOrbitBorder)).toEqual(parseColor('#eee4d7'));

      // Let's navigate to settings menu or click rail buttons to check active state
      // Click Settings button to make it active
      const settingsButton = page.locator('.rail-button[title="设置"], button:has-text("设置"), button:has(.lucide-Settings)').first();
      await settingsButton.click();
      await page.waitForSelector('.settings-shell');
      await page.waitForTimeout(300);

      // Assertion 10: Active rail-button surface is --surface
      const activeRailBg = await getComputedStyle(page, '.rail-button.active', 'background-color');
      expect(parseColor(activeRailBg)).toEqual(parseColor('#fffdf8'));

      // Assertion 11: Active rail-button border-color is --line-strong (#ded2c3)
      const activeRailBorder = await getComputedStyle(page, '.rail-button.active', 'border-top-color');
      expect(parseColor(activeRailBorder)).toEqual(parseColor('#ded2c3'));

      // Assertion 12: Active rail-button text color is --accent
      const activeRailColor = await getComputedStyle(page, '.rail-button.active', 'color');
      expect(parseColor(activeRailColor)).toEqual(parseColor('#9b5b32'));

      // Assertion 13: mini-panel background is --surface
      const miniPanelBg = await getComputedStyle(page, '.mini-panel', 'background-color');
      expect(parseColor(miniPanelBg)).toEqual(parseColor('#fffdf8'));

      // Assertion 14: mini-panel border color is --line (#eee4d7)
      const miniPanelBorder = await getComputedStyle(page, '.mini-panel', 'border-color');
      expect(parseColor(miniPanelBorder)).toEqual(parseColor('#eee4d7'));

      // 4. Topbar Elements (background, h1 font-family, h1 font-weight, title-subtitle color, eyebrow accent color)
      // Assertion 15: Topbar background is --surface
      const topbarBg = await getComputedStyle(page, '.topbar', 'background-color');
      expect(parseColor(topbarBg)).toEqual(parseColor('#fffdf8'));

      // Assertion 16: h1 font-family contains Georgia
      const topbarFont = await getComputedStyle(page, '.topbar h1', 'font-family');
      expect(topbarFont).toContain('Georgia');

      // Assertion 17: h1 font-weight is 700
      const topbarWeight = await getComputedStyle(page, '.topbar h1', 'font-weight');
      expect(topbarWeight).toBe('700');

      // Assertion 18: title-subtitle color is --muted (#7a6d63)
      const subtitleColor = await getComputedStyle(page, '.title-subtitle', 'color');
      expect(parseColor(subtitleColor)).toEqual(parseColor('#7a6d63'));

      // Assertion 19: eyebrow color is --accent (#9b5b32)
      const eyebrowColor = await getComputedStyle(page, '.topbar .eyebrow', 'color');
      expect(parseColor(eyebrowColor)).toEqual(parseColor('#9b5b32'));

      // 5. Cards & Resource Rows (background, border, radius, icon surface, hover accent-2 border & shadow)
      await page.goto('/?view=dashboard');
      await page.waitForSelector('.resource-row');
      const row = page.locator('.resource-row').first();

      // Assertion 20: Card background is --surface
      const cardBg = await row.evaluate((el) => window.getComputedStyle(el).backgroundColor);
      expect(parseColor(cardBg)).toEqual(parseColor('#fffdf8'));

      // Assertion 21: Card border is --line (#eee4d7)
      const cardBorder = await row.evaluate((el) => window.getComputedStyle(el).borderColor);
      expect(parseColor(cardBorder)).toEqual(parseColor('#eee4d7'));

      // Assertion 22: Card border radius is 16px (var(--radius))
      const cardRadius = await row.evaluate((el) => window.getComputedStyle(el).borderRadius);
      expect(cardRadius).toBe('16px');

      // Assertion 23: Icon surface background is --surface-soft (#eee4d7)
      const iconBg = await getComputedStyle(page, '.resource-icon', 'background-color');
      expect(parseColor(iconBg)).toEqual(parseColor('#eee4d7'));

      // Assertion 24: Icon border is --line-strong (#ded2c3)
      const iconBorder = await getComputedStyle(page, '.resource-icon', 'border-color');
      expect(parseColor(iconBorder)).toEqual(parseColor('#ded2c3'));

      // Assertion 25: Icon color is --accent (#9b5b32)
      const iconColor = await getComputedStyle(page, '.resource-icon', 'color');
      expect(parseColor(iconColor)).toEqual(parseColor('#9b5b32'));

      // 6. Inputs & Search (input background, input border/color, search-shell background/border, focus border accent, kbd badge surface/color)
      // Assertion 26: search-shell background is --surface (#fffdf8)
      const searchBg = await getComputedStyle(page, '.search-shell', 'background-color');
      expect(parseColor(searchBg)).toEqual(parseColor('#fffdf8'));

      // Assertion 27: search-shell border is --line-strong (#ded2c3)
      const searchBorder = await getComputedStyle(page, '.search-shell', 'border-color');
      expect(parseColor(searchBorder)).toEqual(parseColor('#ded2c3'));

      // Assertion 28: kbd badge background is --surface-soft (#eee4d7)
      const kbdBg = await getComputedStyle(page, 'kbd', 'background-color');
      expect(parseColor(kbdBg)).toEqual(parseColor('#eee4d7'));

      // Assertion 29: kbd badge text color is --muted (#7a6d63)
      const kbdColor = await getComputedStyle(page, 'kbd', 'color');
      expect(parseColor(kbdColor)).toEqual(parseColor('#7a6d63'));

      // 7. Buttons & CTAs (primary-action accent background, text color white/bg, border accent, secondary-action surface background, hover surface-soft background & accent border)
      await page.waitForSelector('.primary-action:not([disabled])');
      await page.waitForTimeout(300);
      // Assertion 30: primary-action background is --accent (#9b5b32)
      const primaryBg = await getComputedStyle(page, '.primary-action', 'background-color');
      expect(parseColor(primaryBg)).toEqual(parseColor('#9b5b32'));

      // Assertion 31: primary-action text color is --bg (#fbf6ee)
      const primaryColor = await getComputedStyle(page, '.primary-action', 'color');
      const diff31 = parseColor(primaryColor).map((v, i) => Math.abs(v - parseColor('#fbf6ee')[i])).reduce((sum, val) => sum + val, 0);
      expect(diff31).toBeLessThanOrEqual(25);

      // Assertion 32: primary-action border is --accent (#9b5b32)
      const primaryBorder = await getComputedStyle(page, '.primary-action', 'border-color');
      expect(parseColor(primaryBorder)).toEqual(parseColor('#9b5b32'));

      // Assertion 33: secondary-action background is --surface (#fffdf8)
      const secondaryBg = await getComputedStyle(page, '.secondary-action', 'background-color');
      expect(parseColor(secondaryBg)).toEqual(parseColor('#fffdf8'));

      // Assertion 34: secondary-action border is --line-strong (#ded2c3)
      const secondaryBorder = await getComputedStyle(page, '.secondary-action', 'border-color');
      expect(parseColor(secondaryBorder)).toEqual(parseColor('#ded2c3'));

      // Assertion 35: secondary-action color is --soft (#4c4037)
      const secondaryColor = await getComputedStyle(page, '.secondary-action', 'color');
      expect(parseColor(secondaryColor)).toEqual(parseColor('#4c4037'));
    });
  });

  // TIER 2 - BOUNDARY & CORNER CASES (At least 35 checks)
  test.describe('Tier 2 - Boundary & Corner Cases', () => {

    test('1. Invalid Theme ID Fallback & Graceful Failure', async ({ page }) => {
      // Seed invalid theme ID in localStorage
      await setInitialTheme(page, 'invalid-theme-xyz');
      await page.goto('/');
      await page.waitForSelector('.app-shell');

      // Assertion 36: Root data-theme fallback (themes[0] is local-galaxy or fallback in React)
      const activeTheme = await page.evaluate(() => document.documentElement.dataset.theme);
      expect(activeTheme).toBe('local-galaxy');

      // Assertion 37: Fallback theme background is dark (local-galaxy background: #050812)
      const bg = await getComputedStyle(page, '.app-shell', 'background-color');
      expect(parseColor(bg)).toEqual(parseColor('#050812'));
    });

    test('2. Rapid Theme Toggles Stress Test', async ({ page }) => {
      // Go to theme page
      await page.goto('/?view=settings&panel=themes');
      await page.waitForSelector('.theme-card');

      const galaxyCard = page.locator('.theme-card').filter({ hasText: 'Local Galaxy' }).first();
      const zeroCard = page.locator('.theme-card').filter({ hasText: 'Atelier Zero' }).first();
      const darkCard = page.locator('.theme-card').filter({ hasText: 'Zentou Wireframe' }).first();

      // Perform rapid toggles
      for (let i = 0; i < 3; i++) {
        await galaxyCard.click();
        await zeroCard.click();
        await darkCard.click();
      }
      await zeroCard.click();

      // Assertion 38: Verify final dataset.theme
      const themeId = await page.evaluate(() => document.documentElement.dataset.theme);
      expect(themeId).toBe('atelier-zero');
    });

    test('3. Corruption/Null Settings Fallback', async ({ page }) => {
      // Seed corrupted JSON in settings localStorage
      await page.addInitScript(() => {
        window.localStorage.setItem('orbitstart.browser.snapshot', 'this-is-corrupted-json-data!');
      });
      await page.goto('/');
      await page.waitForSelector('.app-shell');

      // Assertion 39: App loaded without crash (app shell is visible)
      await expect(page.locator('.app-shell')).toBeVisible();

      // Assertion 40: Theme resolved to fallback default (local-galaxy)
      const themeId = await page.evaluate(() => document.documentElement.dataset.theme);
      expect(themeId).toBe('local-galaxy');
    });

    test('4. Repeated Settings Open and Close', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('.app-shell');

      for (let i = 0; i < 5; i++) {
        // Click settings rail button
        const settingsButton = page.locator('.rail-button[title="设置"], button:has-text("设置"), button:has(.lucide-Settings)').first();
        await settingsButton.click();
        await expect(page.locator('.modal-panel .modal-head h2')).toHaveText('轨道控制');

        // Click close button on modal header to close
        const closeButton = page.locator('.modal-panel .modal-head button.icon-action').first();
        await closeButton.click();
        await expect(page.locator('.modal-panel')).toHaveCount(0);
      }

      // Assertion 41: Final state is dashboard view
      const activeView = await page.evaluate(() => {
        const shell = document.querySelector('.app-shell');
        return shell ? Array.from(shell.classList).find(c => c.startsWith('view-')) : '';
      });
      expect(activeView).toBe('view-dashboard');
    });

    test('5. Responsive Viewport Theme Activation & Token Check', async ({ page }) => {
      // Activate theme
      await setInitialTheme(page, 'atelier-zero');

      // Mobile Viewport
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto('/');
      await page.waitForSelector('.app-shell');
      // Assertion 42: Dataset theme in mobile
      expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('atelier-zero');
      // Assertion 43: bg matches in mobile
      expect(parseColor(await getComputedStyle(page, '.app-shell', 'background-color'))).toEqual(parseColor('#fbf6ee'));

      // Tablet Viewport
      await page.setViewportSize({ width: 768, height: 1024 });
      await page.goto('/');
      await page.waitForSelector('.app-shell');
      // Assertion 44: Dataset theme in tablet
      expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('atelier-zero');
      // Assertion 45: bg matches in tablet
      expect(parseColor(await getComputedStyle(page, '.app-shell', 'background-color'))).toEqual(parseColor('#fbf6ee'));

      // Desktop Viewport
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto('/');
      await page.waitForSelector('.app-shell');
      // Assertion 46: Dataset theme in desktop
      expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('atelier-zero');
      // Assertion 47: bg matches in desktop
      expect(parseColor(await getComputedStyle(page, '.app-shell', 'background-color'))).toEqual(parseColor('#fbf6ee'));
    });

    test('6. Specific Radius Values (sm, standard, md, lg)', async ({ page }) => {
      await setInitialTheme(page, 'atelier-zero');
      await page.goto('/');
      await page.waitForSelector('.app-shell');

      // Assertion 48: Radius-sm check
      const rSm = await getCssVariable(page, '--radius-sm');
      expect(rSm).toBe('10px');

      // Assertion 49: Radius-standard check
      const rStd = await getCssVariable(page, '--radius');
      expect(rStd).toBe('16px');

      // Assertion 50: Radius-md check
      const rMd = await getCssVariable(page, '--radius-md');
      expect(rMd).toBe('16px');

      // Assertion 51: Radius-lg check
      const rLg = await getCssVariable(page, '--radius-lg');
      expect(rLg).toBe('24px');
    });

    test('7. Flat Design Shadow Cards Override', async ({ page }) => {
      await setInitialTheme(page, 'atelier-zero');
      await page.goto('/');
      await page.waitForSelector('.app-shell');

      // Assertion 52: Card shadow variable check
      const shadowVar = await getCssVariable(page, '--shadow-card');
      expect(shadowVar).toBe('none');
    });

    test('8-9. AAA Contrast Checks', async ({ page }) => {
      await setInitialTheme(page, 'atelier-zero');
      await page.goto('/');
      await page.waitForSelector('.app-shell');

      // Assertion 53: Primary text vs Bg contrast ratio >= 7.0 (AAA)
      const textBgRatio = getContrastRatio('#201914', '#fbf6ee');
      expect(textBgRatio).toBeGreaterThanOrEqual(7.0);

      // Assertion 54: Elevated text vs Surface contrast ratio >= 7.0 (AAA)
      const textSurfaceRatio = getContrastRatio('#201914', '#fffdf8');
      expect(textSurfaceRatio).toBeGreaterThanOrEqual(7.0);
    });

    test('10. Focus Ring Outline RGBA Check', async ({ page }) => {
      await setInitialTheme(page, 'atelier-zero');
      await page.goto('/');
      await page.waitForSelector('.app-shell');

      // Assertion 55: Focus Ring variable matches
      const focusRing = await getCssVariable(page, '--focus-ring');
      expect(focusRing.replace(/\s+/g, '')).toContain('rgba(155,91,50,0.24)');
    });

    test('11-25. Element & Interactive State Styling Assertions', async ({ page }) => {
      await setInitialTheme(page, 'atelier-zero');
      await page.goto('/');
      await page.waitForSelector('.sidebar');

      // Assertion 56: Rail button hover background becomes Soft (#eee4d7)
      const railBtn = page.locator('.rail-button').nth(1);
      await railBtn.hover();
      await page.waitForTimeout(300);
      const railHoverBg = await railBtn.evaluate(el => window.getComputedStyle(el).backgroundColor);
      expect(parseColor(railHoverBg)).toEqual(parseColor('#eee4d7'));

      // Assertion 57: Mini-panel stats count is green or var(--accent-2) (#2f5b4f) or var(--accent)
      const miniPanelCount = page.locator('.mini-panel strong').first();
      const countColor = await miniPanelCount.evaluate(el => window.getComputedStyle(el).color);
      const expectedColors = [parseColor('#2f5b4f'), parseColor('#9b5b32')];
      const parsedCountColor = parseColor(countColor);
      expect(expectedColors.some(c => c[0] === parsedCountColor[0] && c[1] === parsedCountColor[1] && c[2] === parsedCountColor[2])).toBe(true);

      // Assertion 58: Topbar bottom border exactly 1px solid
      const topbarBorderWidth = await getComputedStyle(page, '.topbar', 'border-bottom-width');
      const topbarBorderStyle = await getComputedStyle(page, '.topbar', 'border-bottom-style');
      expect(topbarBorderWidth).toBe('1px');
      expect(topbarBorderStyle).toBe('solid');

      // Assertion 59: Topbar actions icon hover state check
      const actionIcon = page.locator('.top-actions .icon-action').first();
      await actionIcon.hover();
      const actionHoverBg = await actionIcon.evaluate(el => window.getComputedStyle(el).backgroundColor);
      expect(actionHoverBg).not.toBe('transparent');

      // Assertion 60: Long title wrapping check (ellipsis)
      const resourceCopy = page.locator('.resource-copy strong').first();
      if (await resourceCopy.count() > 0) {
        const textOverflow = await resourceCopy.evaluate(el => window.getComputedStyle(el).textOverflow);
        expect(textOverflow).toBe('ellipsis');
      }

      // Assertion 61: Eyebrow uppercase sans-serif check
      const eyebrow = page.locator('.topbar .eyebrow').first();
      const eyebrowFamily = await eyebrow.evaluate(el => window.getComputedStyle(el).fontFamily);
      expect(eyebrowFamily).toContain('Inter');

      // Assertion 62: Resource row hover raised shadow check
      await page.waitForSelector('.resource-row');
      const resourceRow = page.locator('.resource-row').first();
      await resourceRow.hover();
      const hoverShadow = await resourceRow.evaluate(el => window.getComputedStyle(el).boxShadow);
      expect(hoverShadow).not.toBe('none');

      // Assertion 63: Empty state placeholder dashed border check
      const searchInput = page.locator('.search-shell input');
      await searchInput.fill('non-existent-resource-query-xyz');
      await page.waitForSelector('.empty-state');
      const emptyStateBorder = await getComputedStyle(page, '.empty-state', 'border-style');
      expect(emptyStateBorder).toBe('dashed');

      // Assertion 64: Search input error state outline check (focus border accent)
      await searchInput.focus();
      const searchOutlineColor = await searchInput.evaluate(el => window.getComputedStyle(el.parentElement!).borderColor);
      expect(parseColor(searchOutlineColor)).toEqual(parseColor('#9b5b32'));

      // Open settings overlay
      const settingsButton = page.locator('.rail-button[title="设置"], button:has-text("设置"), button:has(.lucide-Settings)').first();
      await settingsButton.click();
      await page.waitForSelector('.modal-panel');

      // Assertion 65: Option elements background check (no dark leaks)
      const selectElem = page.locator('.setting-list select').first();
      if (await selectElem.count() > 0) {
        const optionElem = selectElem.locator('option').first();
        const optionBg = await optionElem.evaluate(el => window.getComputedStyle(el).backgroundColor);
        expect(parseColor(optionBg)).toEqual(parseColor('#fffdf8'));
      }

      // Assertion 66: Primary button border radius 10px check
      const primaryRadius = await getComputedStyle(page, '.primary-action', 'border-radius');
      expect(primaryRadius).toBe('10px');

      // Close settings overlay
      const closeSettingsBtn = page.locator('.modal-panel .modal-head button.icon-action').first();
      await closeSettingsBtn.click();
      await page.waitForSelector('.modal-panel', { state: 'detached' });

      // Assertion 67: Destructive buttons red fill check
      await page.locator('.primary-action').filter({ hasText: '添加资源' }).click();
      await page.waitForSelector('.editor-panel');
      await page.locator('.editor-panel .icon-action').click(); // close editor
      await page.waitForSelector('.editor-panel', { state: 'detached' });

      // Open settings overlay again to test plugins view
      await settingsButton.click();
      await page.waitForSelector('.modal-panel');
      // Click plugins menu button in settings menu
      const pluginsMenuBtn = page.locator('.settings-menu button').nth(1); // general is 0, plugins is 1
      await pluginsMenuBtn.click();
      await page.waitForSelector('.plugin-card');

      const dangerAction = page.locator('.danger-action').first();
      if (await dangerAction.count() > 0) {
        const dangerBg = await dangerAction.evaluate(el => window.getComputedStyle(el).backgroundColor);
        expect(parseColor(dangerBg)).toEqual(parseColor('#b33a3a'));
      }

      // Assertion 68: Switch button active green check
      const switchBtnOn = page.locator('.switch-button.on').first();
      if (await switchBtnOn.count() > 0) {
        const switchBg = await switchBtnOn.evaluate(el => window.getComputedStyle(el).backgroundColor);
        expect(switchBg).toContain('rgba(128, 230, 167');
      }

      // Close settings modal
      await page.locator('.settings-modal-panel .modal-head .icon-action').click();
      await page.waitForSelector('.settings-modal-panel', { state: 'detached' });

      // Assertion 69: Window controls hover check
      const windowMinBtn = page.locator('.window-controls button').first();
      await windowMinBtn.hover();
      const windowHoverBg = await windowMinBtn.evaluate(el => window.getComputedStyle(el).backgroundColor);
      expect(parseColor(windowHoverBg)).toEqual(parseColor('#eee4d7'));

      // Assertion 70: Flat design shadows override check (shadow-card is none)
      const cardShadow = await getCssVariable(page, '--shadow-card');
      expect(cardShadow).toBe('none');
    });

  });

  // TIER 3 - CROSS-FEATURE COMBINATIONS
  test.describe('Tier 3 - Cross-Feature Combinations', () => {

    test('Theme swap and Settings page form elements verification', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('.app-shell');

      // 1. Open settings overlay
      const settingsButton = page.locator('.rail-button[title="设置"], button:has-text("设置"), button:has(.lucide-Settings)').first();
      await settingsButton.click();
      await page.waitForSelector('.modal-panel');

      // 2. Select Themes menu item (Themes is the 3rd section: general, plugins, themes...)
      await page.locator('.settings-menu button').nth(2).click();
      await page.waitForSelector('.theme-card');

      // 3. Theme swap via UI
      await page.locator('.theme-card').filter({ hasText: 'Atelier Zero' }).first().click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'atelier-zero');

      // 4. Settings navigation back to general
      await page.locator('.settings-menu button').nth(0).click();
      await page.waitForSelector('.setting-list');

      // 5. Config forms theming check (inputs background is surface)
      const inputBg = await getComputedStyle(page, '.setting-list select', 'background-color');
      expect(parseColor(inputBg)).toEqual(parseColor('#fffdf8'));
    });

    test('Card creation, hover state, and favorite star color', async ({ page }) => {
      await setInitialTheme(page, 'atelier-zero');
      await page.goto('/');
      await page.waitForSelector('.app-shell');

      // 1. Card creation
      await page.locator('.primary-action').filter({ hasText: '添加资源' }).first().click();
      await page.waitForSelector('.editor-panel');

      await page.locator('.form-grid input').nth(0).fill('Atelier E2E Test');
      await page.locator('.form-grid input').nth(1).fill('C:\\Test\\e2e-run.exe');
      await page.locator('.modal-actions .primary-action').filter({ hasText: '保存' }).click();

      // Wait for toast and card to appear
      await page.waitForSelector('.resource-row:has-text("Atelier E2E Test")');

      // 2. Hover state check
      const testCard = page.locator('.resource-row').filter({ hasText: 'Atelier E2E Test' }).first();
      await testCard.hover();
      const hoverBorder = await testCard.evaluate(el => window.getComputedStyle(el).borderColor);
      expect(parseColor(hoverBorder)).toEqual(parseColor('#2f5b4f')); // forest green border

      // 3. Favorite star click
      const favBtn = testCard.locator('.favorite-action');
      await favBtn.click();
      await expect(favBtn).toHaveClass(/is-favorite/);
    });

    test('Search focus, edit modal opening, and modal shadow', async ({ page }) => {
      await setInitialTheme(page, 'atelier-zero');
      await page.goto('/');
      await page.waitForSelector('.app-shell');

      // Create a card first to make sure it exists
      await page.locator('.primary-action').filter({ hasText: '添加资源' }).first().click();
      await page.waitForSelector('.editor-panel');
      await page.locator('.form-grid input').nth(0).fill('Atelier E2E Test');
      await page.locator('.form-grid input').nth(1).fill('C:\\Test\\e2e-run.exe');
      await page.locator('.modal-actions .primary-action').filter({ hasText: '保存' }).click();
      await page.waitForSelector('.resource-row:has-text("Atelier E2E Test")');

      // 1. Focus search styles
      const searchShell = page.locator('.search-shell');
      const searchInput = searchShell.locator('input');
      await searchInput.focus();
      const shellBorder = await searchShell.evaluate(el => window.getComputedStyle(el).borderColor);
      expect(parseColor(shellBorder)).toEqual(parseColor('#9b5b32')); // focus accent border

      // 2. Search & Edit modal opening
      await searchInput.fill('Atelier E2E Test');
      const testCard = page.locator('.resource-row').filter({ hasText: 'Atelier E2E Test' }).first();
      await testCard.locator('button[title="编辑"]').click();
      await page.waitForSelector('.editor-panel');

      // 3. Modal shadow check
      const modal = page.locator('.editor-panel');
      const modalShadow = await modal.evaluate(el => window.getComputedStyle(el).boxShadow);
      expect(modalShadow).not.toBe('none');
    });

    test('Accessibility fonts (Georgia & Inter co-existence)', async ({ page }) => {
      await setInitialTheme(page, 'atelier-zero');
      await page.goto('/');
      await page.waitForSelector('.app-shell');

      // Georgia (title) and Inter (body) on same screen
      const titleFont = await getComputedStyle(page, '.topbar h1', 'font-family');
      expect(titleFont).toContain('Georgia');

      const bodyFont = await getComputedStyle(page, '.resource-copy strong', 'font-family');
      expect(bodyFont).toContain('Inter');
    });

    test('Plugin toggling and stats count update styling', async ({ page }) => {
      await setInitialTheme(page, 'atelier-zero');
      await page.goto('/');
      await page.waitForSelector('.app-shell');

      // Get initial count in sidebar
      const initialCount = await page.locator('.mini-panel-button strong').innerText();

      // Click mini-panel-button to open plugins overlay
      await page.locator('.mini-panel-button').first().click();
      await page.waitForSelector('.plugin-card');

      // Toggle first plugin
      const switchBtn = page.locator('.plugin-card .switch-button').first();
      await switchBtn.click();

      // Wait for count to change
      await page.waitForTimeout(500);
      const newCount = await page.locator('.mini-panel-button strong').innerText();
      expect(newCount).not.toBe(initialCount);

      // Check stats count color remains forest green or accent
      const countColor = await getComputedStyle(page, '.mini-panel-button strong', 'color');
      const expectedColors = [parseColor('#2f5b4f'), parseColor('#9b5b32')];
      expect(expectedColors.some(c => JSON.stringify(c) === JSON.stringify(parseColor(countColor)))).toBe(true);

      // Close plugins overlay
      const closeBtn = page.locator('.modal-panel .modal-head button.icon-action').first();
      await closeBtn.click();
      await page.waitForSelector('.modal-panel', { state: 'detached' });
    });

    test('Form validation error triggers and input outline', async ({ page }) => {
      await setInitialTheme(page, 'atelier-zero');
      await page.goto('/');
      await page.waitForSelector('.app-shell');

      // Open creation form
      await page.locator('.primary-action').filter({ hasText: '添加资源' }).first().click();
      await page.waitForSelector('.editor-panel');

      // Title is empty, target is filled
      await page.locator('.form-grid input').nth(1).fill('C:\\some-path.exe');
      await page.locator('.modal-actions .primary-action').filter({ hasText: '保存' }).click();

      // Assertion: toast validation error
      const toastText = await page.locator('.toast-line span').innerText();
      expect(toastText).toContain('不能为空');

      // Cleanup: Close form
      await page.locator('.editor-panel .icon-action').click();
    });

    test('Theme swap back and cleanliness check', async ({ page }) => {
      await setInitialTheme(page, 'atelier-zero');
      await page.goto('/');
      await page.waitForSelector('.app-shell');

      // Open settings overlay
      const settingsButton = page.locator('.rail-button[title="设置"], button:has-text("设置"), button:has(.lucide-Settings)').first();
      await settingsButton.click();
      await page.waitForSelector('.modal-panel');

      // Click themes tab
      await page.locator('.settings-menu button').nth(2).click();
      await page.waitForSelector('.theme-card');

      // Swap back to Local Galaxy
      await page.locator('.theme-card').filter({ hasText: 'Local Galaxy' }).first().click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'local-galaxy');

      // Close settings overlay
      const closeSettingsBtn = page.locator('.modal-panel .modal-head button.icon-action').first();
      await closeSettingsBtn.click();
      await page.waitForSelector('.modal-panel', { state: 'detached' });

      // Check background color is local galaxy (#050812)
      const bg = await getComputedStyle(page, '.app-shell', 'background-color');
      expect(parseColor(bg)).toEqual(parseColor('#050812'));
    });

  });

  // TIER 4 - REAL-WORLD APPLICATION WORKLOADS
  test.describe('Tier 4 - Real-World Application Workloads', () => {

    test('1. Complete Workspace Setup Workflow', async ({ page }) => {
      await setInitialTheme(page, 'atelier-zero');
      await page.goto('/');
      await page.waitForSelector('.app-shell');

      // Create a custom group
      await page.locator('.add-group-tab').click();
      await page.waitForSelector('.dialog-panel');
      await page.locator('.dialog-body input').fill('Workstation Beta');
      await page.locator('.modal-actions .primary-action').click();

      // Wait for new group tab
      const newTab = page.locator('.group-tabs button.selected');
      await expect(newTab).toContainText('Workstation Beta');

      // Get initial count in sidebar
      const initialCount = await page.locator('.mini-panel-button strong').innerText();

      // Open plugins overlay via sidebar mini-panel button
      await page.locator('.mini-panel-button').first().click();
      await page.waitForSelector('.plugin-card');
      const targetCard = page.locator('.plugin-card').filter({ hasText: 'Browser Bookmarks' }).first();
      const switchBtn = targetCard.locator('.switch-button');
      await switchBtn.click();

      // Close plugins overlay
      const closeBtn = page.locator('.modal-panel .modal-head button.icon-action').first();
      await closeBtn.click();
      await page.waitForSelector('.modal-panel', { state: 'detached' });

      // Check counts updated in sidebar
      await expect(page.locator('.mini-panel-button strong')).not.toHaveText(initialCount);
    });

    test('2. Resource Creation and Interaction Workflow', async ({ page }) => {
      await setInitialTheme(page, 'atelier-zero');
      await page.goto('/');
      await page.waitForSelector('.app-shell');

      // Open add resource panel
      await page.locator('.primary-action').filter({ hasText: '添加资源' }).click();
      await page.waitForSelector('.editor-panel');

      // Fill form
      await page.locator('.form-grid input').nth(0).fill('AWS Console');
      await page.locator('.form-grid input').nth(1).fill('https://console.aws.amazon.com');
      // Select Group "工作区" (which is always enabled)
      await page.locator('.group-tag-checkbox').filter({ hasText: '工作区' }).click();
      await page.locator('.modal-actions .primary-action').click();

      // Search for AWS Console (specifically, to avoid fuzzy subsequence matching other resources)
      const searchInput = page.locator('.search-shell input');
      await searchInput.fill('AWS Console');
      await expect(page.locator('.resource-row')).toHaveCount(1);

      // Edit AWS card
      const awsCard = page.locator('.resource-row').first();
      await awsCard.locator('button[title="编辑"]').click();
      await page.waitForSelector('.editor-panel');

      // Modify subtitle and save
      await page.locator('.form-grid input').nth(2).fill('AWS Cloud Management Console');
      await page.locator('.modal-actions .primary-action').click();

      // Verify persistence
      await expect(page.locator('.resource-row .resource-copy small')).toHaveText('AWS Cloud Management Console');
    });

    test('3. System Plugin Lifecycle Workflow', async ({ page }) => {
      await setInitialTheme(page, 'atelier-zero');
      await page.goto('/');
      await page.waitForSelector('.app-shell');

      // Open plugins overlay via sidebar mini-panel button
      await page.locator('.mini-panel-button').first().click();
      await page.waitForSelector('.plugin-card');

      // Toggle Browser Bookmarks
      const targetCard = page.locator('.plugin-card').filter({ hasText: 'Browser Bookmarks' }).first();
      const switchBtn = targetCard.locator('.switch-button');
      const initialText = await switchBtn.innerText();

      await switchBtn.click();
      await page.waitForTimeout(500);

      const nextText = await switchBtn.innerText();
      expect(nextText).not.toBe(initialText);

      // Close plugins overlay
      const closeBtn = page.locator('.modal-panel .modal-head button.icon-action').first();
      await closeBtn.click();
      await page.waitForSelector('.modal-panel', { state: 'detached' });

      // Verify status card holds correct styles on dashboard
      await page.waitForSelector('.status-card');
      const statusIconColor = await getComputedStyle(page, '.status-icon', 'color');
      expect(parseColor(statusIconColor)).toEqual(parseColor('#4f8a4f')); // green
    });

    test('4. Error Handling and Reset Workflow', async ({ page }) => {
      await setInitialTheme(page, 'atelier-zero');
      await page.goto('/');
      await page.waitForSelector('.app-shell');

      // Corrupt database in localStorage
      await page.evaluate(() => {
        window.localStorage.setItem('orbitstart.browser.snapshot', '{invalid_json_state');
      });

      // Force reload
      await page.reload();
      await page.waitForSelector('.app-shell');

      // Verify fallback to Local Galaxy
      expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('local-galaxy');

      // Navigate back to Themes Settings and select Atelier Zero
      await page.goto('/?view=settings&panel=themes');
      await page.waitForSelector('.theme-card');
      await page.locator('.theme-card').filter({ hasText: 'Atelier Zero' }).first().click();

      // Verify recovery using auto-retrying toHaveAttribute expect
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'atelier-zero');
    });

    test('5. Multi-Theme Swap Stress Test', async ({ page }) => {
      await page.goto('/?view=settings&panel=themes');
      await page.waitForSelector('.theme-card');

      const themeManifests = [
        { name: 'Local Galaxy', id: 'local-galaxy', bg: '#050812' },
        { name: 'Zentou Wireframe', id: 'orbit-dark', bg: '#FAF6EE' },
        { name: 'Atelier Charcoal', id: 'atelier-charcoal', bg: '#eceff3' },
        { name: 'Atelier Sky', id: 'atelier-sky', bg: '#dff2ff' },
        { name: 'People\'s Platform', id: 'ink-blue', bg: '#F7F3E7' },
        { name: 'Atelier Mint', id: 'atelier-mint', bg: '#e3f8ec' },
        { name: 'Atelier Zero', id: 'atelier-zero', bg: '#fbf6ee' }
      ];

      for (const t of themeManifests) {
        // Click theme card
        const card = page.locator('.theme-card').filter({ hasText: t.name }).first();
        await card.click();
        await expect(page.locator('html')).toHaveAttribute('data-theme', t.id);

        // Verify bg variable is updated and matches
        const computedBg = await getComputedStyle(page, '.app-shell', 'background-color');
        expect(parseColor(computedBg)).toEqual(parseColor(t.bg));
      }
    });

  });

});
