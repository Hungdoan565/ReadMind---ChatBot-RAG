// Pure-as-possible conversation store (localStorage-backed).
//
// This module owns all persistence for conversations and their transcripts,
// keyed per room. It is the single source of truth for the on-disk schema:
//
//   readmind_conversations:{room}      -> Conversation[]            (the list)
//   readmind_chat:{room}:{convId}      -> PersistedTranscript       (per conversation)
//   readmind_chat:{room}               -> PersistedTranscript       (legacy, read-only)
//
// The persisted transcript blob is byte-compatible with the format `useChat`
// already writes (`{ messages, sessionId }`, timestamps as ISO strings, the
// transient `isStreaming` flag stripped), which makes legacy migration a
// straight copy.
//
// Every localStorage read/write is wrapped in try/catch and never throws to
// callers. On a write failure (quota exceeded, storage unavailable) the
// mutation still returns a usable in-memory result so the chat surface keeps
// working (Requirement 10.5). All user-facing strings are Vietnamese.

import type { Conversation, ChatMessage, PersistedTranscript } from '../types';
import { generateTitle } from './conversationHelpers';

// ---------------------------------------------------------------------------
// Constants + key builders
// ---------------------------------------------------------------------------

const CONVERSATIONS_PREFIX = 'readmind_conversations:';
const CHAT_PREFIX = 'readmind_chat:';

/** Vietnamese placeholder title for a conversation with no user messages yet. */
const PLACEHOLDER_TITLE = 'Cuộc trò chuyện mới';

const EMPTY_TRANSCRIPT: PersistedTranscript = { messages: [], sessionId: null };

function conversationsKey(room: string): string {
  return `${CONVERSATIONS_PREFIX}${room}`;
}

function transcriptKey(room: string, convId: string): string {
  return `${CHAT_PREFIX}${room}:${convId}`;
}

function legacyChatKey(room: string): string {
  return `${CHAT_PREFIX}${room}`;
}

// ---------------------------------------------------------------------------
// Safe localStorage primitives (never throw to callers — Requirement 10.5)
// ---------------------------------------------------------------------------

function safeRead(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeWrite(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Quota exceeded / storage unavailable — silently ignore (Requirement 10.5)
  }
}

function safeRemove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function newConversationId(now: number): string {
  return `conv-${now}-${Math.random().toString(36).slice(2, 8)}`;
}

function buildConversation(now: number, title: string = PLACEHOLDER_TITLE): Conversation {
  return {
    id: newConversationId(now),
    title,
    createdAt: now,
    updatedAt: now,
  };
}

/** Read a room's raw conversation list as stored (insertion order). [] on miss/parse error. */
function readList(room: string): Conversation[] {
  if (!room) return [];
  const raw = safeRead(conversationsKey(room));
  if (!raw) return [];
  try {
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data as Conversation[];
  } catch {
    return [];
  }
}

function writeList(room: string, list: Conversation[]): void {
  if (!room) return;
  safeWrite(conversationsKey(room), JSON.stringify(list));
}

/** A copy of the list ordered by `updatedAt` descending (most recent first). */
function sortByUpdatedDesc(list: Conversation[]): Conversation[] {
  return [...list].sort((a, b) => b.updatedAt - a.updatedAt);
}

/** A conversation still showing the placeholder is considered "no real title yet". */
function hasNoRealTitle(conversation: Conversation): boolean {
  const trimmed = conversation.title.trim();
  return trimmed === '' || trimmed === PLACEHOLDER_TITLE;
}

function persistTranscript(room: string, convId: string, transcript: PersistedTranscript): void {
  if (!room || !convId) return;
  safeWrite(transcriptKey(room, convId), JSON.stringify(transcript));
}

