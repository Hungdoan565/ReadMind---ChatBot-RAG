import { useState, useCallback } from 'react';
import { sendMessage } from '../api/chat';
import type { ChatMessage } from '../types';

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

interface UseChatReturn {
  messages: ChatMessage[];
  isLoading: boolean;
  sessionId: string | null;
  activeDocIds: string[];
  setActiveDocIds: (ids: string[]) => void;
  sendUserMessage: (content: string) => Promise<void>;
  clearMessages: () => void;
}

export function useChat(roomCode: string): UseChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [activeDocIds, setActiveDocIds] = useState<string[]>([]);

  const sendUserMessage = useCallback(async (content: string) => {
    if (!content.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      id: generateId(),
      role: 'user',
      content: content.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    try {
      const response = await sendMessage(
        content.trim(),
        roomCode,
        sessionId || undefined,
        activeDocIds.length > 0 ? activeDocIds : undefined
      );
      
      // Update session ID from first response
      if (!sessionId && response.session_id) {
        setSessionId(response.session_id);
      }

      const assistantMessage: ChatMessage = {
        id: generateId(),
        role: 'assistant',
        content: response.answer,
        sources: response.sources,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      const errorMessage: ChatMessage = {
        id: generateId(),
        role: 'assistant',
        content: error instanceof Error ? error.message : 'An unexpected error occurred. Please try again.',
        timestamp: new Date(),
        isError: true,
      };

      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, sessionId, activeDocIds, roomCode]);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setSessionId(null);
  }, []);

  return {
    messages,
    isLoading,
    sessionId,
    activeDocIds,
    setActiveDocIds,
    sendUserMessage,
    clearMessages,
  };
}
