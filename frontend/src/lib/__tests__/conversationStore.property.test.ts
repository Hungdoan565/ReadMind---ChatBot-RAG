// Property-based tests for the pure conversation store (conversationStore.ts).
//
// Library: fast-check + Vitest, { numRuns: 100 } per property.
// One property-based test per correctness property from the design's
// "Correctness Properties" section. Each test is tagged with its property.
// localStorage is reset before each test (beforeEach) and again at the start of
// every property run so the 100 generated cases never leak state into each other.
// Store mutations accept an injected `now` for determinism.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import fc from 'fast-check';

import type { ChatMessage, Conversation } from '../../types';
import { generateTitle } from '../conversationHelpers';
import {
  listConversations,
  createConversation,
  renameConversation,
  touchConversation,
  deleteConversation,
  loadTranscript,
  saveTranscript,
  migrateLegacy,
} from '../conversationStore';

// ---------------------------------------------------------------------------
// Shared constants + arbitraries
// ---------------------------------------------------------------------------

/** Vietnamese placeholder title used by the store for a fresh conversation. */
const PLACEHOLDER_TITLE = 'Cuộc trò chuyện mới';

/** Non-empty alphanumeric room code (used as a localStorage key suffix). */
const roomArb = fc
  .array(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')), {
    minLength: 1,
    maxLength: 10,
  })
  .map((chars) => chars.join(''));

/** A single character drawn from whitespace, ASCII, Vietnamese diacritics, and emoji. */
const richCharArb = fc.oneof(
  fc.constantFrom(' ', '\t', '\n'),
  fc.constantFrom(...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split('')),
  fc.constantFrom('à', 'á', 'ả', 'ã', 'ạ', 'â', 'ấ', 'đ', 'Đ', 'ê', 'ế', 'ô', 'ố', 'ơ', 'ư', 'ừ'),
  fc.constantFrom('😀', '🎉', '🚀', '🧠', '👍', '🌟'),
);

/** Rich strings mixing whitespace, ASCII, Vietnamese diacritics, and emoji. */
const richStringArb = fc.array(richCharArb, { maxLength: 60 }).map((chars) => chars.join(''));

/** Pure whitespace strings (spaces/tabs/newlines/CR). */
const blankArb = fc
  .array(fc.constantFrom(' ', '\t', '\n', '\r'), { maxLength: 6 })
  .map((chars) => chars.join(''));

/** Submitted titles: rich text, whitespace-only, or empty. */
const titleArb = fc.oneof(richStringArb, blankArb, fc.constant(''));

/** Valid dates inside a safe range so toISOString never yields Invalid Date. */
const dateArb = fc.date({
  min: new Date('2000-01-01T00:00:00.000Z'),
  max: new Date('2100-01-01T00:00:00.000Z'),
});

/** An arbitrary ChatMessage (timestamp as a Date, as in the live app). */
const messageArb = fc.record({
  id: fc.string({ maxLength: 16 }),
  role: fc.constantFrom('user' as const, 'assistant' as const),
  content: richStringArb,
  timestamp: dateArb,
});

const messagesArb = fc.array(messageArb, { maxLength: 8 });

/** sessionId is either a string (possibly empty) or null. */
const sessionIdArb = fc.option(fc.string({ maxLength: 20 }), { nil: null });

/** Epoch-ms timestamps in a realistic positive range. */
const nowArb = fc.integer({ min: 1_000_000_000_000, max: 2_000_000_000_000 });

/** A persisted conversation record (for seeding an already-migrated room). */
const conversationArb = fc.record({
  id: fc.string({ minLength: 1, maxLength: 12 }),
  title: richStringArb,
  createdAt: nowArb,
  updatedAt: nowArb,
});

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Serialize messages the way the store does (timestamp -> ISO, drop transient). */
function persistedMessages(messages: ChatMessage[]) {
  return messages.map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    timestamp: m.timestamp.toISOString(),
  }));
}

/** Build a legacy/persisted transcript blob exactly as the store would write it. */
function transcriptBlob(messages: ChatMessage[], sessionId: string | null): string {
  return JSON.stringify({ messages: persistedMessages(messages), sessionId });
}

/**
 * Compare a loaded transcript against the original on the serializable fields.
 * loadTranscript revives timestamps to Date, so compare via toISOString().
 */
function expectMessagesMatch(loaded: ChatMessage[], original: ChatMessage[]): void {
  expect(loaded.length).toBe(original.length);
  loaded.forEach((m, i) => {
    expect(m.id).toBe(original[i].id);
    expect(m.role).toBe(original[i].role);
    expect(m.content).toBe(original[i].content);
    expect(m.timestamp.toISOString()).toBe(original[i].timestamp.toISOString());
  });
}

