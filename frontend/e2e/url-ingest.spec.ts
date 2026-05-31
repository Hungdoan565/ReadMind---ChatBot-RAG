import { test, expect } from '@playwright/test';

test('ingests a URL and shows it in the document list', async ({ page }) => {
  let documents: Array<{ doc_id: string; source: string; chunk_count: number }> = [];

  await page.route('**/api/documents?**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ documents, total: documents.length }),
    });
  });

  await page.route('**/api/ingest/url', async (route) => {
    documents = [{ doc_id: 'url-1', source: 'https://example.com/article', chunk_count: 2 }];
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ doc_id: 'url-1', source: 'https://example.com/article', chunk_count: 2, status: 'success', message: 'ok' }),
    });
  });

  await page.goto('/');
  await page.getByPlaceholder('https://example.com/document').fill('https://example.com/article');
  await page.getByRole('button', { name: /Ingest URL/ }).click();

  await expect(page.getByText('article')).toBeVisible();
});

test('shows error for invalid URL', async ({ page }) => {
  await page.route('**/api/documents?**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ documents: [], total: 0 }),
    });
  });

  await page.goto('/');
  await page.getByPlaceholder('https://example.com/document').fill('not-a-url');
  await page.getByRole('button', { name: /Ingest URL/ }).click();

  await expect(page.getByText('Please enter a valid URL')).toBeVisible();
});
