/**
 * MermaidDiagram — renders a complete Mermaid source string into a sandboxed
 * inline SVG diagram, with graceful degradation to the raw source on any failure.
 *
 * The `mermaid` library is heavy, so it is loaded **only** via a module-level
 * dynamic-import singleton (`loadMermaid`). This keeps it out of the initial
 * bundle (Vite code-splits dynamic imports) and guarantees it is fetched at most
 * once across the whole app, on first render of a renderable diagram.
 *
 * Rendering is sandboxed: Mermaid runs with `securityLevel: 'strict'` and the
 * resulting SVG is parsed with `DOMParser` and attached via `replaceChildren`
 * (never `dangerouslySetInnerHTML`). Any parse/render/timeout/import failure is
 * caught locally and falls back to a verbatim `<pre><code>` of the source with a
 * Vietnamese note — the component never throws.
 */
import { useEffect, useId, useRef, useState } from 'react';
import type { JSX } from 'react';
import type { Mermaid } from 'mermaid';

export interface MermaidDiagramProps {
  /**
   * Complete Mermaid source WITHOUT the surrounding ``` fences.
   * The caller (MessageBubble) only mounts this component once the block's
   * closing fence is present and the message is no longer streaming.
   */
  source: string;
  /** Dark-theme flag from useTheme(); drives Mermaid theme selection + re-render. */
  isDark: boolean;
}

// ---------------------------------------------------------------------------
// Module-level lazy-load singleton
// ---------------------------------------------------------------------------

let mermaidPromise: Promise<Mermaid> | null = null;

/**
 * Dynamically import `mermaid` at most once. The dynamic `import('mermaid')`
 * (never a static import) is what lets Vite emit it as a separate async chunk,
 * excluded from the initial page bundle. Subsequent calls reuse the cached
 * promise so the library is fetched/parsed only on first use.
 */
function loadMermaid(): Promise<Mermaid> {
  if (mermaidPromise === null) {
    mermaidPromise = import('mermaid').then((mod) => mod.default);
  }
  return mermaidPromise;
}

// ---------------------------------------------------------------------------
// Constants and Vietnamese UI strings
// ---------------------------------------------------------------------------

const RENDER_TIMEOUT_MS = 5000;
const DIAGRAM_ARIA_LABEL = 'Sơ đồ Mermaid';
const LOADING_TEXT = 'Đang tải sơ đồ…';
const ERROR_NOTE = 'Không thể hiển thị sơ đồ — hiển thị mã nguồn Mermaid:';

// ---------------------------------------------------------------------------
// Internal render state machine
// ---------------------------------------------------------------------------

type RenderStatus =
  | { kind: 'loading' } // library loading OR render in flight
  | { kind: 'rendered' } // SVG injected into the ref container
  | { kind: 'error'; reason: string }; // parse/render/timeout/import failure

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/** Reject if `promise` does not settle within `ms` milliseconds (Req 8.6). */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Mermaid render timed out'));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error(String(err)));
      },
    );
  });
}

/**
 * Parse a sanitized SVG string into a detached DOM node without executing
 * scripts and without `dangerouslySetInnerHTML` (Req 8.2). Parsing as an
 * `image/svg+xml` document neither runs inline scripts nor fetches resources;
 * a malformed string yields a non-`<svg>` root, which we reject.
 */
function parseSvg(svg: string): Element {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const el = doc.documentElement;
  if (el.nodeName.toLowerCase() !== 'svg') {
    throw new Error('Mermaid did not return an <svg> root');
  }
  return el;
}

function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/**
 * Read a live glassmorphism CSS variable, falling back to a hard-coded value
 * when the document/computed style is unavailable (SSR, jsdom) or the variable
 * resolves empty.
 */
function readVar(name: string, fallback: string): string {
  if (typeof window === 'undefined' || typeof document === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

/**
 * Build Mermaid theme variables derived from the glassmorphism CSS tokens, with
 * light/dark fallbacks so diagrams feel native in both themes (Req 9.1, 9.2).
 */
function mermaidThemeConfig(isDark: boolean) {
  return {
    theme: 'base' as const,
    themeVariables: {
      background: readVar('--bg-secondary', isDark ? '#232320' : '#F4F4F2'),
      primaryColor: readVar('--bg-tertiary', isDark ? '#2D2D29' : '#E9E9E6'),
      primaryTextColor: readVar('--text-primary', isDark ? '#F5F5F3' : '#1C1917'),
      primaryBorderColor: readVar('--border-primary', isDark ? '#3A3A35' : '#E2E0DC'),
      lineColor: readVar('--accent', isDark ? '#2DD4BF' : '#0D9488'),
      secondaryColor: readVar('--bg-primary', isDark ? '#1A1A18' : '#FAFAF9'),
      textColor: readVar('--text-secondary', isDark ? '#C7C5BF' : '#57534E'),
      fontFamily: readVar('--font-sans', "'Work Sans', sans-serif"),
    },
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MermaidDiagram({ source, isDark }: MermaidDiagramProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  // useId() ids contain ':' which is not valid in a DOM id / Mermaid id; sanitize.
  const domId = `mermaid-${useId().replace(/[^a-zA-Z0-9-]/g, '')}`;
  const [status, setStatus] = useState<RenderStatus>({ kind: 'loading' });

  // Render effect keyed only on (source, isDark): an unchanged source on a parent
  // re-render does not re-parse (Req 4.7, 7.7); a theme switch does (Req 9.1, 9.2).
  useEffect(() => {
    let cancelled = false;
    const containerEl = containerRef.current;
    setStatus({ kind: 'loading' });

    loadMermaid()
      .then((mermaid) => {
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          ...mermaidThemeConfig(isDark),
        });
        return withTimeout(mermaid.render(domId, source), RENDER_TIMEOUT_MS);
      })
      .then(({ svg }) => {
        if (cancelled || containerEl === null) return;
        const node = parseSvg(svg); // DOMParser, NOT dangerouslySetInnerHTML
        node.setAttribute('role', 'img');
        node.setAttribute('aria-label', DIAGRAM_ARIA_LABEL); // Vietnamese
        containerEl.replaceChildren(node);
        setStatus({ kind: 'rendered' });
      })
      .catch((err: unknown) => {
        if (cancelled || containerEl === null) return;
        containerEl.replaceChildren(); // remove any partial nodes (Req 8.3)
        setStatus({ kind: 'error', reason: describeError(err) });
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- domId is stable per instance
  }, [source, isDark]);

  // Error fallback: verbatim source preserved in a code block plus a Vietnamese
  // note. The container has already been cleared so no partial diagram remains.
  if (status.kind === 'error') {
    return (
      <div>
        <p className="text-xs text-[var(--text-tertiary)] mb-1">{ERROR_NOTE}</p>
        <pre>
          <code>{source}</code>
        </pre>
      </div>
    );
  }

  // Loading shows the raw source (non-empty content while the library loads —
  // Req 10.3); rendered shows the injected SVG inside a scrollable box (Req 9.3).
  return (
    <div className="md-mermaid">
      {status.kind === 'loading' && (
        <>
          <pre>
            <code>{source}</code>
          </pre>
          <p className="text-xs text-[var(--text-tertiary)] mt-1">{LOADING_TEXT}</p>
        </>
      )}
      <div ref={containerRef} role="img" aria-label={DIAGRAM_ARIA_LABEL} />
    </div>
  );
}
