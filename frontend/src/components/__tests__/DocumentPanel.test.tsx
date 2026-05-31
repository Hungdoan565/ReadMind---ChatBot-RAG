import { render, screen, fireEvent } from '@testing-library/react';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { DocumentPanel } from '../DocumentPanel';
import { getDocuments } from '../../api/ingest';
import type { StoredDocument } from '../../types';

/**
 * Component test (example-based, Testing Library) cho DocumentPanel.
 * Bám sát Testing Strategy của thiết kế: KHÔNG property-based.
 * Xác minh:
 *  - Panel kết hợp các control ingest (upload/url/notion) và vùng danh sách
 *    tài liệu (Requirement 3.1).
 *  - Nút "Lưu phòng này" (claim-room) chỉ hiển thị khi đã đăng nhập.
 *  - Chọn/bỏ chọn một tài liệu sẽ gọi onActiveDocsChange (Requirements 3.4, 3.5).
 *
 * Validates: Requirements 3.1, 3.4, 3.5
 */

// Mock the document API module. getDocuments resolves to a small list and
// deleteDocument is a no-op; the ingest helpers are stubbed since the
// relocated FileUpload/UrlIngest/NotionIngest import from this same module.
vi.mock('../../api/ingest', () => ({
  getDocuments: vi.fn(),
  deleteDocument: vi.fn().mockResolvedValue(undefined),
  uploadFile: vi.fn(),
  ingestUrl: vi.fn(),
  ingestNotionPage: vi.fn(),
  ingestNotionDatabase: vi.fn(),
}));

const mockDocuments: StoredDocument[] = [
  { doc_id: 'doc-1', source: 'intro.pdf', chunk_count: 3 },
  { doc_id: 'doc-2', source: 'guide.txt', chunk_count: 5 },
];

describe('DocumentPanel', () => {
  beforeEach(() => {
    // jsdom does not implement matchMedia, which framer-motion (used by
    // DocumentCard) relies on. Stub mirrors MessageBubble.test.tsx.
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

    vi.mocked(getDocuments).mockResolvedValue({
      documents: mockDocuments,
      total: mockDocuments.length,
    });
  });

  it('kết hợp các control ingest và render danh sách tài liệu đã mock', async () => {
    render(
      <DocumentPanel
        roomCode="room-1"
        isAuthenticated
        activeDocIds={[]}
        onActiveDocsChange={vi.fn()}
        onAskAboutDoc={vi.fn()}
      />,
    );

    // Upload / URL / Notion controls are present.
    expect(screen.getByText('Tải tài liệu lên')).toBeInTheDocument();
    expect(screen.getByText('Thêm từ URL')).toBeInTheDocument();
    expect(screen.getByText('Thêm từ Notion')).toBeInTheDocument();

    // The document list region renders the mocked documents once getDocuments resolves.
    expect(await screen.findByText('intro.pdf')).toBeInTheDocument();
    expect(screen.getByText('guide.txt')).toBeInTheDocument();
  });

  it('hiển thị nút "Lưu phòng này" khi đã đăng nhập', async () => {
    render(
      <DocumentPanel
        roomCode="room-1"
        isAuthenticated
        activeDocIds={['doc-1', 'doc-2']}
        onActiveDocsChange={vi.fn()}
        onAskAboutDoc={vi.fn()}
      />,
    );

    expect(screen.getByText('Lưu phòng này')).toBeInTheDocument();
    // Let the async document list settle to avoid act() warnings.
    await screen.findByText('intro.pdf');
  });

  it('ẩn nút "Lưu phòng này" khi chưa đăng nhập', async () => {
    render(
      <DocumentPanel
        roomCode="room-1"
        isAuthenticated={false}
        activeDocIds={['doc-1', 'doc-2']}
        onActiveDocsChange={vi.fn()}
        onAskAboutDoc={vi.fn()}
      />,
    );

    expect(screen.queryByText('Lưu phòng này')).toBeNull();
    // Ingest controls still render regardless of auth state.
    expect(screen.getByText('Tải tài liệu lên')).toBeInTheDocument();
    // Let the async document list settle to avoid act() warnings.
    await screen.findByText('intro.pdf');
  });

  it('bỏ chọn một tài liệu sẽ gọi onActiveDocsChange với lựa chọn còn lại', async () => {
    const onActiveDocsChange = vi.fn();
    render(
      <DocumentPanel
        roomCode="room-1"
        isAuthenticated
        // Both docs already selected so the list does not auto-select on first load;
        // this isolates the user-driven toggle.
        activeDocIds={['doc-1', 'doc-2']}
        onActiveDocsChange={onActiveDocsChange}
        onAskAboutDoc={vi.fn()}
      />,
    );

    // Wait for the mocked documents to render, then toggle one off by clicking its card.
    const card = await screen.findByText('intro.pdf');
    fireEvent.click(card);

    expect(onActiveDocsChange).toHaveBeenCalledWith(['doc-2']);
  });
});
