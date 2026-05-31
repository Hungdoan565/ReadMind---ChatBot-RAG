import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/documents?**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ documents: [], total: 0 }),
    });
  });
});

test('creates a room and syncs it into the URL', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/room=/);
  await expect(page.getByRole('button', { name: /Phòng:/ })).toBeVisible();
});

test('shared room URL loads the specified room', async ({ page }) => {
  await page.goto('/?room=ABCD-EFGH');
  await expect(page.getByRole('button', { name: /Phòng: ABCD-EFGH/ })).toBeVisible();
});

test('room persists across reloads', async ({ page }) => {
  await page.goto('/?room=PERS-1234');
  await page.reload();
  await expect(page.getByRole('button', { name: /Phòng: PERS-1234/ })).toBeVisible();
});
