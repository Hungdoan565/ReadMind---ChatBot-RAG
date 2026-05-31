import { describe, expect, it } from 'vitest';
// Đọc tĩnh nội dung `src/index.css` dưới dạng chuỗi thô qua Vite `?raw`.
// Cách này tương đương đọc file đồng bộ nhưng không cần `@types/node`
// (dự án không cài Node types), nên build strict vẫn xanh. Khai báo kiểu
// cho `*?raw` do `vite/client` cung cấp (đã có trong tsconfig `types`).
import indexCss from '../index.css?raw';

/**
 * Static guard test for `src/index.css`.
 *
 * Theo Testing Strategy của design.md (ui-redesign-taste), đây là một
 * example/static test (KHÔNG phải property-based). Nó đọc trực tiếp nội dung
 * `index.css` và kiểm tra các bất biến tĩnh của design token sau redesign:
 *   - KHÔNG còn AI-purple / gradient-text (Req 1.4, 2.6).
 *   - CÓ accent teal cho light theme (Req 1.1).
 *
 * Validates: Requirements 1.1, 1.4, 2.6
 */

describe('index.css design tokens', () => {
  // Các chuỗi AI-purple / gradient-text đã bị loại bỏ khỏi index.css.
  const forbiddenStrings = [
    'gradient-text',
    '#6366f1',
    '#a855f7',
    '#ec4899',
    '#4f46e5',
  ];

  it.each(forbiddenStrings)('does not contain removed AI-purple/gradient token "%s"', (forbidden) => {
    expect(indexCss).not.toContain(forbidden);
  });

  it('defines the teal accent token for the light theme', () => {
    expect(indexCss).toContain('--accent: #0D9488');
  });
});
