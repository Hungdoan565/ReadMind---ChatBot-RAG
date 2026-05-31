import { test, expect } from '@playwright/test';

test('uploads a PDF file and shows it in the document list', async ({ page }) => {
  let documents: Array<{ doc_id: string; source: string; chunk_count: number }> = [];

  await page.route('**/api/documents?**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ documents, total: documents.length }),
    });
  });

  await page.route('**/api/ingest', async (route) => {
    documents = [{ doc_id: 'pdf-1', source: 'sample.pdf', chunk_count: 4 }];
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ doc_id: 'pdf-1', source: 'sample.pdf', chunk_count: 4, status: 'success', message: 'ok' }),
    });
  });

  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles({
    name: 'sample.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('fake pdf'),
  });

  await expect(page.getByText('sample.pdf')).toBeVisible();
});

test('shows error for unsupported file type', async ({ page }) => {
  await page.route('**/api/documents?**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ documents: [], total: 0 }),
    });
  });

  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles({
    name: 'malware.exe',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from('oops'),
  });

  await expect(page.getByText(/Invalid file type/)).toBeVisible();
});
