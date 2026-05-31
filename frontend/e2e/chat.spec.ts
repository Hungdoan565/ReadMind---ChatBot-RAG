import { test, expect } from '@playwright/test';

test('sends a message and renders streamed response with sources', async ({ page }) => {
  await page.route('**/api/documents?**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        documents: [{ doc_id: 'doc-1', source: 'sample.pdf', chunk_count: 3 }],
        total: 1,
      }),
    });
  });

  await page.route('**/api/chat', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 200));
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: [
        'data: {"event":"start","session_id":"sess-1"}',
        '',
        'data: {"event":"token","data":"Xin chào"}',
        '',
        'data: {"event":"token","data":" từ ReadMind"}',
        '',
        'data: {"event":"end","session_id":"sess-1","sources":[{"source":"sample.pdf","content_preview":"preview"}]}',
        '',
      ].join('\n'),
    });
  });

  await page.goto('/');
  await page.getByPlaceholder('Đặt câu hỏi về tài liệu của bạn...').fill('Xin chào');
  await page.keyboard.press('Enter');

  await expect(page.getByText('Thinking...')).toBeVisible();
  await expect(page.getByText('Xin chào từ ReadMind')).toBeVisible();
  await expect(page.getByText(/Sources \(1\)/)).toBeVisible();
});

test('handles direct AI mode with an empty room', async ({ page }) => {
  await page.route('**/api/documents?**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ documents: [], total: 0 }),
    });
  });

  await page.route('**/api/chat', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: [
        'data: {"event":"start","session_id":"sess-2"}',
        '',
        'data: {"event":"token","data":"General answer"}',
        '',
        'data: {"event":"end","session_id":"sess-2","sources":[]}',
        '',
      ].join('\n'),
    });
  });

  await page.goto('/');
  await page.getByPlaceholder('Đặt câu hỏi về tài liệu của bạn...').fill('Hello');
  await page.keyboard.press('Enter');

  await expect(page.getByText('General answer')).toBeVisible();
});
