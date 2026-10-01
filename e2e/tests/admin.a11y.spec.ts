import { expect, test } from '@playwright/test';
import { apiLogin, DEMO_PASSWORD, expectNoSeriousA11yViolations } from './helpers';

// neha is the seeded team admin (not super admin).
test.describe('admin accessibility (axe, serious + critical only)', () => {
  test.beforeEach(async ({ page }) => {
    await apiLogin(page.request, 'neha', DEMO_PASSWORD);
  });

  test('Overview', async ({ page }) => {
    await page.goto('./');
    await expect(page.getByRole('heading', { name: 'Overview', level: 1 })).toBeVisible();
    await page.waitForLoadState('networkidle');
    await expectNoSeriousA11yViolations(page, 'Admin overview');
  });

  test('Members', async ({ page }) => {
    await page.goto('members');
    await expect(page.getByRole('heading', { name: 'Members', level: 1 })).toBeVisible();
    await page.waitForLoadState('networkidle');
    await expectNoSeriousA11yViolations(page, 'Admin members');
  });
});
