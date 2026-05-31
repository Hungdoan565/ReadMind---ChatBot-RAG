import { useEffect, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import type { Conversation } from '../types';
import { formatRelativeTime } from '../lib/conversationHelpers';
import { ConfirmDialog } from './ConfirmDialog';

/** Vietnamese placeholder shown while a conversation has no user messages yet. */
const PLACEHOLDER_TITLE = 'Cuộc trò chuyện mới';

interface ConversationItemProps {
  conversation: Conversation;
  isActive: boolean;
  onSelect: () => void;
  onRename: (title: string) => void;
  onDelete: () => void;
}

/**
 * A single row in the conversation list.
 *
 * - Shows the conversation title (or the placeholder "Cuộc trò chuyện mới" when the
 *   title is empty) plus a Vietnamese relative-time label from `updatedAt`.
 * - Reveals rename + delete actions on hover or keyboard focus (`group-hover` +
 *   `group-focus-within`) and hides them as soon as neither condition holds.
 * - Rename happens inline: submitting a non-empty (trimmed) value calls `onRename`;
 *   submitting blank, or pressing Escape, cancels and keeps the old title.
 * - Delete opens the shared `ConfirmDialog`; confirming calls `onDelete`, cancelling
 *   is a no-op. The active row is highlighted with the teal accent.
 */
export function ConversationItem({
  conversation,
  isActive,
  onSelect,
  onRename,
  onDelete,
}: ConversationItemProps) {
  const displayTitle =
    conversation.title.trim() === '' ? PLACEHOLDER_TITLE : conversation.title;

  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(displayTitle);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // Guards against a double rename when Enter (submit) and the input's blur fire together.
  const settledRef = useRef(false);

  // Focus and select the field when entering rename mode.
  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditing]);

  const startRename = () => {
    setDraft(displayTitle);
    settledRef.current = false;
    setIsEditing(true);
  };

  const cancelRename = () => {
    if (settledRef.current) return;
    settledRef.current = true;
    setIsEditing(false);
  };

  const submitRename = () => {
    if (settledRef.current) return;
    settledRef.current = true;
    const trimmed = draft.trim();
    // A blank/whitespace-only value cancels the edit and keeps the old title.
    if (trimmed !== '') {
      onRename(trimmed);
    }
    setIsEditing(false);
  };

  const handleFormSubmit = (e: FormEvent) => {
    e.preventDefault();
    submitRename();
  };

  const handleInputKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      cancelRename();
    }
  };

  const handleItemKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect();
    }
  };

  return (
    <div
      className={`group relative rounded-lg transition-colors ${
        isActive
          ? 'bg-[var(--accent-light)] ring-1 ring-[var(--accent)]/30'
          : 'hover:bg-[var(--sidebar-bg-light)]'
      }`}
    >
      {isEditing ? (
        <form onSubmit={handleFormSubmit} className="px-3 py-2">
          <input
            ref={inputRef}
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleInputKeyDown}
            onBlur={submitRename}
            aria-label="Đổi tên cuộc trò chuyện"
            className="w-full bg-transparent text-sm font-medium text-[var(--text-primary)]
                       border-b border-[var(--accent)] focus:outline-none"
          />
        </form>
      ) : (
        <>
          <div
            role="button"
            tabIndex={0}
            onClick={onSelect}
            onKeyDown={handleItemKeyDown}
            title={displayTitle}
            className="w-full cursor-pointer rounded-lg px-3 py-2 pr-16 text-left
                       focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            <p
              className={`truncate text-sm font-medium leading-tight ${
                isActive
                  ? 'text-[var(--text-primary)]'
                  : 'text-[var(--sidebar-text)] group-hover:text-[var(--text-primary)]'
              }`}
            >
              {displayTitle}
            </p>
            <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">
              {formatRelativeTime(conversation.updatedAt)}
            </p>
          </div>

          {/* Rename + delete: revealed on hover or keyboard focus, hidden otherwise. */}
          <div
            className="absolute right-2 top-1/2 flex -translate-y-1/2 gap-1
                       opacity-0 transition-opacity
                       group-hover:opacity-100 group-focus-within:opacity-100"
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                startRename();
              }}
              aria-label="Đổi tên"
              title="Đổi tên"
              className="rounded-md bg-[var(--bg-tertiary)] p-1.5 text-[var(--text-secondary)]
                         transition-colors hover:bg-[var(--accent)]/10 hover:text-[var(--accent)]"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setConfirmOpen(true);
              }}
              aria-label="Xóa"
              title="Xóa"
              className="rounded-md bg-[var(--bg-tertiary)] p-1.5 text-[var(--text-secondary)]
                         transition-colors hover:bg-[var(--error)]/10 hover:text-[var(--error)]"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title="Xóa cuộc trò chuyện"
        message="Bạn có chắc muốn xóa cuộc trò chuyện này? Hành động này không thể hoàn tác."
        confirmLabel="Xóa"
        cancelLabel="Hủy"
        destructive
        onConfirm={() => {
          setConfirmOpen(false);
          onDelete();
        }}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
