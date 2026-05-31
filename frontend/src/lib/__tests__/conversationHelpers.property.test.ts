// Property-based tests for the pure conversation helpers.
//
// Library: fast-check + Vitest (one property-based test per correctness property
// from the design's "Correctness Properties" section). Each `fc.assert` runs at
// least 100 iterations. Generators intentionally exercise whitespace, Vietnamese
// diacritics, emoji, long strings, accented titles, and tie-prone timestamps.

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  generateTitle,
  formatRelativeTime,
  filterConversations,
  pickMostRecent,
} from '../conversationHelpers';
import type { Conversation } from '../../types';

const NUM_RUNS = 100;

// ---------------------------------------------------------------------------
// Shared generators
// ---------------------------------------------------------------------------

// Diverse text fragments: arbitrary unicode, whitespace, Vietnamese diacritics,
// Vietnamese phrases, and (multi-code-point) emoji.
const whitespaceFragment = fc.constantFrom(' ', '\t', '\n', '\r', '   ', '\n\t ');
const vietnameseFragment = fc.constantFrom(
  'à', 'á', 'â', 'ã', 'è', 'é', 'ê', 'ì', 'í', 'đ', 'Đ', 'ọ', 'ơ', 'ư', 'ạ', 'ế', 'ộ', 'ữ',
);
const vietnamesePhrase = fc.constantFrom(
  'Tài liệu', 'Cuộc trò chuyện', 'tóm tắt nội dung', 'báo cáo dự án', 'hợp đồng',
);
const emojiFragment = fc.constantFrom(
  '😀', '🎉', '👨‍👩‍👧‍👦', '🇻🇳', '🧑🏽‍💻', '❤️', '🌟',
);

const textFragment = fc.oneof(
  fc.string(),
  whitespaceFragment,
  vietnameseFragment,
  vietnamesePhrase,
  emojiFragment,
);

// A message string built from many fragments, sometimes wrapped in padding so
// that trimming is exercised on both ends. Frequently exceeds 40 code points.
const messageArb = fc
  .tuple(
    fc.constantFrom('', ' ', '  ', '\n', '\t '),
    fc.array(textFragment, { minLength: 0, maxLength: 40 }).map((parts) => parts.join('')),
    fc.constantFrom('', ' ', '  ', '\n', ' \t'),
  )
  .map(([lead, body, trail]) => lead + body + trail);

// ---------------------------------------------------------------------------
// Property 1: Title generation truncates and trims correctly
// ---------------------------------------------------------------------------

