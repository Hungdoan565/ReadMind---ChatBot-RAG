import { render, screen } from '@testing-library/react';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { MessageBubble } from '../MessageBubble';
import { ThemeProvider } from '../ThemeProvider';
import type { ChatMessage } from '../../types';

/**
 * Component test (example-based, Testing Library) cho MessageBubble.
 * Bám sát Testing Strategy của thiết kế: KHÔNG property-based.
 * Xác minh:
 *  - Avatar tin nhắn AI render SVG brand mark (DocumentLogoIcon dùng currentColor)
 *    và KHÔNG dùng đặc trưng của icon Lucide `Sparkles`.
 *  - Khi message lỗi, nút retry hiển thị nhãn tiếng Việt "Thử lại".
 *
 * Validates: Requirements 7.1, 7.3, 5.4
 */

function makeAssistantMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'msg-1',
    role: 'assistant',
    content: 'Xin chào, đây là câu trả lời mẫu.',
    timestamp: new Date('2024-01-01T08:30:00'),
    ...overrides,
  };
}

describe('MessageBubble', () => {
  // jsdom does not implement matchMedia, which ThemeProvider relies on.
  beforeEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  it('hiển thị SVG brand mark cho avatar tin nhắn AI, không dùng icon Sparkles', () => {
    const { container } = render(
      <ThemeProvider>
        <MessageBubble message={makeAssistantMessage()} />
      </ThemeProvider>,
    );

    // Brand mark DocumentLogoIcon: SVG viewBox 64x64, dùng stroke="currentColor".
    const brandMark = container.querySelector('svg[viewBox="0 0 64 64"]');
    expect(brandMark).not.toBeNull();

    const strokedPath = brandMark?.querySelector('path[stroke="currentColor"]');
    expect(strokedPath).not.toBeNull();

    // KHÔNG dùng đặc trưng của icon Lucide `Sparkles`.
    expect(container.querySelector('.lucide-sparkles')).toBeNull();
  });

  it('hiển thị nút "Thử lại" khi message ở trạng thái lỗi', () => {
    const onRetry = vi.fn();
    render(
      <ThemeProvider>
        <MessageBubble
          message={makeAssistantMessage({ isError: true, content: 'Đã xảy ra lỗi.' })}
          onRetry={onRetry}
        />
      </ThemeProvider>,
    );

    expect(
      screen.getByRole('button', { name: /Thử lại/ }),
    ).toBeInTheDocument();
  });
});
