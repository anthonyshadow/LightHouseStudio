import { expect, test } from '@playwright/test';

test('serves the built entry, direct Studio, and local health endpoint from one production origin', async ({
  page,
  request,
}) => {
  const health = await request.get('/api/health');
  expect(health.ok()).toBe(true);
  await expect(health.json()).resolves.toEqual({ ok: true });

  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Start with camera' })).toBeVisible();

  await page.goto('/studio');
  await expect(page.getByRole('figure', { name: 'Studio media stage' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start Camera + Mic' })).toBeVisible();

  await page.reload();
  await expect(page).toHaveURL(/\/studio$/u);
  await expect(page.getByRole('figure', { name: 'Studio media stage' })).toHaveCount(1);
});
