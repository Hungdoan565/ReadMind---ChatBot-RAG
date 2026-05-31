// Pure conversation helpers.
//
// This module holds the unit-testable, side-effect-free core used by the
// conversation store, the orchestrator hook, and the sidebar UI. Every function
// is deterministic for a given input (timestamps are injectable) so the suite can
// property-test them directly. All user-facing strings are Vietnamese.

import type { Conversation } from '../types';

// ---------------------------------------------------------------------------
// Title generation
// ---------------------------------------------------------------------------

const TITLE_MAX_CHARS = 40;
const ELLIPSIS = '\u2026'; // single U+2026 HORIZONTAL ELLIPSIS

/**
 * Derive a conversation title from a message: trim leading/trailing whitespace;
 * if the trimmed text is 40 characters or fewer return it unchanged; otherwise
 * keep the first 40 characters and append a single ellipsis "…".
 *
 * Length and slicing use `Array.from` so multi-code-unit characters (Vietnamese
 * diacritics, emoji) are counted and split by code point, never mid-character.
 */
export function generateTitle(message: string): string {
  const trimmed = message.trim();
  const chars = Array.from(trimmed);
  if (chars.length <= TITLE_MAX_CHARS) {
    return trimmed;
  }
  return chars.slice(0, TITLE_MAX_CHARS).join('') + ELLIPSIS;
}

// ---------------------------------------------------------------------------
// Relative-time formatting
// ---------------------------------------------------------------------------

const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;
const MS_PER_WEEK = 604_800_000;

function pad2(value: number): string {
  return value < 10 ? `0${value}` : `${value}`;
}

/**
 * Vietnamese relative-time label derived from `updatedAt` relative to `now`
 * (default `Date.now()`). The quantity is floored to the unit.
 *
 * Buckets:
 *  - < 60s          -> "Vừa xong"
 *  - < 60m          -> "{n} phút trước"
 *  - < 24h          -> "{n} giờ trước"
 *  - < 7d           -> "{n} ngày trước"
 *  - < 4w           -> "{n} tuần trước"
 *  - otherwise      -> "dd/MM/yyyy"
 */
export function formatRelativeTime(updatedAt: number, now: number = Date.now()): string {
  const elapsed = now - updatedAt;

  if (elapsed < MS_PER_MINUTE) {
    return 'Vừa xong';
  }
  if (elapsed < MS_PER_HOUR) {
    return `${Math.floor(elapsed / MS_PER_MINUTE)} phút trước`;
  }
  if (elapsed < MS_PER_DAY) {
    return `${Math.floor(elapsed / MS_PER_HOUR)} giờ trước`;
  }
  if (elapsed < 7 * MS_PER_DAY) {
    return `${Math.floor(elapsed / MS_PER_DAY)} ngày trước`;
  }
  if (elapsed < 4 * MS_PER_WEEK) {
    return `${Math.floor(elapsed / MS_PER_WEEK)} tuần trước`;
  }

  const date = new Date(updatedAt);
  return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()}`;
}

// ---------------------------------------------------------------------------
// Search normalization + filtering
// ---------------------------------------------------------------------------

const COMBINING_MARKS = /[\u0300-\u036f]/g;

/**
 * Lowercase and strip diacritics for accent- and case-insensitive comparison:
 * lowercase, NFD-normalize, remove combining marks, and map đ/Đ -> d (the
 * Vietnamese stroked d does not decompose under NFD, so it is mapped explicitly).
 */
export function normalizeForSearch(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd');
}

/**
 * Return the conversations whose normalized title contains the normalized,
 * trimmed query as a substring, preserving input order. An empty or
 * whitespace-only query returns the list unchanged.
 */
export function filterConversations(
  conversations: Conversation[],
  query: string,
): Conversation[] {
  const normalizedQuery = normalizeForSearch(query.trim());
  if (normalizedQuery === '') {
    return conversations;
  }
  return conversations.filter((conversation) =>
    normalizeForSearch(conversation.title).includes(normalizedQuery),
  );
}

// ---------------------------------------------------------------------------
// Most-recent selection
// ---------------------------------------------------------------------------

/**
 * Pick the "most recent" conversation: maximal by `updatedAt`, breaking ties by
 * the greater `createdAt` and then by the greater `id` lexicographically.
 * Returns `null` for an empty list.
 */
export function pickMostRecent(conversations: Conversation[]): Conversation | null {
  if (conversations.length === 0) {
    return null;
  }
  return conversations.reduce((best, current) => {
    if (current.updatedAt !== best.updatedAt) {
      return current.updatedAt > best.updatedAt ? current : best;
    }
    if (current.createdAt !== best.createdAt) {
      return current.createdAt > best.createdAt ? current : best;
    }
    return current.id > best.id ? current : best;
  });
}
