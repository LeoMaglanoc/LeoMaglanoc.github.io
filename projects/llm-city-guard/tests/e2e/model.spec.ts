import { expect, test } from '@playwright/test';

test.skip(!process.env.RUN_MODEL_TEST, 'Real model test is opt-in after downloading assets.');
test.setTimeout(12 * 60_000);

test('pinned local WebGPU model works with outside network blocked', async ({ page }) => {
  await page.route(/https?:\/\/(?!127\.0\.0\.1|localhost)/, (route) => route.abort());
  await page.goto('/?debug=1');
  await expect(page.getByPlaceholder('Say something...')).toBeVisible({ timeout: 10 * 60_000 });
  await expect(page.getByText('Backend: WEBGPU')).toBeVisible();
  await expect(page.getByText('GPU confirmed: YES')).toBeVisible();
  await page.getByPlaceholder('Say something...').fill('I have medicine for the sick people inside.');
  await page.getByRole('button', { name: 'SEND' }).click();
  await expect(page.locator('.transcript .npc').last()).toBeVisible({ timeout: 60_000 });
});
