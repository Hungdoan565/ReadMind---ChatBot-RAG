import { render, screen, fireEvent } from '@testing-library/react';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { Drawer } from '../Drawer';

/**
 * Component test (example-based, Testing Library) cho Drawer.
 * Bám sát Testing Strategy của thiết kế: KHÔNG property-based.
 * Xác minh:
 *  - Khi mở (isOpen), render children + một dialog với đúng ariaLabel; cả hai
 *    phía left/right đều render được (Requirement 13.1).
 *  - Phím Escape và click backdrop đều gọi onClose (Requirement 13.3).
 *  - Khi đóng (!isOpen), nội dung/children KHÔNG render.
 *
 * Validates: Requirements 13.1, 13.3
 */

describe('Drawer', () => {
  // jsdom does not implement matchMedia, which framer-motion's useReducedMotion
  // (used by Drawer) relies on. Stub mirrors MessageBubble.test.tsx.
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

  it('khi mở phía trái: render children và dialog với đúng ariaLabel', () => {
    render(
      <Drawer
        isOpen
        side="left"
        onClose={vi.fn()}
        ariaLabel="Danh sách cuộc trò chuyện"
      >
        <div data-testid="left-content">Nội dung trái</div>
      </Drawer>,
    );

    expect(screen.getByTestId('left-content')).toBeInTheDocument();
    expect(
      screen.getByRole('dialog', { name: 'Danh sách cuộc trò chuyện' }),
    ).toBeInTheDocument();
  });

  it('khi mở phía phải: render children và dialog với đúng ariaLabel', () => {
    render(
      <Drawer isOpen side="right" onClose={vi.fn()} ariaLabel="Tài liệu">
        <div data-testid="right-content">Nội dung phải</div>
      </Drawer>,
    );

    expect(screen.getByTestId('right-content')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Tài liệu' })).toBeInTheDocument();
  });

  it('nhấn phím Escape sẽ gọi onClose', () => {
    const onClose = vi.fn();
    render(
      <Drawer isOpen side="left" onClose={onClose} ariaLabel="Danh sách cuộc trò chuyện">
        <div data-testid="left-content">Nội dung trái</div>
      </Drawer>,
    );

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('click vào backdrop sẽ gọi onClose', () => {
    const onClose = vi.fn();
    const { container } = render(
      <Drawer isOpen side="right" onClose={onClose} ariaLabel="Tài liệu">
        <div data-testid="right-content">Nội dung phải</div>
      </Drawer>,
    );

    const backdrop = container.querySelector('.drawer-backdrop');
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop as Element);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('khi đóng (!isOpen): không render children hay dialog', () => {
    render(
      <Drawer isOpen={false} side="left" onClose={vi.fn()} ariaLabel="Danh sách cuộc trò chuyện">
        <div data-testid="left-content">Nội dung trái</div>
      </Drawer>,
    );

    expect(screen.queryByTestId('left-content')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
