import type { Conversation } from '../types';
import { ConversationItem } from './ConversationItem';

interface ConversationListProps {
  /** Conversations to render. Already filtered by search in the parent. */
  conversations: Conversation[];
  activeConversationId: string | null;
  /** True when a non-empty search term is currently narrowing the list. */
  searchActive: boolean;
  onSelect: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
}

/** Shown when a search yields no matches (Requirement 9.4). */
const NO_RESULTS_MESSAGE = 'Không tìm thấy cuộc trò chuyện nào';
/** Gentle empty state when the room simply has no conversations yet. */
const EMPTY_MESSAGE = 'Chưa có cuộc trò chuyện nào';

/**
 * The recent-conversation list for the open room.
 *
 * - Renders every conversation as a single, continuously scrolling list with no
 *   "show more" control (Requirements 2.4, 2.5).
 * - Highlights the active conversation by comparing each id against
 *   `activeConversationId`.
 * - When the list is empty, shows the Vietnamese empty-result message while a search
 *   is active (Requirement 9.4), or a gentle empty state otherwise.
 *
 * The `conversations` prop is already filtered by the parent, so this component is a
 * pure presentation of whatever it receives.
 */
export function ConversationList({
  conversations,
  activeConversationId,
  searchActive,
  onSelect,
  onRename,
  onDelete,
}: ConversationListProps) {
  if (conversations.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center px-4 py-8">
        <p className="text-center text-sm text-[var(--text-tertiary)]">
          {searchActive ? NO_RESULTS_MESSAGE : EMPTY_MESSAGE}
        </p>
      </div>
    );
  }

  return (
    <ul className="flex-1 space-y-1 overflow-y-auto px-2 py-2">
      {conversations.map((conversation) => (
        <li key={conversation.id}>
          <ConversationItem
            conversation={conversation}
            isActive={conversation.id === activeConversationId}
            onSelect={() => onSelect(conversation.id)}
            onRename={(title) => onRename(conversation.id, title)}
            onDelete={() => onDelete(conversation.id)}
          />
        </li>
      ))}
    </ul>
  );
}
