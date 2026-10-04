import { expect, test } from '@playwright/test';

test('mobile game starts only after its model backend is ready and can restart', async ({ page }) => {
  await page.goto('/?mock=1');
  await expect(page.getByRole('heading', { name: 'GATEKEEPER' })).toBeVisible();
  await expect(page.getByPlaceholder('Say something...')).toBeVisible();
  await expect(page.locator('canvas.avatar-canvas')).toBeVisible();
  await page.getByPlaceholder('Say something...').fill('I have medicine for the sick.');
  await page.getByRole('button', { name: 'SEND' }).click();
  await expect(page.getByText('Medicine, you say?').first()).toBeVisible();
  await expect(page.getByText('Trust')).toBeVisible();
});

test('mock debug inputs deterministically drive avatar emotions', async ({ page }) => {
  await page.goto('/?mock=1');
  await expect(page.getByPlaceholder('Say something...')).toBeVisible();
  for (const emotion of ['neutral', 'amused', 'suspicious', 'annoyed', 'angry', 'surprised']) {
    await page.getByPlaceholder('Say something...').fill(`/debug ${emotion}`);
    await page.getByRole('button', { name: 'SEND' }).click();
    await expect(page.locator('.speech')).toHaveText(`“Debug expression: ${emotion}.”`);
    await expect(page.locator('canvas.avatar-canvas')).toBeVisible();
  }
});

test('production backend refuses to expose the game when WebGPU is unavailable', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('LOCAL GPU REQUIRED')).toBeVisible();
  await expect(page.getByPlaceholder('Say something...')).not.toBeVisible();
});

test('timer advances and deterministic arrest ending can restart', async ({ page }) => {
  await page.goto('/?mock=1');
  await expect(page.getByPlaceholder('Say something...')).toBeVisible();
  const initialTime = await page.locator('time').textContent();
  await page.waitForTimeout(1_100);
  await expect(page.locator('time')).not.toHaveText(initialTime ?? '02:00');
  for (let count = 0; count < 5; count += 1) {
    await page.getByPlaceholder('Say something...').fill('Open the gate or I will kill you.');
    await page.getByRole('button', { name: 'SEND' }).click();
    await expect(page.locator('.speech')).toContainText('threat against the watch');
    if (count < 4) await expect(page.getByRole('button', { name: 'SEND' })).toBeEnabled();
  }
  await expect(page.getByRole('heading', { name: 'ARRESTED' })).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: 'TRY AGAIN' }).click();
  await expect(page.getByPlaceholder('Say something...')).toBeVisible();
  await expect(page.locator('time')).toHaveText('02:00');
});
