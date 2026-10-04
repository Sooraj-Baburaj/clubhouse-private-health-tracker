import { expect, test, type Page } from '@playwright/test';
import { apiLogin, CLIENT_HEADERS, memberSignIn } from './helpers';

/** Row counts in the browser's IndexedDB caches (food catalogue, chat history) and their sync bookkeeping. */
async function cacheCounts(page: Page) {
  return page.evaluate(
    () =>
      new Promise<{ foods: number; chat: number; synced: string[] }>((resolve, reject) => {
        const open = indexedDB.open('clubhouse');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const tx = open.result.transaction(['foods', 'chatMessages', 'syncMeta']);
          const out = { foods: 0, chat: 0, synced: [] as string[] };
          let pending = 3;
          const done = () => --pending === 0 && resolve(out);
          tx.objectStore('foods').count().onsuccess = (e) => ((out.foods = (e.target as IDBRequest<number>).result), done());
          tx.objectStore('chatMessages').count().onsuccess = (e) => ((out.chat = (e.target as IDBRequest<number>).result), done());
          tx.objectStore('syncMeta').getAll().onsuccess = (e) => {
            out.synced = (e.target as IDBRequest<{ name: string; cursor: string | null }[]>).result.filter((m) => m.cursor).map((m) => m.name);
            done();
          };
        };
      }),
  );
}

test.describe('offline caches', () => {
  test('food catalogue and chat history sync to the device, work offline, and pick up remote changes', async ({ page, browser }) => {
    await memberSignIn(page, 'meera');
    await expect.poll(() => cacheCounts(page), { timeout: 15_000 }).toMatchObject({ synced: expect.arrayContaining(['foods', 'chat']) });
    const counts = await cacheCounts(page);
    expect(counts.foods).toBeGreaterThan(2000);
    expect(counts.chat).toBeGreaterThan(0);

    // Offline: search runs against the local catalogue, typo included.
    await page.goto('/log/food?mode=search');
    await expect(page.getByRole('searchbox', { name: 'Search food' })).toBeVisible();
    await page.context().setOffline(true);
    await page.getByRole('searchbox', { name: 'Search food' }).fill('paner');
    await expect(page.getByRole('button', { name: /^Paneer, .*Choose portion$/ })).toBeVisible();

    // Offline: the chat opens from the cache.
    await page.getByRole('button', { name: 'Back' }).click();
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: /^Team/ }).click();
    if (!page.url().endsWith('/chat')) await page.getByRole('button', { name: /^Open team chat/ }).click();
    await expect(page.getByRole('group').first()).toBeVisible();

    // Back online: a reaction from someone else arrives through the delta feed.
    await page.context().setOffline(false);
    const other = await browser.newContext({ baseURL: test.info().project.use.baseURL });
    await apiLogin(other.request, 'arjun');
    const latest = (await (await other.request.get('/api/chat/messages?limit=5')).json()) as { messages: { id: string }[] };
    const target = latest.messages.at(-1)!;
    await other.request.post(`/api/chat/messages/${target.id}/reactions`, { headers: CLIENT_HEADERS, data: { emoji: '🎉', on: true } });
    try {
      await expect(page.getByRole('button', { name: /^🎉 \d+/ }).first()).toBeVisible({ timeout: 15_000 });
    } finally {
      await other.request.post(`/api/chat/messages/${target.id}/reactions`, { headers: CLIENT_HEADERS, data: { emoji: '🎉', on: false } });
      await other.close();
    }
  });
});
