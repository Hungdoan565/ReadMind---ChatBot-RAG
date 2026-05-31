import { useState, useCallback, useRef, useEffect } from 'react';
import { streamMessage } from '../api/chat';
import { loadTranscript, saveTranscript } from '../lib/conversationStore';
import type { ChatMessage } from '../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// ---------------------------------------------------------------------------
// Hook interface
// ---------------------------------------------------------------------------

interface UseChatReturn {
  messages: ChatMessage[];
  isLoading: boolean;
  sessionId: string | null;
  sendUserMessage: (content: string) => Promise<void>;
  stopGeneration: () => void;
  regenerateLastAnswer: () => Promise<void>;
}

export function useChat(
  roomCode: string,
  conversationId: string | null,
  activeDocIds: string[],
): UseChatReturn {
  // Hydrate from storage on mount / room or conversation change. When there is no
  // active conversation (conversationId === null) we render an empty transcript.
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    if (!roomCode || !conversationId) return [];
    return loadTranscript(roomCode, conversationId).messages;
  });
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(() => {
    if (!roomCode || !conversationId) return null;
    return loadTranscript(roomCode, conversationId).sessionId;
  });

  // AbortController ref for the active stream
  const abortControllerRef = useRef<AbortController | null>(null);

  // When roomCode or conversationId changes, load that conversation's transcript.
  // With no active conversation, render empty (treat like the current empty case).
  useEffect(() => {
    if (!roomCode || !conversationId) {
      setMessages([]);
      setSessionId(null);
      return;
    }
    const stored = loadTranscript(roomCode, conversationId);
    setMessages(stored.messages);
    setSessionId(stored.sessionId);
  }, [roomCode, conversationId]);

  // Persist to localStorage whenever messages/sessionId settle (not mid-stream, not empty state)
  const isStreamingRef = useRef(false);
  useEffect(() => {
    if (isStreamingRef.current) return; // skip per-token writes
    if (!roomCode || !conversationId) return; // nothing to persist without an active conversation
    // Don't re-write storage when there's nothing to persist (e.g. empty conversation)
    if (messages.length === 0 && sessionId === null) return;
    saveTranscript(roomCode, conversationId, messages, sessionId);
  }, [messages, sessionId, roomCode, conversationId]);

  // ---------------------------------------------------------------------------
  // sendUserMessage (core streaming logic)
  // ---------------------------------------------------------------------------

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
    isStreamingRef.current = true;

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const assistantId = generateId();
    const timestamp = new Date();
    let accumulatedContent = '';
    let wasAborted = false;

    try {
      for await (const event of streamMessage(
        content.trim(),
        roomCode,
        sessionId || undefined,
        activeDocIds,
        controller.signal
      )) {
        switch (event.event) {
          case 'start':
            if (event.session_id) {
              setSessionId(event.session_id);
            }
            break;

          case 'token':
            accumulatedContent += event.data;
            setMessages((prev) => {
              const existing = prev.find((m) => m.id === assistantId);
              if (existing) {
                return prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, content: accumulatedContent, isStreaming: true }
                    : m
                );
              } else {
                return [
                  ...prev,
                  {
                    id: assistantId,
                    role: 'assistant' as const,
                    content: accumulatedContent,
                    timestamp,
                    isStreaming: true,
                  },
                ];
              }
            });
            break;

          case 'end':
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? { ...m, sources: event.sources, isStreaming: false }
                  : m
              )
            );
            break;

          case 'error':
            setMessages((prev) => {
              const existing = prev.find((m) => m.id === assistantId);
              if (existing) {
                return prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, isStreaming: false, isError: true, content: event.data }
                    : m
                );
              }
              return [
                ...prev,
                {
                  id: assistantId,
                  role: 'assistant' as const,
                  content: event.data,
                  timestamp,
                  isError: true,
                },
              ];
            });
            break;
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        // User stopped generation — finalize partial content as non-error
        wasAborted = true;
        setMessages((prev) => {
          const existing = prev.find((m) => m.id === assistantId);
          if (existing) {
            return prev.map((m) =>
              m.id === assistantId
                ? { ...m, isStreaming: false, isError: false }
                : m
            );
          }
          // No partial content yet — nothing to add
          return prev;
        });
      } else {
        const errorContent =
          error instanceof Error
            ? error.message
            : 'An unexpected error occurred. Please try again.';
        setMessages((prev) => {
          const existing = prev.find((m) => m.id === assistantId);
          if (existing) {
            return prev.map((m) =>
              m.id === assistantId
                ? { ...m, isStreaming: false, isError: true, content: errorContent }
                : m
            );
          }
          return [
            ...prev,
            {
              id: assistantId,
              role: 'assistant' as const,
              content: errorContent,
              timestamp,
              isError: true,
            },
          ];
        });
      }
    } finally {
      abortControllerRef.current = null;
      isStreamingRef.current = false;
      setIsLoading(false);
      // Persist after stream settles (wasAborted is captured in closure)
      void wasAborted; // suppress unused warning — persistence handled by effect
    }
  }, [isLoading, sessionId, activeDocIds, roomCode]);

  // ---------------------------------------------------------------------------
  // stopGeneration
  // ---------------------------------------------------------------------------

  const stopGeneration = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  // ---------------------------------------------------------------------------
  // regenerateLastAnswer
  // ---------------------------------------------------------------------------

  const regenerateLastAnswer = useCallback(async () => {
    if (isLoading) return;

    // Find the last assistant message and the nearest preceding user message
    const lastAssistantIdx = [...messages].reverse().findIndex((m) => m.role === 'assistant');
    if (lastAssistantIdx === -1) return;
    const assistantIdx = messages.length - 1 - lastAssistantIdx;

    // Find the user message just before it
    let userIdx = assistantIdx - 1;
    while (userIdx >= 0 && messages[userIdx].role !== 'user') {
      userIdx--;
    }
    if (userIdx < 0) return;

    const userQuestion = messages[userIdx].content;

    // Remove the old assistant answer (keep everything up to and including the user message)
    const trimmed = messages.slice(0, assistantIdx);
    setMessages(trimmed);

    // Re-send the question reusing the existing sessionId
    await sendUserMessage(userQuestion);
  }, [isLoading, messages, sendUserMessage]);

  return {
    messages,
    isLoading,
    sessionId,
    sendUserMessage,
    stopGeneration,
    regenerateLastAnswer,
  };
}
