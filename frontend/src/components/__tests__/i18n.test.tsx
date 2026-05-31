import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { InlineError } from '../InlineError';
import { MobileHeader } from '../MobileHeader';
import { ThemeProvider } from '../ThemeProvider';

// jsdom does not implement matchMedia, which ThemeProvider relies on.
// MobileHeader renders ThemeToggle (which consumes the theme context), so a
// lightweight matchMedia stub is required for it to render without throwing.
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

describe('i18n - InlineError (Validates: Requirements 5.5)', () => {
  it('hiển thị tiêu đề lỗi tiếng Việt và không còn chuỗi tiếng Anh', () => {
    render(<InlineError message="Mất kết nối tới máy chủ" />);

    expect(screen.getByText('Đã xảy ra lỗi')).toBeInTheDocument();
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
  });
});

describe('i18n - MobileHeader (Validates: Requirements 5.1)', () => {
  it('hiển thị thương hiệu ReadMind và không còn nhãn "RAG Chat"', () => {
    render(
      <ThemeProvider>
        <MobileHeader onMenuClick={() => {}} onClearChat={() => {}} messageCount={0} />
      </ThemeProvider>,
    );

    expect(screen.getByText('ReadMind')).toBeInTheDocument();
    expect(screen.queryByText('RAG Chat')).not.toBeInTheDocument();
  });
});
