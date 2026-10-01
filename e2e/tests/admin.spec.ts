import { randomUUID } from 'node:crypto';
import { devices, expect, test, type Page } from '@playwright/test';
import { CLIENT_HEADERS, kcalLine, SUPER_ADMIN, uid, WEB_URL } from './helpers';

async function adminSignIn(page: Page) {
  await page.goto('login');
  await page.getByLabel('Username or email').fill(SUPER_ADMIN.login);
  await page.getByLabel('Password').fill(SUPER_ADMIN.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Overview', level: 1 })).toBeVisible({ timeout: 15_000 });
}

test.describe('admin panel', () => {
  test.beforeEach(async ({ page }) => {
    await adminSignIn(page);
  });

  test('create a member, who signs in with the temp password, changes it and onboards', async ({ page, browser }) => {
    const id = uid();
    const username = `e2e${id}`.slice(0, 30);
    const displayName = `E2E Tester ${id}`;

    await page.getByRole('navigation', { name: 'Admin' }).getByRole('link', { name: 'Members' }).click();
    await expect(page.getByRole('heading', { name: 'Members', level: 1 })).toBeVisible();
    await page.getByRole('button', { name: 'New member' }).first().click();
    const modal = page.getByRole('dialog', { name: 'New member' });
    await modal.getByLabel('Display name').fill(displayName);
    await modal.getByLabel('Username').fill(username);
    await modal.getByRole('button', { name: 'Create member' }).click();

    const created = page.getByRole('dialog', { name: 'Member created' });
    await expect(created).toBeVisible();
    await expect(created.getByText(`@${username}`)).toBeVisible();
    const tempPassword = (await created.locator('code').textContent())!.trim();
    expect(tempPassword.length).toBeGreaterThanOrEqual(10);
    await created.getByRole('button', { name: 'Done' }).click();
    await expect(created).toBeHidden();

    // The member signs in on their phone.
    const phone = await browser.newContext({ ...devices['Pixel 7'], baseURL: WEB_URL });
    try {
      const m = await phone.newPage();
      await m.goto('/login');
      await m.getByLabel('Username or email').fill(username);
      await m.getByLabel('Password', { exact: true }).fill(tempPassword);
      await m.getByRole('button', { name: /Let.s go/ }).click();

      await expect(m).toHaveURL(/\/change-password$/);
      const newPassword = `E2e-pass-${id}-9`;
      await m.getByLabel('Temporary password', { exact: true }).fill(tempPassword);
      await m.getByLabel('New password', { exact: true }).fill(newPassword);
      await m.getByLabel('Type it again', { exact: true }).fill(newPassword);
      await m.getByRole('button', { name: 'Save and continue' }).click();

      await expect(m).toHaveURL(/\/onboarding/);
      await expect(m.getByText('Step 1 of 4')).toBeVisible();
      await m.getByRole('textbox', { name: /^Height/ }).fill('172');
      await m.getByRole('textbox', { name: /^Weight/ }).fill('74');
      await m.getByLabel('Date of birth').fill('1992-04-15');
      await m.getByRole('button', { name: 'Male', exact: true }).click();
      await m.getByRole('radio', { name: /Lightly active/ }).click();
      await m.getByRole('button', { name: 'Next' }).click();

      await expect(m.getByText('Step 2 of 4')).toBeVisible();
      await m.getByRole('button', { name: /^Lock in [\d,]+ kcal$/ }).click();
      await expect(m.getByText('Step 3 of 4')).toBeVisible();
      await m.getByRole('button', { name: 'Next' }).click();
      await expect(m.getByText('Step 4 of 4')).toBeVisible();
      await m.getByRole('button', { name: 'Start logging' }).click();

      await expect(m).toHaveURL(/localhost:4173\/$/);
      await expect(kcalLine(m)).toBeVisible();

      // The old temp password no longer works; the new one does.
      const api = phone.request;
      expect((await api.post('/api/auth/login', { headers: CLIENT_HEADERS, data: { login: username, password: tempPassword } })).status()).toBe(401);
      expect((await api.post('/api/auth/login', { headers: CLIENT_HEADERS, data: { login: username, password: newPassword } })).ok()).toBeTruthy();
    } finally {
      await phone.close();
    }
  });

  test('build a trigger and dry-run it', async ({ page }) => {
    const name = `E2E trigger ${uid()}`;
    try {
      await page.goto('memes?tab=triggers');
      await page.getByRole('button', { name: 'New trigger' }).first().click();
      const drawer = page.getByRole('dialog', { name: 'New trigger' });
      await expect(drawer).toBeVisible();
      await drawer.getByRole('textbox', { name: /^Name/ }).fill(name);
      await drawer.getByRole('button', { name: 'Create trigger' }).click();

      // After saving, the drawer re-opens on the saved trigger.
      const saved = page.getByRole('dialog', { name });
      await expect(saved).toBeVisible();
      await expect(saved.getByRole('button', { name: 'Save' })).toBeDisabled();
      await saved.getByRole('button', { name: 'Close', exact: true }).click();
      await expect(saved).toBeHidden();
      await expect(page.getByRole('switch', { name: `Switch on ${name}` })).toBeVisible();

      await page.getByRole('tab', { name: /Dry run/ }).click();
      const memberSelect = page.getByRole('combobox', { name: /^Member/ });
      await expect(memberSelect.locator('option', { hasText: '(@rahul)' })).toHaveCount(1);
      const rahul = await memberSelect.locator('option', { hasText: '(@rahul)' }).getAttribute('value');
      await memberSelect.selectOption(rahul!);
      await page.getByRole('combobox', { name: /^Triggers/ }).selectOption({ label: `${name} · off` });
      await page.getByRole('button', { name: 'Run dry run' }).click();

      await expect(page.getByText(name, { exact: true })).toBeVisible();
      await expect(page.getByText(/would fire|No events that day/).first()).toBeVisible();
    } finally {
      const list = await page.request.get('/api/admin/triggers');
      if (list.ok()) {
        const t = ((await list.json()) as { id: string; name: string }[]).find((x) => x.name === name);
        if (t) await page.request.delete(`/api/admin/triggers/${t.id}`, { headers: CLIENT_HEADERS });
      }
    }
  });

  test('toggle AI mode off, then back on', async ({ page }) => {
    try {
      await page.goto('ai');
      const master = page.getByRole('switch', { name: 'AI mode' });
      await expect(master).toBeEnabled();
      await expect(master, 'AI should start on (AI_MODE=mock, seeded on)').toHaveAttribute('aria-checked', 'true');

      await master.click();
      const off = page.getByRole('dialog', { name: 'Turn AI mode off?' });
      await off.getByLabel('Reason').fill('E2E: checking the off switch');
      await off.getByRole('button', { name: 'Turn AI off' }).click();
      await expect(off).toBeHidden();
      await expect(master).toHaveAttribute('aria-checked', 'false');
      await expect(page.getByText('AI mode is off. Members get the logic-only fallbacks.')).toBeVisible();

      await master.click();
      const on = page.getByRole('dialog', { name: 'Turn AI mode on?' });
      await on.getByLabel('Reason').fill('E2E: switching it back on');
      await on.getByRole('button', { name: 'Turn AI on' }).click();
      await expect(on).toBeHidden();
      await expect(master).toHaveAttribute('aria-checked', 'true');
    } finally {
      // Never leave the team with AI off for the specs that follow.
      await page.request.post('/api/admin/ai/global', { headers: CLIENT_HEADERS, data: { on: true, reason: 'E2E cleanup' } });
    }
  });

  test('clear chat preview shows counts (nothing is cleared)', async ({ page }) => {
    // Post one message so the last-24-hours preview has something to count; it is deleted again below.
    const messageId = randomUUID();
    const posted = await page.request.put(`/api/chat/messages/${messageId}`, { headers: CLIENT_HEADERS, data: { body: `E2E clear-preview probe ${uid()}`, attachments: [] } });
    expect(posted.ok(), await posted.text()).toBeTruthy();
    try {
      await page.goto('chat');
      await page.getByRole('button', { name: 'Clear by time period' }).click();
      const modal = page.getByRole('dialog', { name: 'Clear chat' });
      await expect(modal.getByRole('combobox', { name: 'Period' })).toHaveValue('24h');
      await modal.getByRole('button', { name: 'Preview' }).click();
      await expect(modal.getByText(/^[\d,]+ messages? · [\d,]+ images?$/)).toBeVisible();
      await expect(modal.getByRole('button', { name: 'Clear messages' })).toBeVisible();
      await modal.getByRole('button', { name: 'Cancel' }).click();
      await expect(modal).toBeHidden();
    } finally {
      await page.request.delete(`/api/chat/messages/${messageId}`, { headers: CLIENT_HEADERS });
    }
  });
});
