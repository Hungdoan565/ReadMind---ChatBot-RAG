import { Plus, LogIn, LogOut, User } from 'lucide-react';
import { DocumentLogoIcon } from './DocumentLogoIcon';
import { ConversationSearch } from './ConversationSearch';
import { RoomSwitcher } from './RoomSwitcher';
import { ConversationList } from './ConversationList';
import { ThemeToggle } from './ThemeToggle';
import type { AuthUser, Conversation } from '../types';

interface ConversationSidebarProps {
  roomCode: string;
  isAuthenticated: boolean;
  conversations: Conversation[];
  activeConversationId: string | null;
  searchTerm: string;
  onSearchChange: (term: string) => void;
  onSelectConversation: (id: string) => void;
  onNewConversation: () => void;
  onRenameConversation: (id: string, title: string) => void;
  onDeleteConversation: (id: string) => void;
  onSelectRoom: (roomCode: string) => void;
  onNewRoom: () => void;
  onShareRoom: () => void;
  // footer
  user: AuthUser | null;
  onLogin: () => void;
  onLogout: () => void;
}

/**
 * The conversation-centric LEFT region of the layout.
 *
 * Top → bottom it composes: a ReadMind brand header, a prominent "Cuộc trò chuyện mới"
 * action (distinct from the "Phòng mới" action inside the room switcher), the
 * conversation search input, the `RoomSwitcher` pill, the scrolling
 * `ConversationList` for the open room, and a pinned footer holding the account
 * control and the theme toggle.
 *
 * It deliberately excludes every document control (upload / URL / Notion / list /
 * selection); those live in the right `DocumentPanel` (Requirement 3.3). All
 * user-facing strings are Vietnamese and styling uses the `DESIGN.md` CSS-variable
 * tokens with the single teal accent and the glass-surface aside.
 */
export function ConversationSidebar({
  roomCode,
  isAuthenticated,
  conversations,
  activeConversationId,
  searchTerm,
  onSearchChange,
  onSelectConversation,
  onNewConversation,
  onRenameConversation,
  onDeleteConversation,
  onSelectRoom,
  onNewRoom,
  onShareRoom,
  user,
  onLogin,
  onLogout,
}: ConversationSidebarProps) {
  const searchActive = searchTerm.trim() !== '';

  return (
    <aside className="flex h-full flex-col overflow-hidden glass-surface border-r border-[var(--sidebar-border)] bg-[var(--sidebar-bg)] z-[var(--z-sidebar)]">
      {/* Brand header */}
      <div className="relative flex-shrink-0 overflow-hidden border-b border-[var(--sidebar-border)] p-4">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[var(--accent)]/10 to-transparent" />
        <div className="relative flex items-center gap-3">
          <DocumentLogoIcon size={32} className="text-[var(--accent)]" />
          <div>
            <h1 className="text-lg font-bold text-[var(--sidebar-text)]">ReadMind</h1>
            <p className="text-xs text-[var(--sidebar-text-secondary)]">
              Hỏi đáp về tài liệu của bạn
            </p>
          </div>
        </div>
      </div>

      {/* Top actions: new conversation + search + room switcher */}
      <div className="flex flex-shrink-0 flex-col gap-3 p-4">
        <button
          type="button"
          onClick={onNewConversation}
          className="flex w-full items-center justify-center gap-2 rounded-lg
                     bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white
                     transition-all duration-200 hover:bg-[var(--accent-hover)]
                     hover:scale-[1.02] active:scale-[0.98]
                     focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
        >
          <Plus className="h-4 w-4" />
          Cuộc trò chuyện mới
        </button>

        <ConversationSearch value={searchTerm} onChange={onSearchChange} />

        <RoomSwitcher
          roomCode={roomCode}
          isAuthenticated={isAuthenticated}
          onSelectRoom={onSelectRoom}
          onNewRoom={onNewRoom}
          onShareRoom={onShareRoom}
        />
      </div>

      {/* Recent-conversation list for the open room (flex-1 scrolling middle) */}
      <ConversationList
        conversations={conversations}
        activeConversationId={activeConversationId}
        searchActive={searchActive}
        onSelect={onSelectConversation}
        onRename={onRenameConversation}
        onDelete={onDeleteConversation}
      />

      {/* Footer pinned to the bottom: account control + theme toggle */}
      <div className="flex flex-shrink-0 items-center justify-between gap-2 border-t border-[var(--sidebar-border)] p-4">
        {user ? (
          <div className="flex min-w-0 items-center gap-2">
            <span
              className="flex min-w-0 items-center gap-1.5 rounded-lg bg-[var(--bg-tertiary)]
                         px-2.5 py-1.5 text-xs text-[var(--text-secondary)]"
              title={user.email}
            >
              <User className="h-3.5 w-3.5 flex-shrink-0" />
              <span className="truncate">{user.email}</span>
            </span>
            <button
              type="button"
              onClick={onLogout}
              title="Đăng xuất"
              className="flex flex-shrink-0 items-center gap-1 rounded-lg bg-[var(--bg-tertiary)]
                         px-2.5 py-1.5 text-xs text-[var(--text-secondary)]
                         transition-colors hover:text-[var(--text-primary)]
                         focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            >
              <LogOut className="h-3.5 w-3.5" />
              Đăng xuất
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onLogin}
            title="Đăng nhập"
            className="flex items-center gap-1.5 rounded-lg bg-[var(--bg-tertiary)]
                       px-2.5 py-1.5 text-xs text-[var(--text-secondary)]
                       transition-colors hover:text-[var(--text-primary)]
                       focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            <LogIn className="h-3.5 w-3.5" />
            Đăng nhập
          </button>
        )}

        <ThemeToggle />
      </div>
    </aside>
  );
}
