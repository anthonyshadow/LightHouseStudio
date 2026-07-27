import { expect, test } from '@playwright/test';

test('serves the built Studio and local health endpoint from one production origin', async ({
  page,
  request,
}) => {
  const health = await request.get('/api/health');
  expect(health.ok()).toBe(true);
  await expect(health.json()).resolves.toEqual({ ok: true });

  await page.goto('/');
  await expect(page.getByRole('figure', { name: 'Studio media stage' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start Camera + Mic' })).toBeVisible();
});
