import { render, screen } from '@testing-library/react';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { MessageBubble } from '../MessageBubble';
import { ThemeProvider } from '../ThemeProvider';
import type { ChatMessage } from '../../types';
import type { MermaidDiagramProps } from '../MermaidDiagram';

/**
 * Integration tests (example-based, Testing Library) cho lớp định tuyến markdown
 * của MessageBubble. Bám sát Testing Strategy của thiết kế: KHÔNG property-based.
 *
 * `MermaidDiagram` được mock để (a) không nạp thư viện mermaid thật và (b) cho
 * phép xác nhận số lần / thứ tự gọi component sơ đồ. Mock render một testid kèm
 * `data-source` để có thể kiểm tra nội dung và thứ tự.
 *
 * Bao phủ:
 *  - Streaming suppression: khối mermaid đã đóng + isStreaming=true KHÔNG gọi
 *    Diagram_Renderer, chỉ render text/code (Req 7.1, 7.2).
 *  - Post-stream routing: cùng nội dung với isStreaming=false gọi MermaidDiagram
 *    đúng một lần (Req 4.1, 7.3).
 *  - Incomplete fence sau abort: có fence mở `mermaid` nhưng thiếu fence đóng →
 *    render như khối mã, không phải sơ đồ (Req 7.5).
 *  - Nhiều khối: hai khối mermaid hoàn chỉnh render hai sơ đồ đúng thứ tự (Req 4.5).
 *  - Bảng GFM render thành <table> trong .md-table-wrap (Req 5.1); khối ```text
 *    render trong <pre> giữ nguyên khoảng trắng (Req 6.1).
 *
 * Validates: Requirements 4.1, 4.5, 5.1, 6.1, 7.1, 7.2, 7.3, 7.5, 11.2, 11.4
 */

// Spy chia sẻ giữa factory mock (được hoist) và các test case.
const { mermaidMock } = vi.hoisted(() => ({ mermaidMock: vi.fn() }));

// Mock MermaidDiagram: ghi nhận props và render testid nhận diện được kèm source,
// để không phụ thuộc thư viện mermaid thật và kiểm tra được số lần/thứ tự gọi.
vi.mock('../MermaidDiagram', () => ({
  MermaidDiagram: ({ source, isDark }: MermaidDiagramProps) => {
    mermaidMock({ source, isDark });
    return (
      <div data-testid="mermaid-diagram" data-source={source} data-dark={String(isDark)} />
    );
  },
}));

function makeAssistantMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'msg-1',
    role: 'assistant',
    content: '',
    timestamp: new Date('2024-01-01T08:30:00'),
    ...overrides,
  };
}

function renderBubble(message: ChatMessage) {
  return render(
    <ThemeProvider>
      <MessageBubble message={message} />
    </ThemeProvider>,
  );
}

// Một khối mermaid hoàn chỉnh (có fence mở và fence đóng khớp nhau).
const CLOSED_MERMAID = [
  '```mermaid',
  'flowchart TD',
  '  A[Bắt đầu] --> B[Kết thúc]',
  '```',
].join('\n');

