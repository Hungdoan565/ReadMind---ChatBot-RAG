import { describe, it, expect } from 'vitest';
import type { Element, ElementContent } from 'hast';
import { languageOf, getNodeText, isFenceComplete } from '../markdownRouting';

/**
 * Table-driven unit tests for the pure markup-routing helpers.
 *
 * These helpers drive the `code` override in `MessageBubble` and must behave
 * deterministically without React or the DOM. The cases below mirror the design's
 * routing contract: info-string detection (`languageOf`), raw-source recovery
 * across `rehype-highlight` spans (`getNodeText`), and closing-fence detection
 * vs CommonMark's EOF auto-close (`isFenceComplete`).
 *
 * Validates: Requirements 4.1, 4.2, 7.3, 7.5, 11.4
 */

// --- hast node builders -----------------------------------------------------

/** A hast text node (leaf carrying verbatim source). */
function text(value: string): ElementContent {
  return { type: 'text', value };
}

/** A `<span>` element node, as emitted by `rehype-highlight` around tokens. */
function span(children: ElementContent[]): ElementContent {
  return { type: 'element', tagName: 'span', properties: {}, children };
}

/** A `<code>` element node with the given children. */
function code(children: ElementContent[]): Element {
  return { type: 'element', tagName: 'code', properties: {}, children };
}

/** Attach unist source-position offsets to an element (remark tracks these). */
function withOffsets(node: Element, startOffset: number, endOffset: number): Element {
  return {
    ...node,
    position: {
      start: { line: 1, column: 1, offset: startOffset },
      end: { line: 1, column: 1, offset: endOffset },
    },
  };
}

// --- languageOf -------------------------------------------------------------

describe('languageOf', () => {
  const cases: Array<{ name: string; className: string | undefined; expected: string | null }> = [
    { name: 'mermaid info string alongside the hljs class', className: 'language-mermaid hljs', expected: 'mermaid' },
    { name: 'bare mermaid info string', className: 'language-mermaid', expected: 'mermaid' },
    { name: 'text info string for ASCII art', className: 'language-text', expected: 'text' },
    { name: 'a programming-language info string', className: 'language-python hljs', expected: 'python' },
    { name: 'language- class not first in the list', className: 'hljs language-ts', expected: 'ts' },
    { name: 'class without a language- token', className: 'hljs', expected: null },
    { name: 'inline code (undefined className)', className: undefined, expected: null },
    { name: 'empty className', className: '', expected: null },
  ];

  it.each(cases)('returns $expected for $name', ({ className, expected }) => {
    expect(languageOf(className)).toBe(expected);
  });
});

// --- getNodeText ------------------------------------------------------------

describe('getNodeText', () => {
  it('returns an empty string for an undefined node', () => {
    expect(getNodeText(undefined)).toBe('');
  });

  it('returns an empty string for an element with no children', () => {
    expect(getNodeText(code([]))).toBe('');
  });

  it('returns the value of a single text child', () => {
    expect(getNodeText(code([text('flowchart TD')]))).toBe('flowchart TD');
  });

  it('recovers the verbatim source across nested rehype-highlight spans', () => {
    // Mirrors how rehype-highlight rewrites raw source into nested <span> tokens.
    const node = code([
      span([text('flowchart')]),
      text(' TD\n'),
      span([text('  A[Bắt đầu]'), span([text(' --> ')]), text('B[Kết thúc]')]),
    ]);

    expect(getNodeText(node)).toBe('flowchart TD\n  A[Bắt đầu] --> B[Kết thúc]');
  });
});

// --- isFenceComplete --------------------------------------------------------

describe('isFenceComplete', () => {
  it('returns true when the block ends with a matching closing fence', () => {
    const content = 'Sơ đồ:\n\n```mermaid\nflowchart TD\n  A --> B\n```\n\nXong.';
    const start = content.indexOf('```mermaid');
    const end = content.indexOf('```', start + 3) + 3; // include the closing ```
    const node = withOffsets(code([text('flowchart TD\n  A --> B')]), start, end);

    expect(isFenceComplete(content, node)).toBe(true);
  });

  it('returns false for an EOF-auto-closed fence (no closing ``` received)', () => {
    const content = 'Sơ đồ:\n\n```mermaid\nflowchart TD\n  A --> B';
    const start = content.indexOf('```mermaid');
    const node = withOffsets(code([text('flowchart TD\n  A --> B')]), start, content.length);

    expect(isFenceComplete(content, node)).toBe(false);
  });

  it('returns false when source-position offsets are unavailable', () => {
    const content = '```mermaid\nflowchart TD\n  A --> B\n```';
    // No `position` attached — e.g. an incomplete/aborted mid-stream block.
    expect(isFenceComplete(content, code([text('flowchart TD')]))).toBe(false);
  });

  it('returns false for an undefined node', () => {
    expect(isFenceComplete('```mermaid\n```', undefined)).toBe(false);
  });
});
