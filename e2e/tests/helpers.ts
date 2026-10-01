import AxeBuilder from '@axe-core/playwright';
import { expect, type APIRequestContext, type Page } from '@playwright/test';

/** Seeded demo accounts (pnpm seed:demo) and the local super admin (pnpm setup:super-admin). */
export const DEMO_PASSWORD = 'clubhouse-demo-1';
export const SUPER_ADMIN = { login: 'aditi', password: 'clubhouse-2026!' } as const;
export const WEB_URL = 'http://localhost:4173';

/** The API rejects mutations without the client header (CSRF guard). */
export const CLIENT_HEADERS = { 'x-clubhouse-client': 'web' } as const;

/** Short, collision-free suffix so reruns never trip over earlier data. */
export const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/**
 * Signs in through the API. Pass `page.request` (it shares the browser context's cookie jar), so the session cookie
 * lands in the page too. Paths are absolute, which also works for the admin baseURL (/admin/).
 */
export async function apiLogin(request: APIRequestContext, login: string, password = DEMO_PASSWORD) {
  const res = await request.post('/api/auth/login', { headers: CLIENT_HEADERS, data: { login, password, deviceLabel: 'Playwright' } });
  expect(res.ok(), `login ${login}: ${res.status()} ${await res.text()}`).toBeTruthy();
  return res.json() as Promise<{ mfaRequired: boolean; mustChangePassword: boolean; role: string }>;
}

/** Today's hero line, either side of the budget. */
export const kcalLine = (page: Page) => page.getByText(/kcal (left to fuel|past today’s budget)/).first();

/** Signs a seeded member in and waits for Today. */
export async function memberSignIn(page: Page, login: string, password = DEMO_PASSWORD) {
  await apiLogin(page.request, login, password);
  await page.goto('/');
  await expect(kcalLine(page)).toBeVisible({ timeout: 15_000 });
}

/** The member's own "today" (team/member timezone), from /api/me. */
export async function memberToday(request: APIRequestContext): Promise<string> {
  const res = await request.get('/api/me');
  expect(res.ok()).toBeTruthy();
  return ((await res.json()) as { today: string }).today;
}

/** Opens the tab-bar "+" sheet and picks an option. */
export async function openLogOption(page: Page, option: 'Snap a meal' | 'Search food' | 'Log activity' | 'Log weight') {
  await page.getByRole('button', { name: 'Log something' }).first().click();
  const sheet = page.getByRole('dialog', { name: 'What are we logging?' });
  await expect(sheet).toBeVisible();
  await sheet.getByRole('button', { name: new RegExp(`^${option}`) }).click();
  if (option !== 'Log weight') await expect(sheet).toBeHidden();
}

/** Toast text (the member app's toaster is a single role=status live region at the top). */
export const toast = (page: Page, text: string | RegExp) => page.locator('[aria-live="polite"][role="status"]').getByText(text);

/**
 * axe-core scan that fails only on serious/critical violations. Waits a moment first so entrance animations
 * (opacity/transform springs) have settled and don't produce half-faded colour-contrast noise.
 */
export async function expectNoSeriousA11yViolations(page: Page, label: string) {
  await page.waitForTimeout(800);
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice']).analyze();
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  const report = serious.map((v) => `[${v.impact}] ${v.id}: ${v.help}\n${v.nodes.slice(0, 5).map((n) => `    ${n.target.join(' ')} — ${n.failureSummary?.split('\n').slice(1, 2).join(' ').trim() ?? ''}`).join('\n')}`).join('\n');
  expect(serious, `${label}: serious/critical axe violations\n${report}`).toEqual([]);
}
