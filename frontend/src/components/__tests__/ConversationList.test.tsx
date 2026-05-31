import { beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConversationList } from '../ConversationList';
import type { Conversation } from '../../types';

/**
 * Component test (example-based, Testing Library) for ConversationList.
 * Covers rendering one item per conversation and the Vietnamese empty-result
 * message when a search yields no matches.
 *
 * Validates: Requirements 2.4, 9.4
 */

function makeConversation(overrides: Partial<Conversation> = {}): Conversation {
  const now = Date.now();
  return {
    id: 'conv-1',
    title: 'Cuộc trò chuyện 1',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('ConversationList', () => {
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

  it('render một mục cho mỗi cuộc trò chuyện', () => {
    const conversations = [
      makeConversation({ id: 'conv-1', title: 'Phân tích chương 1' }),
      makeConversation({ id: 'conv-2', title: 'Phân tích chương 2' }),
      makeConversation({ id: 'conv-3', title: 'Phân tích chương 3' }),
    ];

    render(
      <ConversationList
        conversations={conversations}
        activeConversationId="conv-1"
        searchActive={false}
        onSelect={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByText('Phân tích chương 1')).toBeInTheDocument();
    expect(screen.getByText('Phân tích chương 2')).toBeInTheDocument();
    expect(screen.getByText('Phân tích chương 3')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });

  it('hiển thị "Không tìm thấy cuộc trò chuyện nào" khi danh sách rỗng và đang tìm kiếm', () => {
    render(
      <ConversationList
        conversations={[]}
        activeConversationId={null}
        searchActive={true}
        onSelect={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByText('Không tìm thấy cuộc trò chuyện nào')).toBeInTheDocument();
  });
});
