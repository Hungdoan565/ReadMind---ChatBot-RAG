import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import fc from 'fast-check';
import { useDocumentSelection } from '../useDocumentSelection';
import {
  createConversation,
  deleteConversation,
  renameConversation,
  touchConversation,
  listConversations,
} from '../../lib/conversationStore';

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

// Room codes are non-empty strings (mix of realistic codes and arbitrary text).
const roomArb = fc.string({ minLength: 1, maxLength: 16 });

// Two distinct room codes.
const distinctRoomsArb = fc.uniqueArray(roomArb, { minLength: 2, maxLength: 2 });

// A document-id selection: an array of string ids (may be empty or contain dups).
const docIdsArb = fc.array(fc.string({ maxLength: 12 }), { maxLength: 10 });

// Storage key used by the hook for a room's selection.
const docselKey = (room: string) => `readmind_docsel:${room}`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Mount the hook for a room and read its current selection, then unmount. */
function readSelection(room: string): string[] {
  const { result, unmount } = renderHook(() => useDocumentSelection(room));
  const ids = result.current.activeDocIds;
  unmount();
  return ids;
}

/** Mount the hook for a room, persist `ids`, then unmount. */
function persistSelection(room: string, ids: string[]): void {
  const { result, unmount } = renderHook(() => useDocumentSelection(room));
  act(() => {
    result.current.setActiveDocIds(ids);
  });
  unmount();
}

describe('useDocumentSelection — Property 12 (per-room selection)', () => {
  beforeEach(() => localStorage.clear());

  // Feature: conversation-sessions-layout, Property 12: Per-room document
  // selection round-trips and is conversation-independent — persisting the
  // selection for a room and reloading it returns the same set, and a room with
  // no stored selection yields the empty selection.
  // Validates: Requirements 12.1, 12.3, 12.4
  it('round-trips a persisted selection and defaults to [] when none stored', () => {
    fc.assert(
      fc.property(roomArb, docIdsArb, (room, docIds) => {
        localStorage.clear();

        // A room with no stored selection yields [] (Req 12.4).
        expect(readSelection(room)).toEqual([]);

        // Persist via the hook, then re-mount for the same room (Req 12.1, 12.3).
        persistSelection(room, docIds);

        expect(readSelection(room)).toEqual(docIds);
      }),
      { numRuns: 100 },
    );
  });

  // Feature: conversation-sessions-layout, Property 12: Per-room document
  // selection round-trips and is conversation-independent — selections for
  // distinct rooms do not interfere with each other.
  // Validates: Requirements 12.1, 12.3
  it('keeps selections for distinct rooms independent', () => {
    fc.assert(
      fc.property(distinctRoomsArb, docIdsArb, docIdsArb, ([roomA, roomB], docsA, docsB) => {
        localStorage.clear();

        persistSelection(roomA, docsA);
        persistSelection(roomB, docsB);

        // Each room reloads exactly its own stored selection.
        expect(readSelection(roomA)).toEqual(docsA);
        expect(readSelection(roomB)).toEqual(docsB);
      }),
      { numRuns: 100 },
    );
  });

  // Feature: conversation-sessions-layout, Property 12: Per-room document
  // selection round-trips and is conversation-independent — switching the
  // hook's room loads that room's stored selection.
  // Validates: Requirements 12.3
  it('loads the stored selection of whichever room is active', () => {
    fc.assert(
      fc.property(distinctRoomsArb, docIdsArb, docIdsArb, ([roomA, roomB], docsA, docsB) => {
        localStorage.clear();

        const { result, rerender, unmount } = renderHook(
          ({ room }) => useDocumentSelection(room),
          { initialProps: { room: roomA } },
        );

        // Persist a selection for room A.
        act(() => result.current.setActiveDocIds(docsA));
        expect(result.current.activeDocIds).toEqual(docsA);

        // Switch to room B (no stored selection yet → []), then persist docsB.
        rerender({ room: roomB });
        expect(result.current.activeDocIds).toEqual([]);
        act(() => result.current.setActiveDocIds(docsB));

        // Switch back to room A → loads room A's stored selection.
        rerender({ room: roomA });
        expect(result.current.activeDocIds).toEqual(docsA);

        // Switch to room B again → loads room B's stored selection.
        rerender({ room: roomB });
        expect(result.current.activeDocIds).toEqual(docsB);

        unmount();
      }),
      { numRuns: 100 },
    );
  });

  // Feature: conversation-sessions-layout, Property 12: Per-room document
  // selection round-trips and is conversation-independent — conversation-level
  // operations (create/rename/touch/delete) within a room never change that
  // room's stored document selection.
  // Validates: Requirements 5.2, 12.2
  it('is unaffected by conversation create/rename/delete operations', () => {
    fc.assert(
      fc.property(roomArb, docIdsArb, fc.string({ maxLength: 20 }), (room, docIds, title) => {
        localStorage.clear();

        // Establish a per-room document selection.
        persistSelection(room, docIds);
        expect(localStorage.getItem(docselKey(room))).toBe(JSON.stringify(docIds));

        // Run a sequence of conversation-level operations on the same room.
        const created = createConversation(room);
        touchConversation(room, created.id, title.trim() ? title : undefined);
        renameConversation(room, created.id, title);
        const second = createConversation(room);
        deleteConversation(room, second.id);
        // sanity: conversation ops actually mutated the conversation list
        expect(listConversations(room).length).toBeGreaterThanOrEqual(1);

        // The document selection for the room is untouched (Req 12.2, 5.2).
        expect(localStorage.getItem(docselKey(room))).toBe(JSON.stringify(docIds));
        expect(readSelection(room)).toEqual(docIds);
      }),
      { numRuns: 100 },
    );
  });
});