/** Extract the first user message's content from a raw legacy transcript blob. */
function firstUserMessageFromRaw(raw: string): string | null {
  try {
    const data = JSON.parse(raw) as PersistedTranscript;
    const messages = data.messages ?? [];
    const firstUser = messages.find((m) => m.role === 'user');
    return firstUser ? firstUser.content : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** List a room's conversations, sorted by `updatedAt` descending. [] on miss/parse error. */
export function listConversations(room: string): Conversation[] {
  return sortByUpdatedDesc(readList(room));
}

/**
 * Create a new empty conversation in `room`: id `conv-{now}-{rand}`, placeholder
 * title, `createdAt === updatedAt === now`. Persists an empty transcript and
 * prepends the conversation to the existing list (no existing entry dropped).
 * Returns the created conversation. `now` is injectable for testing.
 */
export function createConversation(room: string, now: number = Date.now()): Conversation {
  const conversation = buildConversation(now);
  const updated = [conversation, ...readList(room)];
  persistTranscript(room, conversation.id, EMPTY_TRANSCRIPT);
  writeList(room, updated);
  return conversation;
}

/**
 * Replace a conversation's title with the trimmed `title` and bump its
 * `updatedAt`. An empty or whitespace-only title is ignored (the existing title
 * is retained). Persists and returns the resulting list (sorted, in memory).
 */
export function renameConversation(
  room: string,
  id: string,
  title: string,
  now: number = Date.now(),
): Conversation[] {
  const list = readList(room);
  const trimmed = title.trim();
  if (trimmed === '') {
    return sortByUpdatedDesc(list);
  }
  const updated = list.map((conversation) =>
    conversation.id === id
      ? { ...conversation, title: trimmed, updatedAt: now }
      : conversation,
  );
  writeList(room, updated);
  return sortByUpdatedDesc(updated);
}

/**
 * Mark activity on a conversation: when `firstUserMessage` is provided and the
 * conversation still has the placeholder/no real title yet, derive the title via
 * `generateTitle`. Always bumps `updatedAt`. Persists and returns the resulting
 * list (sorted, in memory). Used by `useConversations.noteSend`.
 */
export function touchConversation(
  room: string,
  id: string,
  firstUserMessage?: string,
  now: number = Date.now(),
): Conversation[] {
  const list = readList(room);
  const updated = list.map((conversation) => {
    if (conversation.id !== id) {
      return conversation;
    }
    let title = conversation.title;
    if (firstUserMessage !== undefined && hasNoRealTitle(conversation)) {
      const generated = generateTitle(firstUserMessage);
      if (generated !== '') {
        title = generated;
      }
    }
    return { ...conversation, title, updatedAt: now };
  });
  writeList(room, updated);
  return sortByUpdatedDesc(updated);
}

/**
 * Remove a conversation's entry and its transcript key. If the room becomes
 * empty as a result, create one fresh empty conversation (with an empty
 * transcript) so a room always has at least one conversation. Persists and
 * returns the resulting list (sorted, in memory).
 */
export function deleteConversation(
  room: string,
  id: string,
  now: number = Date.now(),
): Conversation[] {
  const remaining = readList(room).filter((conversation) => conversation.id !== id);
  safeRemove(transcriptKey(room, id));

  if (remaining.length === 0) {
    const fresh = buildConversation(now);
    persistTranscript(room, fresh.id, EMPTY_TRANSCRIPT);
    writeList(room, [fresh]);
    return [fresh];
  }

  writeList(room, remaining);
  return sortByUpdatedDesc(remaining);
}

/**
 * Load a conversation's transcript and `sessionId`, reviving message timestamps
 * to `Date`. Returns an empty result on miss or parse error. Mirrors the load
 * path that `useChat` used for the legacy single-transcript key.
 */
export function loadTranscript(
  room: string,
  convId: string,
): { messages: ChatMessage[]; sessionId: string | null } {
  if (!room || !convId) return { messages: [], sessionId: null };
  const raw = safeRead(transcriptKey(room, convId));
  if (!raw) return { messages: [], sessionId: null };
  try {
    const data = JSON.parse(raw) as PersistedTranscript;
    const messages: ChatMessage[] = (data.messages ?? []).map((m) => ({
      ...m,
      timestamp: new Date(m.timestamp),
    }));
    return { messages, sessionId: data.sessionId ?? null };
  } catch {
    return { messages: [], sessionId: null };
  }
}

/**
 * Persist a conversation's transcript and `sessionId`. Timestamps are stored as
 * ISO strings and the transient `isStreaming` flag is stripped — byte-compatible
 * with the legacy `useChat` format. Silent on failure (Requirement 10.5).
 */
export function saveTranscript(
  room: string,
  convId: string,
  messages: ChatMessage[],
  sessionId: string | null,
): void {
  if (!room || !convId) return;
  const transcript: PersistedTranscript = {
    messages: messages.map(({ isStreaming: _s, ...m }) => ({
      ...m,
      timestamp: m.timestamp.toISOString(),
    })),
    sessionId,
  };
  persistTranscript(room, convId, transcript);
}

/**
 * Idempotently ensure a room has a conversation list (length >= 1):
 *  - already migrated (a non-empty `readmind_conversations:{room}` exists) ->
 *    return it unchanged;
 *  - otherwise copy any legacy `readmind_chat:{room}` blob verbatim to a new
 *    `readmind_chat:{room}:{convId}` key (or persist an empty transcript when no
 *    legacy blob exists), titling the conversation from the legacy first user
 *    message when present and the placeholder otherwise, and record exactly one
 *    conversation. The legacy key is intentionally left intact.
 */
export function migrateLegacy(room: string, now: number = Date.now()): Conversation[] {
  const existing = readList(room);
  if (existing.length > 0) {
    // The presence of a conversations entry is the sole migrated marker.
    return sortByUpdatedDesc(existing);
  }

  const legacyRaw = safeRead(legacyChatKey(room));
  const hasLegacy = legacyRaw !== null && legacyRaw !== '';

  let title = PLACEHOLDER_TITLE;
  if (hasLegacy) {
    const firstUser = firstUserMessageFromRaw(legacyRaw);
    if (firstUser !== null && firstUser.trim() !== '') {
      title = generateTitle(firstUser);
    }
  }

  const conversation = buildConversation(now, title);

  if (hasLegacy) {
    // Copy the legacy blob verbatim: preserves message order and sessionId.
    safeWrite(transcriptKey(room, conversation.id), legacyRaw);
  } else {
    persistTranscript(room, conversation.id, EMPTY_TRANSCRIPT);
  }

  // Record the migrated marker; legacy `readmind_chat:{room}` is NOT removed.
  writeList(room, [conversation]);
  return [conversation];
}
