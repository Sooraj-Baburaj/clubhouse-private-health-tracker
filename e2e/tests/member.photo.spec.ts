import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { memberSignIn, openLogOption, toast } from './helpers';

const USER = 'meera';
const PHOTO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../apps/web/public/icons/icon-512.png');

test.describe('AI photo logging (AI_MODE=mock)', () => {
  test('photo → "Found N things" → on the plate → saved to the day', async ({ page }) => {
    await memberSignIn(page, USER);
    const me = await (await page.request.get('/api/me')).json();
    test.skip(!me.ai.photoAvailable, 'AI photo reading is off for this member/team (run with AI_MODE=mock and AI on).');

    await openLogOption(page, 'Snap a meal');
    await expect(page).toHaveURL(/\/log\/food\?.*view=snap/);

    // Emulated devices have no camera: use the "Choose a photo" file-input fallback.
    await expect(page.getByRole('button', { name: 'Choose a photo' })).toBeVisible();
    await page.locator('input[type="file"][accept="image/*"]').setInputFiles(PHOTO);

    const found = page.getByText(/^Found \d+ things?$/);
    await expect(found).toBeVisible({ timeout: 25_000 });
    const n = Number((await found.textContent())!.match(/\d+/)![0]);
    expect(n).toBeGreaterThan(0);

    // The read goes on the plate first ("Add to lunch"), then the meal is saved ("Add to lunch · 420 kcal").
    const onPlate = page.getByRole('button', { name: /^Add to [\w\s]+$/ });
    await expect(onPlate).toBeEnabled({ timeout: 15_000 });
    await onPlate.click();
    await expect(toast(page, /\d+ things? on your plate/)).toBeVisible();
    const save = page.getByRole('button', { name: /^Add to .+ · [\d,]+ kcal$/ });
    await expect(save).toBeEnabled({ timeout: 15_000 });
    await save.click();
    await expect(toast(page, /[\d,]+ kcal added to /)).toBeVisible();
    await expect(page).toHaveURL(/localhost:4173\/$/);
    await expect(page.getByRole('button', { name: /made with AI.*Edit meal/ }).first()).toBeVisible();
  });
});