describe('MessageBubble — định tuyến mermaid/bảng/ascii', () => {
  // jsdom không cài đặt matchMedia mà ThemeProvider phụ thuộc vào.
  beforeEach(() => {
    mermaidMock.mockClear();
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  it('KHÔNG gọi Diagram_Renderer khi đang streaming, chỉ render mã nguồn (Req 7.1, 7.2)', () => {
    const { container } = renderBubble(
      makeAssistantMessage({ content: CLOSED_MERMAID, isStreaming: true }),
    );

    // Diagram_Renderer không được gọi cho khối mermaid khi message còn streaming.
    expect(mermaidMock).not.toHaveBeenCalled();
    expect(screen.queryByTestId('mermaid-diagram')).toBeNull();

    // Nguồn mermaid hiển thị dưới dạng text/code (khối <pre><code>).
    expect(container.querySelector('pre')).not.toBeNull();
    expect(container.textContent).toContain('flowchart TD');
  });

  it('gọi MermaidDiagram đúng một lần khi stream đã hoàn tất (Req 4.1, 7.3)', () => {
    renderBubble(makeAssistantMessage({ content: CLOSED_MERMAID, isStreaming: false }));

    expect(mermaidMock).toHaveBeenCalledTimes(1);

    const diagram = screen.getByTestId('mermaid-diagram');
    expect(diagram).toBeInTheDocument();
    // Source truyền vào không kèm fence ``` và đã trimEnd.
    expect(diagram.getAttribute('data-source')).toContain('flowchart TD');
    expect(diagram.getAttribute('data-source')).not.toContain('```');
  });

  it('render khối mã (không phải sơ đồ) khi fence mermaid chưa đóng sau abort (Req 7.5)', () => {
    // isStreaming=false nhưng chỉ có fence mở, thiếu fence đóng (bị abort giữa chừng).
    const incompleteMermaid = [
      '```mermaid',
      'flowchart TD',
      '  A --> B',
    ].join('\n');

    const { container } = renderBubble(
      makeAssistantMessage({ content: incompleteMermaid, isStreaming: false }),
    );

    // Fence chưa hoàn chỉnh → không định tuyến sang Diagram_Renderer.
    expect(mermaidMock).not.toHaveBeenCalled();
    expect(screen.queryByTestId('mermaid-diagram')).toBeNull();

    // Hiển thị như khối mã chứa nguồn gốc.
    expect(container.querySelector('pre')).not.toBeNull();
    expect(container.textContent).toContain('flowchart TD');
  });

  it('render hai khối mermaid hoàn chỉnh thành hai sơ đồ đúng thứ tự (Req 4.5)', () => {
    const twoMermaid = [
      '```mermaid',
      'flowchart TD',
      '  A --> B',
      '```',
      '',
      '```mermaid',
      'sequenceDiagram',
      '  X->>Y: xin chào',
      '```',
    ].join('\n');

    renderBubble(makeAssistantMessage({ content: twoMermaid, isStreaming: false }));

    expect(mermaidMock).toHaveBeenCalledTimes(2);

    const diagrams = screen.getAllByTestId('mermaid-diagram');
    expect(diagrams).toHaveLength(2);
    // Thứ tự DOM phải khớp thứ tự xuất hiện trong message.
    expect(diagrams[0].getAttribute('data-source')).toContain('flowchart TD');
    expect(diagrams[1].getAttribute('data-source')).toContain('sequenceDiagram');
  });

  it('render bảng GFM thành <table> bên trong .md-table-wrap (Req 5.1)', () => {
    const tableMd = [
      '| Tên | Giá |',
      '| --- | --- |',
      '| Táo | 1 |',
      '| Lê | 2 |',
    ].join('\n');

    const { container } = renderBubble(
      makeAssistantMessage({ content: tableMd, isStreaming: false }),
    );

    const wrap = container.querySelector('.md-table-wrap');
    expect(wrap).not.toBeNull();

    const table = wrap?.querySelector('table');
    expect(table).not.toBeNull();
    // Có hàng tiêu đề riêng biệt và nội dung các ô.
    expect(table?.querySelector('thead')).not.toBeNull();
    expect(table?.textContent).toContain('Tên');
    expect(table?.textContent).toContain('Táo');
  });

  it('render khối ```text trong <pre> và giữ nguyên khoảng trắng (Req 6.1)', () => {
    const asciiText = [
      '```text',
      'root',
      '├── nhánh-a',
      '    thụt lề bốn dấu cách',
      '└── nhánh-b',
      '```',
    ].join('\n');

    const { container } = renderBubble(
      makeAssistantMessage({ content: asciiText, isStreaming: false }),
    );

    // Không định tuyến sang sơ đồ cho khối text.
    expect(mermaidMock).not.toHaveBeenCalled();

    const pre = container.querySelector('pre');
    expect(pre).not.toBeNull();
    // Khoảng trắng đầu dòng và ký tự cây fixed-width được giữ nguyên.
    expect(pre?.textContent).toContain('├── nhánh-a');
    expect(pre?.textContent).toContain('    thụt lề bốn dấu cách');
  });
});
