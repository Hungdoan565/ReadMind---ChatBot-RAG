import apiClient from './client';
import type { ChatRequest, ChatResponse } from '../types';

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
    ...(activeDocIds && activeDocIds.length > 0 && { active_doc_ids: activeDocIds }),
  };

  const response = await apiClient.post<ChatResponse>('/api/chat', payload);
  return response.data;
}