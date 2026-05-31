import apiClient from './client';
import type { IngestResponse, UploadProgress, DocumentsResponse } from '../types';

export async function uploadFile(
  file: File,
  roomCode: string,
  onProgress?: (progress: UploadProgress) => void
): Promise<IngestResponse> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('room_code', roomCode);

  const response = await apiClient.post<IngestResponse>('/api/ingest', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
    onUploadProgress: (progressEvent) => {
      if (onProgress && progressEvent.total) {
        const loaded = progressEvent.loaded;
        const total = progressEvent.total;
        const percentage = Math.round((loaded * 100) / total);
        onProgress({ loaded, total, percentage });
      }
    },
  });

  return response.data;
}

export async function ingestUrl(url: string, roomCode: string): Promise<IngestResponse> {
  const response = await apiClient.post<IngestResponse>('/api/ingest/url', { url, room_code: roomCode });
  return response.data;
}

export async function ingestNotionPage(pageId: string, roomCode: string): Promise<IngestResponse> {
  const response = await apiClient.post<IngestResponse>('/api/ingest/notion', { page_id: pageId, room_code: roomCode });
  return response.data;
}

export async function ingestNotionDatabase(databaseId: string, roomCode: string): Promise<IngestResponse> {
  const response = await apiClient.post<IngestResponse>('/api/ingest/notion/db', { database_id: databaseId, room_code: roomCode });
  return response.data;
}

export async function deleteDocument(docId: string, roomCode: string): Promise<void> {
  await apiClient.delete(`/api/ingest/${docId}?room_code=${encodeURIComponent(roomCode)}`);
}

export async function getDocuments(roomCode: string): Promise<DocumentsResponse> {
  const response = await apiClient.get<DocumentsResponse>(`/api/documents?room_code=${encodeURIComponent(roomCode)}`);
  return response.data;
}
