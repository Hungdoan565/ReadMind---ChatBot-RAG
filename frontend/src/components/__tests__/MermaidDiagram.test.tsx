import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import mermaid from 'mermaid';
import { MermaidDiagram } from '../MermaidDiagram';

/**
 * Component tests (example-based, Vitest + Testing Library) for MermaidDiagram.
 * Bám sát Testing Strategy của thiết kế: KHÔNG property-based — đây là render UI.
 *
 * The heavy `mermaid` library is mocked so tests are deterministic and never load
 * the real library: `render` throws when the source contains "INVALID" and
 * otherwise returns a minimal `<svg>`. This mirrors the mock contract documented
 * in the design's "Frontend — MermaidDiagram.test.tsx" section.
 *
 * Covered cases (separate test cases):
 *  - valid source renders an <svg>;
 *  - parse failure falls back to <pre><code> with verbatim source + Vietnamese
 *    note, without throwing;
 *  - dynamic-import failure falls back to the raw-source code block;
 *  - `securityLevel: 'strict'` + dark/light theme config passed to `initialize`;
 *  - no re-parse when source/isDark are unchanged across a re-render.
 *
 * Validates: Requirements 4.3, 4.6, 4.7, 8.1, 9.1, 9.2, 10.3, 10.5, 11.1, 11.2, 11.4
 */

const VALID_SOURCE = 'flowchart TD\nA-->B';
const INVALID_SOURCE = 'flowchart TD\nINVALID-->B';
const ERROR_NOTE = /Không thể hiển thị sơ đồ/;

vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn(),
  },
}));

beforeEach(() => {
  // Re-establish a clean, deterministic mock state for every test, independent of
  // the global afterEach restore. The module-level loadMermaid() singleton keeps
  // resolving to this same default object, so resetting its methods here is enough.
  vi.mocked(mermaid.initialize).mockReset();
  vi.mocked(mermaid.render).mockReset();
  vi.mocked(mermaid.render).mockImplementation(async (_id: string, src: string) => {
    if (src.includes('INVALID')) {
      throw new Error('Parse error');
    }
    return { svg: '<svg role="img"><g/></svg>', diagramType: 'flowchart' };
  });
});

describe('MermaidDiagram', () => {
  it('renders an <svg> when the Mermaid source parses successfully', async () => {
    const { container } = render(<MermaidDiagram source={VALID_SOURCE} isDark={false} />);

    await waitFor(() => {
      expect(container.querySelector('svg')).not.toBeNull();
    });

    // Once rendered, the loading/error fallbacks must be gone.
    expect(screen.queryByText(/Đang tải sơ đồ/)).toBeNull();
    expect(screen.queryByText(ERROR_NOTE)).toBeNull();
  });

  it('falls back to a verbatim code block with a Vietnamese note on parse failure', async () => {
    const { container } = render(<MermaidDiagram source={INVALID_SOURCE} isDark={false} />);

    // Vietnamese failure note is shown (Req 4.6, 8.3).
    await waitFor(() => {
      expect(screen.getByText(ERROR_NOTE)).toBeInTheDocument();
    });

    // The original source is preserved verbatim inside a <pre><code> (Req 8.3).
    const code = container.querySelector('pre code');
    expect(code?.textContent).toBe(INVALID_SOURCE);

    // No partial diagram nodes remain in the DOM (Req 8.3).
    expect(container.querySelector('svg')).toBeNull();
  });

  it('falls back to the raw-source code block when the dynamic import fails', async () => {
    // The module-level singleton has already resolved in earlier tests, so to make
    // import('mermaid') reject we need a fresh module graph with a throwing mock.
    vi.resetModules();
    vi.doMock('mermaid', () => {
      throw new Error('Failed to load mermaid chunk');
    });

    try {
      const { MermaidDiagram: FreshMermaidDiagram } = await import('../MermaidDiagram');
      const { container } = render(
        <FreshMermaidDiagram source={VALID_SOURCE} isDark={false} />,
      );

      await waitFor(() => {
        expect(screen.getByText(ERROR_NOTE)).toBeInTheDocument();
      });

      const code = container.querySelector('pre code');
      expect(code?.textContent).toBe(VALID_SOURCE);
      expect(container.querySelector('svg')).toBeNull();
    } finally {
      vi.doUnmock('mermaid');
      vi.resetModules();
    }
  });

  it("initializes Mermaid with securityLevel 'strict' and light theme config", async () => {
    render(<MermaidDiagram source={VALID_SOURCE} isDark={false} />);

    await waitFor(() => {
      expect(mermaid.initialize).toHaveBeenCalled();
    });

    expect(mermaid.initialize).toHaveBeenCalledWith(
      expect.objectContaining({
        startOnLoad: false,
        securityLevel: 'strict',
        theme: 'base',
        themeVariables: expect.objectContaining({
          background: expect.any(String),
        }),
      }),
    );
  });

  it('passes a distinct dark theme config (and strict mode) when isDark is true', async () => {
    const { unmount } = render(<MermaidDiagram source={VALID_SOURCE} isDark />);
    await waitFor(() => {
      expect(mermaid.initialize).toHaveBeenCalled();
    });
    const darkConfig = vi.mocked(mermaid.initialize).mock.calls[0][0];
    unmount();

    vi.mocked(mermaid.initialize).mockClear();

    render(<MermaidDiagram source={VALID_SOURCE} isDark={false} />);
    await waitFor(() => {
      expect(mermaid.initialize).toHaveBeenCalled();
    });
    const lightConfig = vi.mocked(mermaid.initialize).mock.calls[0][0];

    if (darkConfig === undefined || lightConfig === undefined) {
      throw new Error('initialize was called without a config object');
    }

    // Strict mode is always set (Req 8.1) and the theme config differs by theme
    // (Req 9.1, 9.2).
    expect(darkConfig).toEqual(expect.objectContaining({ securityLevel: 'strict' }));
    expect(lightConfig).toEqual(expect.objectContaining({ securityLevel: 'strict' }));
    expect(darkConfig.themeVariables).not.toEqual(lightConfig.themeVariables);
  });

  it('does not re-parse when source and isDark are unchanged across a re-render', async () => {
    const { rerender } = render(<MermaidDiagram source={VALID_SOURCE} isDark={false} />);

    await waitFor(() => {
      expect(mermaid.render).toHaveBeenCalledTimes(1);
    });

    // A parent re-render with identical props must not trigger another render
    // (Req 4.7, 7.7): the effect is keyed on [source, isDark].
    rerender(<MermaidDiagram source={VALID_SOURCE} isDark={false} />);
    await Promise.resolve();

    expect(mermaid.render).toHaveBeenCalledTimes(1);
  });
});
