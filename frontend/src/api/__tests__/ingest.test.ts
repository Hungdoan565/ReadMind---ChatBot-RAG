import { beforeEach, describe, expect, it, vi } from 'vitest';
import apiClient from '../client';
import { uploadFile, deleteDocument, getDocuments, ingestUrl } from '../ingest';

vi.mock('../client', () => ({
  default: {
    post: vi.fn(),
    delete: vi.fn(),
    get: vi.fn(),
  },
}));

describe('ingest api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uploadFile sends FormData with file and room_code', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({
      data: { doc_id: 'doc-1', source: 'report.pdf', chunk_count: 3, status: 'success', message: 'ok' },
    });

    const file = new File(['hello'], 'report.pdf', { type: 'application/pdf' });
    const response = await uploadFile(file, 'ROOM-1');

    expect(response.doc_id).toBe('doc-1');
    const [url, formData] = vi.mocked(apiClient.post).mock.calls[0];
    expect(url).toBe('/api/ingest');
    expect(formData).toBeInstanceOf(FormData);
    expect((formData as FormData).get('room_code')).toBe('ROOM-1');
    expect((((formData as FormData).get('file')) as File).name).toBe('report.pdf');
  });

  it('uploadFile throws on server error', async () => {
    vi.mocked(apiClient.post).mockRejectedValue(new Error('Upload failed'));

    await expect(uploadFile(new File(['x'], 'bad.pdf'), 'ROOM-2')).rejects.toThrow('Upload failed');
  });

  it('deleteDocument sends delete request with room query', async () => {
    vi.mocked(apiClient.delete).mockResolvedValue({ data: {} });

    await deleteDocument('doc-9', 'ROOM 9');

    expect(apiClient.delete).toHaveBeenCalledWith('/api/ingest/doc-9?room_code=ROOM%209');
  });

  it('getDocuments fetches room-scoped documents', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: { documents: [], total: 0 } });

    const data = await getDocuments('ROOM-A');

    expect(apiClient.get).toHaveBeenCalledWith('/api/documents?room_code=ROOM-A');
    expect(data).toEqual({ documents: [], total: 0 });
  });

  it('ingestUrl posts url payload', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({
      data: { doc_id: 'url-1', source: 'https://example.com', chunk_count: 2, status: 'success', message: 'ok' },
    });

    const data = await ingestUrl('https://example.com', 'ROOM-U');

    expect(apiClient.post).toHaveBeenCalledWith('/api/ingest/url', {
      url: 'https://example.com',
      room_code: 'ROOM-U',
    });
    expect(data.doc_id).toBe('url-1');
  });
});
