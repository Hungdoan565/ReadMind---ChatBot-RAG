import { useState, useEffect, useCallback, useMemo } from 'react';

import {
  migrateLegacy,
  listConversations,
  createConversation as storeCreateConversation,
  renameConversation as storeRenameConversation,
  deleteConversation as storeDeleteConversation,
  touchConversation as storeTouchConversation,
} from '../lib/conversationStore';
import { pickMostRecent, filterConversations } from '../lib/conversationHelpers';
import type { Conversation } from '../types';

// ---------------------------------------------------------------------------
// Hook interface
// ---------------------------------------------------------------------------

interface UseConversationsReturn {
  /** Full conversation list for the open room, sorted by `updatedAt` descending. */
  conversations: Conversation[];
  /** The conversation currently displayed in the center chat surface. */
  activeConversationId: string | null;
  /** The current client-side search term. */
  searchTerm: string;
  /** `conversations` narrowed by `Conversation_Search` (accent/case-insensitive). */
  filteredConversations: Conversation[];
  setSearchTerm: (term: string) => void;
  selectConversation: (id: string) => void;
  /** Create a new conversation, make it active, and return its id. */
  createConversation: () => string;
  renameConversation: (id: string, title: string) => void;
  deleteConversation: (id: string) => void;
  /**
   * Called by the composition when a message is sent. Sets the title from the
   * first user message (when provided and none exists yet) and bumps
   * `updatedAt`; persists the conversation list.
   */
  noteSend: (id: string, firstUserMessage?: string) => void;
}

/**
 * Orchestrates the conversation model for the open room around the pure
 * `conversationStore`/`conversationHelpers` core.
 *
 * On room change it idempotently migrates any legacy transcript (which also
 * guarantees at least one conversation), loads the list, and selects the most
 * recently updated conversation as active. All mutations delegate to the store
 * and then refresh the in-memory list so the sidebar stays in sync. Documents
 * and document selection are room-scoped and owned by `useDocumentSelection`;
 * this hook never touches them (Requirement 5.2).
 */
export function useConversations(roomCode: string): UseConversationsReturn {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');

  // On room change: migrate legacy data (idempotent, ensures >= 1 conversation),
  // load the list, and select the most recent conversation as active.
  useEffect(() => {
    if (!roomCode) {
      setConversations([]);
      setActiveConversationId(null);
      return;
    }
    migrateLegacy(roomCode);
    const list = listConversations(roomCode);
    setConversations(list);
    setActiveConversationId(pickMostRecent(list)?.id ?? null);
  }, [roomCode]);

  const filteredConversations = useMemo(
    () => filterConversations(conversations, searchTerm),
    [conversations, searchTerm],
  );

  const selectConversation = useCallback((id: string) => {
    setActiveConversationId(id);
  }, []);

  const createConversation = useCallback((): string => {
    const created = storeCreateConversation(roomCode);
    setConversations(listConversations(roomCode));
    setActiveConversationId(created.id);
    return created.id;
  }, [roomCode]);

  const renameConversation = useCallback(
    (id: string, title: string) => {
      const updated = storeRenameConversation(roomCode, id, title);
      setConversations(updated);
    },
    [roomCode],
  );

  const deleteConversation = useCallback(
    (id: string) => {
      const updated = storeDeleteConversation(roomCode, id);
      setConversations(updated);
      // If the deleted conversation was active, recompute the active id from the
      // remaining list (the store guarantees a fresh one when the room empties).
      setActiveConversationId((current) =>
        current === id ? pickMostRecent(updated)?.id ?? null : current,
      );
    },
    [roomCode],
  );

  const noteSend = useCallback(
    (id: string, firstUserMessage?: string) => {
      const updated = storeTouchConversation(roomCode, id, firstUserMessage);
      setConversations(updated);
    },
    [roomCode],
  );

  return {
    conversations,
    activeConversationId,
    searchTerm,
    filteredConversations,
    setSearchTerm,
    selectConversation,
    createConversation,
    renameConversation,
    deleteConversation,
    noteSend,
  };
}
