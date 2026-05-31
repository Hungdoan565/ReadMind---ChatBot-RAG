import { useState, useCallback, useRef, useEffect } from 'react';
import { streamMessage } from '../api/chat';
import type { ChatMessage } from '../types';

// ---------------------------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------------------------

const CHAT_STORAGE_PREFIX = 'readmind_chat:';

interface PersistedChat {
  messages: Array<Omit<ChatMessage, 'timestamp'> & { timestamp: string }>;
  sessionId: string | null;
}

function storageKey(roomCode: string): string {
  return `${CHAT_STORAGE_PREFIX}${roomCode}`;
}

function saveChat(roomCode: string, messages: ChatMessage[], sessionId: string | null): void {
  if (!roomCode) return;
  try {
    const data: PersistedChat = {
      messages: messages.map(({ isStreaming: _s, ...m }) => ({
        ...m,
        timestamp: m.timestamp.toISOString(),
      })),
      sessionId,
    };
    localStorage.setItem(storageKey(roomCode), JSON.stringify(data));
  } catch {
    // Storage quota or serialization error — silently ignore
  }
}

function loadChat(roomCode: string): { messages: ChatMessage[]; sessionId: string | null } {
  if (!roomCode) return { messages: [], sessionId: null };
  try {
    const raw = localStorage.getItem(storageKey(roomCode));
    if (!raw) return { messages: [], sessionId: null };
    const data = JSON.parse(raw) as PersistedChat;
    const messages: ChatMessage[] = (data.messages ?? []).map((m) => ({
      ...m,
      timestamp: new Date(m.timestamp),
    }));
    return { messages, sessionId: data.sessionId ?? null };
  } catch {
    return { messages: [], sessionId: null };
  }
}

function removeChat(roomCode: string): void {
  if (!roomCode) return;
  try {
    localStorage.removeItem(storageKey(roomCode));
  } catch {
    // ignore
  }
}

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
  activeDocIds: string[];
  setActiveDocIds: (ids: string[]) => void;
  sendUserMessage: (content: string) => Promise<void>;
  clearMessages: () => void;
  stopGeneration: () => void;
  regenerateLastAnswer: () => Promise<void>;
}

export function useChat(roomCode: string): UseChatReturn {
  // Hydrate from storage on mount / room change
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    if (!roomCode) return [];
    return loadChat(roomCode).messages;
  });
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(() => {
    if (!roomCode) return null;
    return loadChat(roomCode).sessionId;
  });
  const [activeDocIds, setActiveDocIds] = useState<string[]>([]);

  // AbortController ref for the active stream
  const abortControllerRef = useRef<AbortController | null>(null);

  // When roomCode changes, load that room's transcript
  useEffect(() => {
    if (!roomCode) return;
    const stored = loadChat(roomCode);
    setMessages(stored.messages);
    setSessionId(stored.sessionId);
  }, [roomCode]);

  // Persist to localStorage whenever messages/sessionId settle (not mid-stream, not empty state)
  const isStreamingRef = useRef(false);
  useEffect(() => {
    if (isStreamingRef.current) return; // skip per-token writes
    if (!roomCode) return;
    // Don't re-write storage when there's nothing to persist (e.g. after clearMessages)
    if (messages.length === 0 && sessionId === null) return;
    saveChat(roomCode, messages, sessionId);
  }, [messages, sessionId, roomCode]);

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
  // clearMessages
  // ---------------------------------------------------------------------------

  const clearMessages = useCallback(() => {
    setMessages([]);
    setSessionId(null);
    removeChat(roomCode);
  }, [roomCode]);

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
    activeDocIds,
    setActiveDocIds,
    sendUserMessage,
    clearMessages,
    stopGeneration,
    regenerateLastAnswer,
  };
}
