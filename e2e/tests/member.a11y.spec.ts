import { expect, test } from '@playwright/test';
import { expectNoSeriousA11yViolations, memberSignIn } from './helpers';

const USER = 'priya';

test.describe('accessibility (axe, serious + critical only)', () => {
  test('Login', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByLabel('Username or email')).toBeVisible();
    await expectNoSeriousA11yViolations(page, 'Login');
  });

  test.describe('signed in', () => {
    test.beforeEach(async ({ page }) => {
      await memberSignIn(page, USER);
    });

    test('Today', async ({ page }) => {
      await expectNoSeriousA11yViolations(page, 'Today');
    });

    for (const tab of ['Diet', 'Progress'] as const) {
      test(tab, async ({ page }) => {
        await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: tab }).click();
        await expect(page).toHaveURL(new RegExp(`/${tab.toLowerCase()}$`));
        // Let the tab's queries settle so we scan the real screen, not its skeleton.
        await page.waitForLoadState('networkidle');
        await expectNoSeriousA11yViolations(page, tab);
      });
    }

    test('Team', async ({ page }) => {
      await page.goto('/team');
      await expect(page).toHaveURL(/\/team$/);
      await page.waitForLoadState('networkidle');
      await expectNoSeriousA11yViolations(page, 'Team');
    });

    test('Chat', async ({ page }) => {
      await page.goto('/chat');
      await expect(page.getByRole('textbox', { name: 'Message' })).toBeVisible();
      await page.waitForLoadState('networkidle');
      await expectNoSeriousA11yViolations(page, 'Chat');
    });

    test('Meal', async ({ page }) => {
      await page.goto('/log/food');
      await expect(page.getByRole('searchbox', { name: 'Search food' })).toBeVisible();
      await expectNoSeriousA11yViolations(page, 'Meal');
    });

    test('Settings', async ({ page }) => {
      await page.getByRole('button', { name: 'Settings and profile' }).click();
      await expect(page.getByRole('button', { name: 'Log out' })).toBeVisible();
      await expectNoSeriousA11yViolations(page, 'Settings');
    });
  });
});
