// devflow step 15, 16 and 17 template for Playwright.
//
// Copy this into the target repo's end-to-end test folder and fill in the three
// constants. It has not been run by devflow's own tests, so check the API calls
// against the Playwright and axe versions the repo uses before relying on it.
//
// Needs: @playwright/test and @axe-core/playwright.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// The screens this slice changed, as paths.
const SCREENS = ['/listings'];
// How the app is told to load the worst-case fixture. Dev and test builds only.
const FIXTURE = '?fixture=worst-case';
// Where screenshots go: the task's evidence folder.
const EVIDENCE = process.env.DEVFLOW_EVIDENCE ?? '.devflow/evidence';

const WIDTHS = [320, 375, 768, 1280];
const THEMES = ['light', 'dark'] as const;

for (const screen of SCREENS) {
  const name = screen.replace(/\W+/g, '-').replace(/^-|-$/g, '') || 'home';

  for (const width of WIDTHS) {
    for (const theme of THEMES) {
      test(`${screen} holds up at ${width}px in ${theme}`, async ({ page }) => {
        const errors: string[] = [];
        page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
        page.on('pageerror', (error) => errors.push(error.message));

        await page.setViewportSize({ width, height: 900 });
        await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
        await page.goto(screen + FIXTURE);
        await page.waitForLoadState('networkidle');
        await page.screenshot({ path: `${EVIDENCE}/15-${name}-${width}-${theme}.png`, fullPage: true });

        // Step 15: nothing may force the page to scroll sideways.
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow, 'horizontal overflow in pixels').toBeLessThanOrEqual(0);
        expect(errors, 'console errors').toEqual([]);

        // Step 16: compare against the approved baseline. Baselines are created
        // only in the repo's fixed container, and updated only in a commit the
        // person approves. Never pass --update-snapshots to get a pass.
        await expect(page).toHaveScreenshot(`${name}-${width}-${theme}.png`, { fullPage: true, maxDiffPixelRatio: 0.01 });
      });
    }
  }

  test(`${screen} at 200% zoom keeps its content and controls`, async ({ page }) => {
    // A 640px-wide viewport lays out the way a 1280px screen does at 200% zoom.
    await page.setViewportSize({ width: 640, height: 900 });
    await page.goto(screen + FIXTURE);
    await page.screenshot({ path: `${EVIDENCE}/15-${name}-zoom200.png`, fullPage: true });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, 'horizontal overflow in pixels').toBeLessThanOrEqual(0);
  });

  test(`${screen} passes the automated accessibility scan`, async ({ page }) => {
    await page.goto(screen + FIXTURE);
    // Step 17: WCAG 2.2 rules are off unless their tag is listed.
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
}

// Still to write by hand for each form on the changed screens:
//  - click the submit control twice quickly and assert exactly one record exists
//  - go offline mid-flow (context.setOffline(true)) and assert a message and a way to retry
//  - complete the flow with the keyboard alone, asserting focus with toBeFocused()