// Feature: conversation-sessions-layout, Property 1: generateTitle returns the
// trimmed text unchanged when <= 40 code points, else the first 40 code points
// plus a single trailing ellipsis (result <= 41 code points).
// **Validates: Requirements 6.1, 6.2, 6.3**
describe('Property 1: generateTitle truncates and trims correctly', () => {
  it('returns trimmed text when short, else first 40 code points + single "…"', () => {
    fc.assert(
      fc.property(messageArb, (message) => {
        const result = generateTitle(message);
        const trimmed = message.trim();
        const trimmedCp = Array.from(trimmed);

        // Result never exceeds 41 code points (40 + ellipsis).
        expect(Array.from(result).length).toBeLessThanOrEqual(41);

        if (trimmedCp.length <= 40) {
          // Short branch: trimmed text returned verbatim, no ellipsis appended.
          expect(result).toBe(trimmed);
        } else {
          // Long branch: first 40 code points + exactly one trailing ellipsis.
          const resultCp = Array.from(result);
          expect(result).toBe(trimmedCp.slice(0, 40).join('') + '\u2026');
          expect(resultCp.length).toBe(41);
          expect(resultCp[resultCp.length - 1]).toBe('\u2026');
          // First 40 code points match the trimmed source exactly.
          expect(resultCp.slice(0, 40)).toEqual(trimmedCp.slice(0, 40));
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 2: Conversation search is accent- and case-insensitive substring match
// ---------------------------------------------------------------------------

// Independent normalization oracle mirroring the spec (lowercase, NFD, strip
// combining marks, đ/Đ -> d). Written separately so the test verifies
// filterConversations' composition (trim + normalize + substring + order),
// not just the helper's own normalizer.
function normalizeOracle(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd');
}

const titleWord = fc.constantFrom(
  'Tài', 'liệu', 'báo', 'cáo', 'dự', 'án', 'tóm', 'tắt', 'họp', 'meeting',
  'Đà', 'Nẵng', 'hợp', 'đồng', 'report', 'notes',
);
const titleArb = fc
  .array(titleWord, { minLength: 0, maxLength: 4 })
  .map((words) => words.join(' '));

const conversationForSearchArb: fc.Arbitrary<Conversation> = fc
  .record({
    baseId: fc.string(),
    title: titleArb,
    createdAt: fc.integer({ min: 0, max: 10_000 }),
    updatedAt: fc.integer({ min: 0, max: 10_000 }),
  })
  .map((r) => ({ id: r.baseId, title: r.title, createdAt: r.createdAt, updatedAt: r.updatedAt }));

// Queries: empty/whitespace, arbitrary text, and accent-stripped/case-variant
// tokens that should still match accented titles.
const queryArb = fc.oneof(
  fc.constantFrom('', '   ', '\t', '\n  '),
  fc.string(),
  fc.constantFrom('tai', 'lieu', 'BAO', 'Da Nang', 'hop dong', 'TÓM', 'dự án', 'meeting'),
);

// Feature: conversation-sessions-layout, Property 2: filterConversations keeps
// exactly the items whose accent/case-normalized title contains the normalized
// trimmed query as a substring, preserving input order; empty/whitespace query
// returns the full list unchanged.
// **Validates: Requirements 9.1, 9.3**
describe('Property 2: conversation search is accent- and case-insensitive', () => {
  it('keeps normalized-substring matches in order; empty query returns all', () => {
    fc.assert(
      fc.property(
        fc.array(conversationForSearchArb, { minLength: 0, maxLength: 8 }),
        queryArb,
        (conversations, query) => {
          const result = filterConversations(conversations, query);
          const normalizedQuery = normalizeOracle(query.trim());

          if (normalizedQuery === '') {
            // Empty/whitespace query: full list unchanged.
            expect(result).toEqual(conversations);
          } else {
            const expected = conversations.filter((c) =>
              normalizeOracle(c.title).includes(normalizedQuery),
            );
            // Same elements, same order (input order preserved).
            expect(result).toEqual(expected);
          }
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 3: Relative-time labels fall in the correct bucket
// ---------------------------------------------------------------------------

const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;
const MS_PER_WEEK = 604_800_000;

function expectedRelativeLabel(updatedAt: number, now: number): string {
  const elapsed = now - updatedAt;
  if (elapsed < MS_PER_MINUTE) return 'Vừa xong';
  if (elapsed < MS_PER_HOUR) return `${Math.floor(elapsed / MS_PER_MINUTE)} phút trước`;
  if (elapsed < MS_PER_DAY) return `${Math.floor(elapsed / MS_PER_HOUR)} giờ trước`;
  if (elapsed < 7 * MS_PER_DAY) return `${Math.floor(elapsed / MS_PER_DAY)} ngày trước`;
  if (elapsed < 4 * MS_PER_WEEK) return `${Math.floor(elapsed / MS_PER_WEEK)} tuần trước`;
  const d = new Date(updatedAt);
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

// Elapsed intervals spanning every bucket (including beyond four weeks).
const elapsedArb = fc.oneof(
  fc.integer({ min: 0, max: MS_PER_MINUTE - 1 }),
  fc.integer({ min: MS_PER_MINUTE, max: MS_PER_HOUR - 1 }),
  fc.integer({ min: MS_PER_HOUR, max: MS_PER_DAY - 1 }),
  fc.integer({ min: MS_PER_DAY, max: 7 * MS_PER_DAY - 1 }),
  fc.integer({ min: 7 * MS_PER_DAY, max: 4 * MS_PER_WEEK - 1 }),
  fc.integer({ min: 4 * MS_PER_WEEK, max: 4 * MS_PER_WEEK + 5 * 365 * MS_PER_DAY }),
);

// Reference `now` kept in a realistic positive epoch range so updatedAt stays > 0.
const nowArb = fc.integer({ min: 1_600_000_000_000, max: 1_900_000_000_000 });

// Feature: conversation-sessions-layout, Property 3: for updatedAt <= now,
// formatRelativeTime returns the Vietnamese bucket label with the quantity
// floored to that unit.
// **Validates: Requirements 2.6**
describe('Property 3: relative-time labels fall in the correct bucket', () => {
  it('returns the floored Vietnamese label for the elapsed interval', () => {
    fc.assert(
      fc.property(nowArb, elapsedArb, (now, elapsed) => {
        const updatedAt = now - elapsed;
        expect(updatedAt).toBeLessThanOrEqual(now); // precondition holds by construction
        expect(formatRelativeTime(updatedAt, now)).toBe(expectedRelativeLabel(updatedAt, now));
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 9: Most-recent selection ordering with deterministic tie-break
// ---------------------------------------------------------------------------

// Small timestamp ranges force frequent ties so the createdAt/id tie-break is
// exercised. Unique ids (index-suffixed) keep the maximum element unambiguous.
const conversationListArb: fc.Arbitrary<Conversation[]> = fc
  .array(
    fc.record({
      baseId: fc.string(),
      title: fc.string(),
      createdAt: fc.integer({ min: 0, max: 6 }),
      updatedAt: fc.integer({ min: 0, max: 6 }),
    }),
    { minLength: 1, maxLength: 10 },
  )
  .map((items) =>
    items.map((it, i) => ({
      id: `${it.baseId}#${i}`,
      title: it.title,
      createdAt: it.createdAt,
      updatedAt: it.updatedAt,
    })),
  );

// Feature: conversation-sessions-layout, Property 9: pickMostRecent returns the
// conversation maximal by updatedAt, tie-broken by greater createdAt then greater
// id lexicographically; null for an empty list.
// **Validates: Requirements 8.2**
describe('Property 9: most-recent selection ordering with deterministic tie-break', () => {
  it('returns null for an empty list', () => {
    expect(pickMostRecent([])).toBeNull();
  });

  it('returns the deterministic maximum for any non-empty list', () => {
    fc.assert(
      fc.property(conversationListArb, (list) => {
        const expected = [...list].sort((a, b) => {
          if (a.updatedAt !== b.updatedAt) return b.updatedAt - a.updatedAt;
          if (a.createdAt !== b.createdAt) return b.createdAt - a.createdAt;
          if (a.id === b.id) return 0;
          return a.id > b.id ? -1 : 1; // greater id wins the tie-break
        })[0];
        expect(pickMostRecent(list)).toEqual(expected);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
