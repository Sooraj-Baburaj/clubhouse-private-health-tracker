import { expect, test } from '@playwright/test';
import { DEMO_PASSWORD, kcalLine } from './helpers';

// kabir is used only here, so failed attempts never lock out another spec's member.
const USER = 'kabir';

test.describe('member sign-in', () => {
  test('wrong password shows the error, right password lands on Today, log out returns to sign-in', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login$/);

    const username = page.getByLabel('Username or email');
    const password = page.getByLabel('Password', { exact: true });
    const submit = page.getByRole('button', { name: /Let.s go/ });

    await username.fill(USER);
    await password.fill('definitely-not-the-password');
    await submit.click();
    await expect(page.getByRole('alert')).toHaveText(/username and password don.t match/i);
    await expect(password).toHaveValue('');
    await expect(page).toHaveURL(/\/login$/);

    await password.fill(DEMO_PASSWORD);
    await submit.click();
    await expect(page).toHaveURL(/localhost:4173\/$/);
    await expect(kcalLine(page)).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Today' })).toHaveAttribute('aria-current', 'page');

    await page.getByRole('button', { name: 'Settings and profile' }).click();
    await expect(page.getByRole('button', { name: 'Edit your profile' })).toBeVisible();
    await page.getByRole('button', { name: 'Log out' }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByLabel('Username or email')).toBeVisible();

    // The session is really gone: the API answers 401 and the app bounces back to sign-in.
    expect((await page.request.get('/api/me')).status()).toBe(401);
    await page.goto('/');
    await expect(page).toHaveURL(/\/login$/);
  });
});
