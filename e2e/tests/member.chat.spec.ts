import { expect, test } from '@playwright/test';
import { memberSignIn, uid } from './helpers';

const USER = 'arjun';

test.describe('chat', () => {
  test('send a message and react to it', async ({ page }) => {
    await memberSignIn(page, USER);
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Chat' }).click();
    await expect(page).toHaveURL(/\/chat$/);

    const text = `E2E hello crew ${uid()}`;
    const composer = page.getByRole('textbox', { name: 'Message' });
    await composer.fill(text);
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(composer).toHaveValue('');

    // Bubbles are groups named "You, 10:42: <text>"; the keyboard path is the "Message actions" button next to each
    // (the same sheet a long-press opens).
    const bubble = page.getByRole('group', { name: new RegExp(`^You, .*: ${text}$`) });
    await expect(bubble).toBeVisible();
    const open = page.getByRole('button', { name: new RegExp(`^Message actions — You, .*: ${text}$`) });
    await open.focus();
    await page.keyboard.press('Enter');

    const actions = page.getByRole('dialog', { name: 'Message actions' });
    await expect(actions).toBeVisible();
    await actions.getByRole('button', { name: 'React with 🔥' }).click();
    await expect(actions).toBeHidden();

    const message = page.locator('[id^="msg-"]').filter({ has: bubble });
    const pill = message.getByRole('button', { name: /^🔥 1, including you\. Remove your reaction$/ });
    await expect(pill).toBeVisible();
    await expect(pill).toHaveAttribute('aria-pressed', 'true');

    // And it stuck on the server.
    const res = await page.request.get('/api/chat/messages?limit=50');
    expect(res.ok()).toBeTruthy();
    const { messages } = (await res.json()) as { messages: { body: string; reactions: { emoji: string; count: number; mine: boolean }[] }[] };
    const mine = messages.find((m) => m.body === text);
    expect(mine?.reactions).toEqual([expect.objectContaining({ emoji: '🔥', count: 1, mine: true })]);
  });
});
