import { beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConversationSidebar } from '../ConversationSidebar';
import { ThemeProvider } from '../ThemeProvider';
import type { AuthUser, Conversation } from '../../types';

// Mock the rooms API so nothing reaches the network during these tests.
vi.mock('../../api/rooms', () => ({
  getRooms: vi.fn().mockResolvedValue([]),
  claimRoom: vi.fn(),
}));

import { getRooms } from '../../api/rooms';

/**
 * Component test (example-based, Testing Library) for ConversationSidebar.
 * Covers the "Cuộc trò chuyện mới" action, the search input, exclusion of
 * document controls, the auth-dependent footer, and that typing a query triggers
 * onSearchChange while making ZERO network calls.
 *
 * Validates: Requirements 2.1, 2.2, 2.3, 2.9, 3.3, 9.2
 */

function makeUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: 'user-1',
    email: 'reader@example.com',
    is_active: true,
    is_superuser: false,
    is_verified: true,
    created_at: '2025-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const conversations: Conversation[] = [
  { id: 'conv-1', title: 'Cuộc trò chuyện 1', createdAt: Date.now(), updatedAt: Date.now() },
];

interface RenderOptions {
  user?: AuthUser | null;
  onNewConversation?: () => void;
  onSearchChange?: (term: string) => void;
}

function renderSidebar({
  user = null,
  onNewConversation = vi.fn(),
  onSearchChange = vi.fn(),
}: RenderOptions = {}) {
  return render(
    <ThemeProvider>
      <ConversationSidebar
        roomCode="ROOM-123"
        isAuthenticated={user !== null}
        conversations={conversations}
        activeConversationId="conv-1"
        searchTerm=""
        onSearchChange={onSearchChange}
        onSelectConversation={vi.fn()}
        onNewConversation={onNewConversation}
        onRenameConversation={vi.fn()}
        onDeleteConversation={vi.fn()}
        onSelectRoom={vi.fn()}
        onNewRoom={vi.fn()}
        onShareRoom={vi.fn()}
        user={user}
        onLogin={vi.fn()}
        onLogout={vi.fn()}
      />
    </ThemeProvider>,
  );
}

describe('ConversationSidebar', () => {
  beforeEach(() => {
    vi.mocked(getRooms).mockResolvedValue([]);
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

  it('hiển thị nút "Cuộc trò chuyện mới"; nhấn gọi onNewConversation', async () => {
    const user = userEvent.setup();
    const onNewConversation = vi.fn();
    renderSidebar({ onNewConversation });

    const button = screen.getByRole('button', { name: /Cuộc trò chuyện mới/ });
    await user.click(button);

    expect(onNewConversation).toHaveBeenCalledTimes(1);
  });

  it('có ô tìm kiếm và loại trừ các điều khiển tài liệu', () => {
    const { container } = renderSidebar();

    expect(
      screen.getByRole('searchbox', { name: 'Tìm trong cuộc trò chuyện' }),
    ).toBeInTheDocument();

    // No document controls in the left sidebar (Requirement 3.3).
    expect(container.querySelector('input[type="file"]')).toBeNull();
    expect(screen.queryByText(/Tải lên tài liệu/i)).not.toBeInTheDocument();
  });

  it('footer hiển thị "Đăng nhập" khi user=null', () => {
    renderSidebar({ user: null });

    expect(screen.getByRole('button', { name: /Đăng nhập/ })).toBeInTheDocument();
    expect(screen.queryByText('reader@example.com')).not.toBeInTheDocument();
  });

  it('footer hiển thị email và "Đăng xuất" khi đã đăng nhập', () => {
    renderSidebar({ user: makeUser() });

    expect(screen.getByText('reader@example.com')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Đăng xuất/ })).toBeInTheDocument();
  });

  it('gõ vào ô tìm kiếm gọi onSearchChange và KHÔNG tạo lệnh gọi mạng', async () => {
    const user = userEvent.setup();
    const onSearchChange = vi.fn();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'));

    renderSidebar({ onSearchChange });

    const input = screen.getByRole('searchbox', { name: 'Tìm trong cuộc trò chuyện' });
    await user.type(input, 'báo');

    expect(onSearchChange).toHaveBeenCalled();
    // Typing performs only client-side filtering — no backend request of any kind.
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(getRooms).not.toHaveBeenCalled();
  });
});
