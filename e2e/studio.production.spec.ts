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
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  // Scoped to the header action: an account with no recent work also renders a 'Create video'
  // button in the empty Recent Work panel, and the production demo account starts empty.
  await page.locator('[data-page-actions]').getByRole('button', { name: 'Create video' }).click();
  await expect(page.getByRole('button', { name: 'Start camera' })).toBeVisible();

  await page.goto('/studio/create');
  await expect(page.getByRole('figure', { name: 'Studio media stage' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start camera' })).toBeVisible();

  await page.reload();
  await expect(page).toHaveURL(/\/studio\/create$/u);
  await expect(page.getByRole('figure', { name: 'Studio media stage' })).toHaveCount(1);
});
