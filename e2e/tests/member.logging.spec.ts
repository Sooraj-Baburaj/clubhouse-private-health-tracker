import { expect, test, type Page } from '@playwright/test';
import { memberSignIn, memberToday, openLogOption, toast, uid } from './helpers';

// rahul is this spec's member; every row it creates carries a unique name.
const USER = 'rahul';

const heroStatus = (page: Page) => page.getByRole('status').filter({ hasText: /kcal (left of|past) your/ });

test.describe('logging', () => {
  test.beforeEach(async ({ page }) => {
    await memberSignIn(page, USER);
  });

  test('log food by search', async ({ page }) => {
    const before = await heroStatus(page).textContent();
    await openLogOption(page, 'Search food');
    await expect(page).toHaveURL(/\/log\/food/);

    await page.getByRole('searchbox', { name: 'Search food' }).fill('idli');
    // Search-result add buttons are just "Add <name>"; usual chips ("Add Idli, 2 idlis, 118 kcal") fade out as you type.
    const add = page.getByRole('button', { name: /^Add [^,]*idli[^,]*$/i }).first();
    await expect(add).toBeVisible({ timeout: 10_000 });
    const label = (await add.getAttribute('aria-label'))!;
    const food = label.replace(/^Add /, '');
    await add.click();
    await expect(toast(page, `${food} added`)).toBeVisible();

    const save = page.getByRole('button', { name: /^Add to .+ · [\d,]+ kcal$/ });
    await expect(save).toBeEnabled();
    await save.click();
    await expect(toast(page, /[\d,]+ kcal added to /)).toBeVisible();

    await expect(page).toHaveURL(/localhost:4173\/$/);
    // Today's food rows open the meal to edit (swipe or long-press for the other actions).
    await expect(page.getByRole('button', { name: new RegExp(`: .*${food}.*kcal.*Edit meal`, 'i') }).first()).toBeVisible();
    await expect(heroStatus(page)).not.toHaveText(before ?? '');
  });

  test('log an activity', async ({ page }) => {
    await openLogOption(page, 'Log activity');
    await expect(page).toHaveURL(/\/log\/activity/);
    // The submit reads "Log <type>" once a type is picked ("Log activity", disabled, before that).
    const submit = page.getByRole('button', { name: /^Log (?!something$)[\w -]+$/ });
    await expect(submit).toBeEnabled({ timeout: 10_000 });
    await submit.click();
    await expect(toast(page, /logged · −[\d,]+ kcal/)).toBeVisible();
    await expect(page).toHaveURL(/localhost:4173\/$/);
  });

  test('log weight via the sheet', async ({ page }) => {
    await openLogOption(page, 'Log weight');
    const sheet = page.getByRole('dialog', { name: 'Log weight' });
    await expect(sheet).toBeVisible();
    const weight = `${70 + Math.floor(Math.random() * 20)}.${1 + Math.floor(Math.random() * 8)}`;
    await sheet.getByLabel(/Weight in (kg|lb)/).fill(weight);
    await sheet.getByRole('button', { name: 'Save weight' }).click();
    await expect(toast(page, /Weight logged · /)).toBeVisible();
    await expect(sheet).toBeHidden();
    await expect(page.getByRole('button', { name: new RegExp(`^Weigh-in ${weight.replace('.', '\\.')} (kg|lb)`) })).toBeVisible();
  });

  test('offline: two foods queue on the phone and sync exactly once', async ({ page, context }) => {
    const date = await memberToday(page.request);
    const names = [`E2E offline A ${uid()}`, `E2E offline B ${uid()}`];

    await context.setOffline(true);
    for (const [i, name] of names.entries()) {
      await openLogOption(page, 'Search food');
      await expect(page).toHaveURL(/\/log\/food/);
      await page.getByRole('button', { name: /^Quick add/ }).click();
      const sheet = page.getByRole('dialog', { name: 'Quick add' });
      await sheet.getByLabel('Calories').fill(String(101 + i));
      await sheet.getByRole('button', { name: 'Add details (optional)' }).click();
      await sheet.getByLabel('What was it?').fill(name);
      await sheet.getByRole('button', { name: 'Add to plate' }).click();
      await expect(sheet).toBeHidden();
      await page.getByRole('button', { name: new RegExp(`^Add to .+ · ${101 + i} kcal$`) }).click();
      await expect(toast(page, 'Saved on your phone. It will sync when you’re back online.').last()).toBeVisible();
      await expect(page).toHaveURL(/localhost:4173\/$/);
      await expect(page.getByRole('button', { name: new RegExp(`${name}.*waiting to sync`) })).toBeVisible();
    }

    await context.setOffline(false);

    const countRows = async () => {
      const res = await page.request.get(`/api/logs?date=${date}`);
      expect(res.ok()).toBeTruthy();
      const body = (await res.json()) as { foodLogs: { id: string; deleted?: boolean; items: { name: string }[] }[] };
      return names.map((n) => body.foodLogs.filter((f) => !f.deleted && f.items.some((it) => it.name === n)).length);
    };
    await expect.poll(countRows, { timeout: 30_000, message: 'both queued logs reach the server' }).toEqual([1, 1]);
    // A second flush (visibility change, interval, reconnect) must not duplicate anything.
    await page.waitForTimeout(2_500);
    expect(await countRows()).toEqual([1, 1]);
    for (const name of names) await expect(page.getByRole('button', { name: new RegExp(`${name}(?!.*waiting to sync)`) })).toBeVisible();
  });
});
