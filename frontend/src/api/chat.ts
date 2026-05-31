import apiClient from './client';
import type { ChatRequest, ChatResponse, ChatStreamEvent } from '../types';

// Same-origin in both dev and prod: in dev the Vite `/api` proxy forwards to
// the backend (so requests stay on :5173), and in prod nginx proxies /api/*.
// A relative base URL keeps the httpOnly `readmind_auth` cookie same-origin so
// it can be set and sent. An explicit VITE_API_URL still overrides if provided.
const API_URL = import.meta.env.VITE_API_URL || '';

/**
 * Send a message and get a complete response (non-streaming fallback).
 */
export async function sendMessage(
  question: string,
  roomCode: string,
  sessionId?: string,
  activeDocIds?: string[]
): Promise<ChatResponse> {
  const payload: ChatRequest = {
    question,
    room_code: roomCode,
    ...(sessionId && { session_id: sessionId }),
    // Pass the selection through as-is when it is an array — including an empty
    // array, which explicitly means "đừng đọc tài liệu nào" (general AI answer).
    ...(activeDocIds !== undefined && { active_doc_ids: activeDocIds }),
  };

  const response = await apiClient.post<ChatResponse>('/api/chat', payload);
  return response.data;
}

/**
 * Send a message and stream the response via SSE.
 * Yields ChatStreamEvent objects as they arrive.
 */
export async function* streamMessage(
  question: string,
  roomCode: string,
  sessionId?: string,
  activeDocIds?: string[],
  signal?: AbortSignal
): AsyncGenerator<ChatStreamEvent> {
  const payload: ChatRequest = {
    question,
    room_code: roomCode,
    ...(sessionId && { session_id: sessionId }),
    // Pass the selection through as-is when it is an array — including an empty
    // array, which explicitly means "đừng đọc tài liệu nào" (general AI answer).
    ...(activeDocIds !== undefined && { active_doc_ids: activeDocIds }),
  };

  const response = await fetch(`${API_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    credentials: 'include',
    signal,
  });

  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const errorBody = await response.json();
      detail = errorBody.detail || detail;
    } catch {
      // ignore parse error
    }
    yield { event: 'error', data: detail } as ChatStreamEvent;
    return;
  }

  const reader = response.body?.getReader();
  if (!reader) {
    yield { event: 'error', data: 'No response body' } as ChatStreamEvent;
    return;
  }

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Split on double newline (SSE event boundary)
      const parts = buffer.split('\n\n');
      // Keep the last incomplete part in buffer
      buffer = parts.pop() || '';

      for (const part of parts) {
        const trimmed = part.trim();
        if (!trimmed) continue;

        // Extract data from SSE line: "data: {...}"
        const dataPrefix = 'data: ';
        const dataLine = trimmed
          .split('\n')
          .find((line) => line.startsWith(dataPrefix));

        if (!dataLine) continue;

        const jsonStr = dataLine.slice(dataPrefix.length);
        try {
          const event = JSON.parse(jsonStr) as ChatStreamEvent;
          yield event;
        } catch {
          // Skip malformed JSON
        }
      }
    }

    // Process any remaining buffer
    if (buffer.trim()) {
      const dataPrefix = 'data: ';
      const dataLine = buffer
        .trim()
        .split('\n')
        .find((line) => line.startsWith(dataPrefix));

      if (dataLine) {
        const jsonStr = dataLine.slice(dataPrefix.length);
        try {
          const event = JSON.parse(jsonStr) as ChatStreamEvent;
          yield event;
        } catch {
          // Skip malformed JSON
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
