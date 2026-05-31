import { renderHook, act, waitFor } from '@testing-library/react';
import { beforeEach, describe, it, expect } from 'vitest';
import { useConversations } from '../useConversations';
import { generateTitle } from '../../lib/conversationHelpers';
import type { Conversation } from '../../types';

/**
 * Example-based unit tests (Vitest + Testing Library `renderHook`) for the
 * `useConversations` orchestrator hook. These exercise the hook's behaviour on
 * top of the real (localStorage-backed) `conversationStore`, so each test starts
 * from a clean storage slate.
 *
 * Covers: migrate-on-room-change, most-recent active-id selection,
 * create/rename/delete flows, `noteSend` title-on-first-message, and
 * search-narrowed `filteredConversations`.
 *
 * Requirements: 4.1, 5.1, 6.1, 8.2, 8.3, 9.1, 9.3
 */

const ROOM = 'ROOM-1';
const CONVERSATIONS_KEY = `readmind_conversations:${ROOM}`;

function seedConversations(list: Conversation[]): void {
  localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(list));
}

describe('useConversations', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('migrates on room change so a fresh room yields >=1 conversation and a non-null active id', async () => {
    const { result } = renderHook(() => useConversations(ROOM));

    await waitFor(() => {
      expect(result.current.conversations.length).toBeGreaterThanOrEqual(1);
    });
    expect(result.current.activeConversationId).not.toBeNull();
    // The active id must reference a conversation that actually exists.
    expect(
      result.current.conversations.some(
        (c) => c.id === result.current.activeConversationId,
      ),
    ).toBe(true);
  });

  it('selects the most-recently-updated conversation as active', async () => {
    seedConversations([
      { id: 'conv-a', title: 'Alpha', createdAt: 100, updatedAt: 100 },
      { id: 'conv-c', title: 'Gamma', createdAt: 300, updatedAt: 300 },
      { id: 'conv-b', title: 'Beta', createdAt: 200, updatedAt: 200 },
    ]);

    const { result } = renderHook(() => useConversations(ROOM));

    await waitFor(() => {
      expect(result.current.conversations.length).toBe(3);
    });
    // Most recent by updatedAt is conv-c (300); list is sorted desc.
    expect(result.current.activeConversationId).toBe('conv-c');
    expect(result.current.conversations.map((c) => c.id)).toEqual([
      'conv-c',
      'conv-b',
      'conv-a',
    ]);
  });

  it('createConversation adds a new active conversation', async () => {
    const { result } = renderHook(() => useConversations(ROOM));

    await waitFor(() => expect(result.current.conversations.length).toBe(1));
    const initialCount = result.current.conversations.length;
    const previousActive = result.current.activeConversationId;

    let createdId = '';
    act(() => {
      createdId = result.current.createConversation();
    });

    expect(result.current.conversations.length).toBe(initialCount + 1);
    expect(result.current.activeConversationId).toBe(createdId);
    expect(result.current.activeConversationId).not.toBe(previousActive);
  });

  it('renameConversation updates the title in the list', async () => {
    const { result } = renderHook(() => useConversations(ROOM));

    await waitFor(() => expect(result.current.conversations.length).toBe(1));
    const targetId = result.current.conversations[0].id;

    act(() => {
      result.current.renameConversation(targetId, 'Tiêu đề mới');
    });

    const renamed = result.current.conversations.find((c) => c.id === targetId);
    expect(renamed?.title).toBe('Tiêu đề mới');
  });

  it('deleteConversation removes a non-active conversation', async () => {
    const { result } = renderHook(() => useConversations(ROOM));

    await waitFor(() => expect(result.current.conversations.length).toBe(1));
    const firstId = result.current.conversations[0].id;

    let createdId = '';
    act(() => {
      createdId = result.current.createConversation();
    });
    expect(result.current.activeConversationId).toBe(createdId);

    // Delete the non-active one (the original first conversation).
    act(() => {
      result.current.deleteConversation(firstId);
    });

    expect(result.current.conversations.some((c) => c.id === firstId)).toBe(false);
    expect(result.current.conversations.some((c) => c.id === createdId)).toBe(true);
    expect(result.current.activeConversationId).toBe(createdId);
  });

  it('deleting the active conversation reselects another', async () => {
    const { result } = renderHook(() => useConversations(ROOM));

    await waitFor(() => expect(result.current.conversations.length).toBe(1));
    const firstId = result.current.conversations[0].id;

    let createdId = '';
    act(() => {
      createdId = result.current.createConversation();
    });
    expect(result.current.activeConversationId).toBe(createdId);

    // Delete the active conversation; the remaining one becomes active.
    act(() => {
      result.current.deleteConversation(createdId);
    });

    expect(result.current.conversations.some((c) => c.id === createdId)).toBe(false);
    expect(result.current.activeConversationId).toBe(firstId);
  });

  it('deleting the last conversation yields a fresh one', async () => {
    const { result } = renderHook(() => useConversations(ROOM));

    await waitFor(() => expect(result.current.conversations.length).toBe(1));
    const onlyId = result.current.conversations[0].id;

    act(() => {
      result.current.deleteConversation(onlyId);
    });

    expect(result.current.conversations.length).toBe(1);
    const fresh = result.current.conversations[0];
    expect(fresh.id).not.toBe(onlyId);
    expect(result.current.activeConversationId).toBe(fresh.id);
  });

  it('noteSend sets the title from the first user message', async () => {
    const { result } = renderHook(() => useConversations(ROOM));

    await waitFor(() => expect(result.current.conversations.length).toBe(1));
    const targetId = result.current.conversations[0].id;
    const firstMessage = 'Tài liệu này nói về điều gì?';

    act(() => {
      result.current.noteSend(targetId, firstMessage);
    });

    const updated = result.current.conversations.find((c) => c.id === targetId);
    expect(updated?.title).toBe(generateTitle(firstMessage));
    expect(updated?.title).toBe(firstMessage);
  });

  it('filteredConversations narrows by the search term', async () => {
    const { result } = renderHook(() => useConversations(ROOM));

    await waitFor(() => expect(result.current.conversations.length).toBe(1));

    // Build three conversations with distinct titles.
    const firstId = result.current.conversations[0].id;
    act(() => {
      result.current.renameConversation(firstId, 'Báo cáo tài chính');
    });

    let secondId = '';
    act(() => {
      secondId = result.current.createConversation();
    });
    act(() => {
      result.current.renameConversation(secondId, 'Kế hoạch marketing');
    });

    let thirdId = '';
    act(() => {
      thirdId = result.current.createConversation();
    });
    act(() => {
      result.current.renameConversation(thirdId, 'Tài liệu kỹ thuật');
    });

    expect(result.current.filteredConversations.length).toBe(3);

    // Accent-insensitive substring match should keep only the "tài chính" item.
    act(() => {
      result.current.setSearchTerm('tai chinh');
    });

    expect(result.current.filteredConversations.map((c) => c.title)).toEqual([
      'Báo cáo tài chính',
    ]);

    // Clearing the term restores the full list.
    act(() => {
      result.current.setSearchTerm('');
    });
    expect(result.current.filteredConversations.length).toBe(3);
  });
});
