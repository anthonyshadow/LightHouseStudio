import { expect, test } from '@playwright/test';

test('serves the built entry, direct Studio, and local health endpoint from one production origin', async ({
  page,
  request,
}) => {
  const health = await request.get('/api/health');
  expect(health.ok()).toBe(true);
  await expect(health.json()).resolves.toEqual({ ok: true });

  await page.goto('/');
  await page.getByRole('button', { name: 'Log in' }).click();
  const login = page.getByRole('dialog', { name: 'Log in to Lightframe' });
  await login.getByLabel('Login').fill('demo@lightframe.local');
  await login.getByLabel('Password').fill('lightframe-demo');
  await login.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByRole('button', { name: 'Record New Video' })).toBeVisible();

  await page.goto('/studio');
  await expect(page.getByRole('figure', { name: 'Studio media stage' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Record New Video' })).toBeVisible();

  await page.reload();
  await expect(page).toHaveURL(/\/studio$/u);
  await expect(page.getByRole('figure', { name: 'Studio media stage' })).toHaveCount(1);
});