/** Snapshot the full localStorage contents as a plain key/value map. */
function snapshotStorage(): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (key !== null) {
      out[key] = localStorage.getItem(key) ?? '';
    }
  }
  return out;
}

// ---------------------------------------------------------------------------

describe('conversationStore property-based tests', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  // Feature: conversation-sessions-layout, Property 4: A created conversation satisfies all creation invariants
  it('Property 4: createConversation satisfies every creation invariant', () => {
    fc.assert(
      fc.property(roomArb, nowArb, fc.integer({ min: 0, max: 4 }), (room, now, priorCount) => {
        localStorage.clear();

        // Seed some pre-existing conversations at earlier, distinct times.
        const priorIds: string[] = [];
        for (let i = 0; i < priorCount; i += 1) {
          const earlier = createConversation(room, now - 1000 * (priorCount - i));
          priorIds.push(earlier.id);
        }

        const conv = createConversation(room, now);

        // Non-empty, unique id.
        expect(typeof conv.id).toBe('string');
        expect(conv.id.length).toBeGreaterThan(0);
        expect(priorIds).not.toContain(conv.id);

        // Placeholder title; createdAt === updatedAt === now.
        expect(conv.title).toBe(PLACEHOLDER_TITLE);
        expect(conv.createdAt).toBe(now);
        expect(conv.updatedAt).toBe(now);

        // Empty persisted transcript.
        const transcript = loadTranscript(room, conv.id);
        expect(transcript.messages).toEqual([]);
        expect(transcript.sessionId).toBeNull();

        // Existing conversations are not dropped; new one is added.
        const ids = listConversations(room).map((c) => c.id);
        for (const pid of priorIds) {
          expect(ids).toContain(pid);
        }
        expect(ids).toContain(conv.id);
        expect(ids.length).toBe(priorCount + 1);
      }),
      { numRuns: 100 },
    );
  });

  // Feature: conversation-sessions-layout, Property 5: Transcript save/load round-trips and isolates by conversation
  it('Property 5: saveTranscript/loadTranscript round-trips and isolates by conversation', () => {
    fc.assert(
      fc.property(
        roomArb,
        fc.string({ maxLength: 8 }),
        fc.string({ maxLength: 8 }),
        messagesArb,
        sessionIdArb,
        messagesArb,
        sessionIdArb,
        (room, seedA, seedB, msgsA, sidA, msgsB, sidB) => {
          localStorage.clear();
          // Prefixing guarantees two distinct conversation ids.
          const convA = `A-${seedA}`;
          const convB = `B-${seedB}`;

          saveTranscript(room, convA, msgsA, sidA);
          const loadedA1 = loadTranscript(room, convA);
          expectMessagesMatch(loadedA1.messages, msgsA);
          expect(loadedA1.sessionId).toBe(sidA);

          // Writing convB must not disturb convA's stored transcript.
          saveTranscript(room, convB, msgsB, sidB);
          const loadedA2 = loadTranscript(room, convA);
          expectMessagesMatch(loadedA2.messages, msgsA);
          expect(loadedA2.sessionId).toBe(sidA);

          const loadedB = loadTranscript(room, convB);
          expectMessagesMatch(loadedB.messages, msgsB);
          expect(loadedB.sessionId).toBe(sidB);
        },
      ),
      { numRuns: 100 },
    );
  });

  // Feature: conversation-sessions-layout, Property 6: Conversation-list mutations persist and round-trip
  it('Property 6: create/touch/delete sequences persist and round-trip via listConversations', () => {
    const opArb = fc.oneof(
      fc.record({ type: fc.constant('create' as const) }),
      fc.record({
        type: fc.constant('touch' as const),
        idx: fc.integer({ min: 0, max: 1000 }),
        msg: fc.option(richStringArb, { nil: undefined }),
      }),
      fc.record({ type: fc.constant('delete' as const), idx: fc.integer({ min: 0, max: 1000 }) }),
    );
    const opsArb = fc.array(opArb, { minLength: 1, maxLength: 12 });

    fc.assert(
      fc.property(roomArb, opsArb, (room, ops) => {
        localStorage.clear();

        const model = new Map<string, Conversation>();
        let clock = 1_500_000_000_000;

        for (const op of ops) {
          clock += 1;
          if (op.type === 'create') {
            const created = createConversation(room, clock);
            model.set(created.id, { ...created });
            continue;
          }

          if (model.size === 0) {
            continue; // nothing to touch/delete yet
          }
          const ids = [...model.keys()];
          const id = ids[op.idx % ids.length];

          if (op.type === 'touch') {
            touchConversation(room, id, op.msg, clock);
            const current = model.get(id)!;
            let title = current.title;
            const trimmed = current.title.trim();
            if (op.msg !== undefined && (trimmed === '' || trimmed === PLACEHOLDER_TITLE)) {
              const generated = generateTitle(op.msg);
              if (generated !== '') {
                title = generated;
              }
            }
            model.set(id, { ...current, title, updatedAt: clock });
          } else {
            // delete
            deleteConversation(room, id, clock);
            model.delete(id);
            if (model.size === 0) {
              // The store guarantees a fresh conversation when the room empties.
              for (const fresh of listConversations(room)) {
                model.set(fresh.id, { ...fresh });
              }
            }
          }
        }

        const stored = listConversations(room);
        expect(stored.map((c) => c.id).sort()).toEqual([...model.keys()].sort());

        for (const c of stored) {
          const expected = model.get(c.id);
          expect(expected).toBeDefined();
          expect(c.title).toBe(expected!.title);
          expect(c.createdAt).toBe(expected!.createdAt);
          expect(c.updatedAt).toBe(expected!.updatedAt);

          // Exactly the documented fields, with the documented types.
          expect(Object.keys(c).sort()).toEqual(['createdAt', 'id', 'title', 'updatedAt']);
          expect(typeof c.id).toBe('string');
          expect(typeof c.title).toBe('string');
          expect(typeof c.createdAt).toBe('number');
          expect(typeof c.updatedAt).toBe('number');
        }
      }),
      { numRuns: 100 },
    );
  });

  // Feature: conversation-sessions-layout, Property 7: Rename replaces a non-empty title and ignores blank input
  it('Property 7: renameConversation applies trimmed titles and ignores blank input', () => {
    fc.assert(
      fc.property(roomArb, titleArb, fc.integer({ min: 1, max: 1_000_000 }), (room, submitted, delta) => {
        localStorage.clear();
        const baseNow = 1_000_000;
        const other = createConversation(room, baseNow); // created first, must stay untouched
        const target = createConversation(room, baseNow + 1);
        const renameNow = baseNow + 1 + delta; // strictly greater than target.updatedAt

        renameConversation(room, target.id, submitted, renameNow);

        const list = listConversations(room);
        const updatedTarget = list.find((c) => c.id === target.id)!;
        const updatedOther = list.find((c) => c.id === other.id)!;
        const trimmed = submitted.trim();

        if (trimmed !== '') {
          expect(updatedTarget.title).toBe(trimmed);
          expect(updatedTarget.updatedAt).toBe(renameNow);
        } else {
          expect(updatedTarget.title).toBe(PLACEHOLDER_TITLE);
          expect(updatedTarget.updatedAt).toBe(baseNow + 1);
        }

        // The non-target conversation is never modified by a rename.
        expect(updatedOther.title).toBe(PLACEHOLDER_TITLE);
        expect(updatedOther.updatedAt).toBe(baseNow);
      }),
      { numRuns: 100 },
    );
  });

  // Feature: conversation-sessions-layout, Property 8: Delete removes the target and preserves the invariants
  it('Property 8: deleteConversation removes target + transcript and keeps invariants', () => {
    fc.assert(
      fc.property(
        roomArb,
        fc.integer({ min: 1, max: 5 }),
        fc.integer({ min: 0, max: 1000 }),
        messagesArb,
        (room, count, targetSeed, msgs) => {
          localStorage.clear();

          let clock = 1_700_000_000_000;
          const created: Conversation[] = [];
          for (let i = 0; i < count; i += 1) {
            created.push(createConversation(room, clock));
            clock += 1;
          }
          // Give every conversation a transcript so removal is observable.
          for (const c of created) {
            saveTranscript(room, c.id, msgs, `sess-${c.id}`);
          }

          const target = created[targetSeed % count];
          const deleteNow = clock;
          const result = deleteConversation(room, target.id, deleteNow);

          // The target's transcript key is removed.
          expect(localStorage.getItem(`readmind_chat:${room}:${target.id}`)).toBeNull();

          if (count === 1) {
            // Deleting the last conversation yields exactly one fresh empty conversation.
            expect(result.length).toBe(1);
            const fresh = result[0];
            expect(fresh.id).not.toBe(target.id);
            expect(fresh.title).toBe(PLACEHOLDER_TITLE);
            expect(fresh.createdAt).toBe(deleteNow);
            expect(fresh.updatedAt).toBe(deleteNow);

            const freshTranscript = loadTranscript(room, fresh.id);
            expect(freshTranscript.messages).toEqual([]);
            expect(freshTranscript.sessionId).toBeNull();
          } else {
            // The target is absent; every other conversation remains.
            expect(result.some((c) => c.id === target.id)).toBe(false);
            expect(result.length).toBe(count - 1);
            for (const c of created) {
              if (c.id !== target.id) {
                expect(result.some((r) => r.id === c.id)).toBe(true);
              }
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  // Feature: conversation-sessions-layout, Property 10: Legacy migration is lossless and retains the legacy key
  it('Property 10: migrateLegacy is lossless and retains the legacy key', () => {
    fc.assert(
      fc.property(roomArb, messagesArb, sessionIdArb, nowArb, (room, msgs, sid, now) => {
        localStorage.clear();

        const blob = transcriptBlob(msgs, sid);
        // Seed legacy transcript with NO conversations entry.
        localStorage.setItem(`readmind_chat:${room}`, blob);

        const result = migrateLegacy(room, now);

        // Exactly one conversation.
        expect(result.length).toBe(1);
        const conv = result[0];

        // Its transcript has identical messages/order/sessionId.
        const loaded = loadTranscript(room, conv.id);
        expectMessagesMatch(loaded.messages, msgs);
        expect(loaded.sessionId).toBe(sid);

        // The conversation is recorded in the conversations list.
        const list = listConversations(room);
        expect(list.length).toBe(1);
        expect(list[0].id).toBe(conv.id);

        // The blob was copied verbatim and the legacy key is still present, unchanged.
        expect(localStorage.getItem(`readmind_chat:${room}:${conv.id}`)).toBe(blob);
        expect(localStorage.getItem(`readmind_chat:${room}`)).toBe(blob);
      }),
      { numRuns: 100 },
    );
  });

  // Feature: conversation-sessions-layout, Property 11: Migration is idempotent
  it('Property 11: migrateLegacy is idempotent across arbitrary starting states', () => {
    const scenarioArb = fc.oneof(
      fc.record({ kind: fc.constant('empty' as const) }),
      fc.record({
        kind: fc.constant('legacy' as const),
        messages: messagesArb,
        sessionId: sessionIdArb,
      }),
      fc.record({
        kind: fc.constant('migrated' as const),
        convs: fc.uniqueArray(conversationArb, {
          minLength: 1,
          maxLength: 3,
          selector: (c) => c.id,
        }),
      }),
    );

    fc.assert(
      fc.property(roomArb, scenarioArb, nowArb, nowArb, (room, scenario, now1, now2) => {
        localStorage.clear();

        if (scenario.kind === 'legacy') {
          localStorage.setItem(
            `readmind_chat:${room}`,
            transcriptBlob(scenario.messages, scenario.sessionId),
          );
        } else if (scenario.kind === 'migrated') {
          localStorage.setItem(`readmind_conversations:${room}`, JSON.stringify(scenario.convs));
        }

        const result1 = migrateLegacy(room, now1);
        const snapshot1 = snapshotStorage();

        // A second run (with a different `now`) must not change anything.
        const result2 = migrateLegacy(room, now2);
        const snapshot2 = snapshotStorage();

        expect(result2).toEqual(result1);
        expect(snapshot2).toEqual(snapshot1);
      }),
      { numRuns: 100 },
    );
  });

  // Feature: conversation-sessions-layout, Property 13: Store operations never throw on localStorage write failure
  it('Property 13: mutations return a usable in-memory result when setItem throws', () => {
    const setItemSpy = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('quota');
      });

    try {
      fc.assert(
        fc.property(
          roomArb,
          fc.string({ maxLength: 12 }),
          titleArb,
          messagesArb,
          sessionIdArb,
          nowArb,
          (room, id, title, msgs, sid, now) => {
            expect(() => {
              const created = createConversation(room, now);
              expect(typeof created.id).toBe('string');
              expect(created.id.length).toBeGreaterThan(0);

              expect(Array.isArray(renameConversation(room, id, title, now))).toBe(true);
              expect(Array.isArray(touchConversation(room, id, title, now))).toBe(true);

              const afterDelete = deleteConversation(room, id, now);
              expect(Array.isArray(afterDelete)).toBe(true);

              saveTranscript(room, id, msgs, sid);

              const migrated = migrateLegacy(room, now);
              expect(migrated.length).toBeGreaterThanOrEqual(1);
            }).not.toThrow();
          },
        ),
        { numRuns: 100 },
      );
    } finally {
      setItemSpy.mockRestore();
    }
  });
});
