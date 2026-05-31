import { beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConversationItem } from '../ConversationItem';
import type { Conversation } from '../../types';

/**
 * Component test (example-based, Testing Library) for ConversationItem.
 * Covers placeholder title, relative-time label, inline rename apply/cancel, and
 * delete-via-ConfirmDialog. Hover is CSS-only (opacity), so the rename/delete
 * actions are queried directly by their aria-labels without simulating hover.
 *
 * Validates: Requirements 2.6, 2.7, 2.8, 6.5, 7.2, 8.5
 */

function makeConversation(overrides: Partial<Conversation> = {}): Conversation {
  const now = Date.now();
  return {
    id: 'conv-1',
    title: 'Tóm tắt tài liệu',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('ConversationItem', () => {
  // jsdom does not implement matchMedia, which framer-motion (ConfirmDialog) relies on.
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

  it('hiển thị tiêu đề placeholder "Cuộc trò chuyện mới" khi title rỗng và nhãn thời gian tương đối', () => {
    const conversation = makeConversation({
      title: '',
      updatedAt: Date.now() - 5 * 60 * 1000, // 5 phút trước
    });

    render(
      <ConversationItem
        conversation={conversation}
        isActive={false}
        onSelect={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByText('Cuộc trò chuyện mới')).toBeInTheDocument();
    expect(screen.getByText(/phút trước/)).toBeInTheDocument();
  });

  it('đổi tên: mở input và gửi giá trị không rỗng gọi onRename', async () => {
    const user = userEvent.setup();
    const onRename = vi.fn();

    render(
      <ConversationItem
        conversation={makeConversation()}
        isActive={false}
        onSelect={vi.fn()}
        onRename={onRename}
        onDelete={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Đổi tên' }));

    const input = screen.getByRole('textbox', { name: 'Đổi tên cuộc trò chuyện' });
    await user.clear(input);
    await user.type(input, 'Tên mới{Enter}');

    expect(onRename).toHaveBeenCalledWith('Tên mới');
  });

  it('đổi tên: gửi giá trị rỗng/khoảng trắng huỷ và không gọi onRename', async () => {
    const user = userEvent.setup();
    const onRename = vi.fn();

    render(
      <ConversationItem
        conversation={makeConversation()}
        isActive={false}
        onSelect={vi.fn()}
        onRename={onRename}
        onDelete={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Đổi tên' }));

    const input = screen.getByRole('textbox', { name: 'Đổi tên cuộc trò chuyện' });
    await user.clear(input);
    await user.type(input, '{Enter}');

    expect(onRename).not.toHaveBeenCalled();
  });

  it('xóa: mở ConfirmDialog và xác nhận gọi onDelete', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();

    render(
      <ConversationItem
        conversation={makeConversation()}
        isActive={false}
        onSelect={vi.fn()}
        onRename={vi.fn()}
        onDelete={onDelete}
      />,
    );

    // The action button (aria-label "Xóa") opens the confirm dialog.
    await user.click(screen.getByRole('button', { name: 'Xóa' }));

    // The dialog appears with its own confirm button labelled "Xóa".
    const message = await screen.findByText(/Bạn có chắc muốn xóa cuộc trò chuyện này/);
    const dialog = message.closest('div') as HTMLElement;

    await user.click(within(dialog).getByRole('button', { name: 'Xóa' }));

    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});
