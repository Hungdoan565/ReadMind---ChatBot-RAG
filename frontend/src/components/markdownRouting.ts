/**
 * Pure markup-routing helpers for the assistant markdown pipeline.
 *
 * These functions let `MessageBubble`'s `code` override decide whether a fenced
 * code block should be rendered as a Mermaid diagram, a highlighted code block,
 * or inline code — without depending on React or the DOM. They are intentionally
 * side-effect free and unit-testable in isolation.
 */
import type { Element } from 'hast';

/**
 * Extract the language token from a code element's className.
 *
 * `rehype-highlight` and `remark` emit info strings as a `language-<id>` class
 * alongside other classes (e.g. `"language-mermaid hljs"`). Inline code and
 * fenced blocks with no info string have no `language-` class.
 *
 * @example languageOf("language-mermaid hljs") // "mermaid"
 * @example languageOf(undefined)               // null  (inline / no info string)
 */
export function languageOf(className: string | undefined): string | null {
  if (className == null) return null;
  const match = /(?:^|\s)language-([^\s]+)/.exec(className);
  return match ? match[1] : null;
}

/**
 * Recursively concatenate every descendant text node of a hast element.
 *
 * `rehype-highlight` rewrites a code element's raw text into nested `<span>`
 * elements, so React's `children` prop is no longer the original source string.
 * Walking the hast `node` and joining the `value` of all descendant text nodes
 * recovers the verbatim Mermaid source needed for rendering.
 */
export function getNodeText(node: Element | undefined): string {
  if (node == null) return '';
  let out = '';
  for (const child of node.children ?? []) {
    if (child.type === 'text') out += child.value;
    else if (child.type === 'element') out += getNodeText(child);
  }
  return out;
}

/**
 * Determine whether a fenced code block has a real matching closing fence.
 *
 * CommonMark auto-closes an unterminated fenced block at end of input, so the
 * parsed AST alone cannot distinguish "closed by ```" from "closed by EOF". We
 * inspect the raw block text using the node's source position offsets (remark
 * tracks `position` by default): a complete fenced block's last line is a bare
 * closing fence.
 *
 * Returns `false` when position offsets are unavailable (e.g. an incomplete or
 * aborted mid-stream block), routing such blocks to a highlighted code block
 * rather than the diagram renderer.
 */
export function isFenceComplete(content: string, node: Element | undefined): boolean {
  const start = node?.position?.start?.offset;
  const end = node?.position?.end?.offset;
  if (start == null || end == null) return false;
  const block = content.slice(start, end).trimEnd();
  // A complete fenced block opens with ``` and its last line is a bare closing fence.
  return /(^|\n)```+\s*$/.test(block) && /^```/.test(block);
}
