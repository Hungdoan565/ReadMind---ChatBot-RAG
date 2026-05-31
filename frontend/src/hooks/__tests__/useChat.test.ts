import { renderHook, act, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { useChat } from '../useChat';
import { streamMessage } from '../../api/chat';

vi.mock('../../api/chat', () => ({
  streamMessage: vi.fn(),
}));

const mockStreamMessage = vi.mocked(streamMessage);

async function* makeStream(events: Array<Record<string, unknown>>) {
  for (const event of events) {
    yield event as never;
  }
}

describe('useChat', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('initializes with empty state', () => {
    const { result } = renderHook(() => useChat('ROOM-1234', 'conv-1', []));

    expect(result.current.messages).toEqual([]);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.sessionId).toBeNull();
  });

  it('streams a response and stores session id and sources', async () => {
    mockStreamMessage.mockImplementation(() =>
      makeStream([
        { event: 'start', session_id: 'session-1' },
        { event: 'token', data: 'Hello' },
        { event: 'token', data: ' world' },
        { event: 'end', session_id: 'session-1', sources: [{ source: 'doc.pdf', content_preview: 'chunk' }] },
      ]) as AsyncGenerator<never>,
    );

    const { result } = renderHook(() => useChat('ROOM-1234', 'conv-1', []));

    await act(async () => {
      await result.current.sendUserMessage('Hi');
    });

    // No documents selected → an explicit empty array is sent (means "đừng đọc
    // tài liệu nào" → general AI answer), distinct from undefined.
    expect(mockStreamMessage).toHaveBeenCalledWith('Hi', 'ROOM-1234', undefined, [], expect.any(AbortSignal));
    expect(result.current.sessionId).toBe('session-1');
    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[0]).toMatchObject({ role: 'user', content: 'Hi' });
    expect(result.current.messages[1]).toMatchObject({
      role: 'assistant',
      content: 'Hello world',
      isStreaming: false,
      sources: [{ source: 'doc.pdf', content_preview: 'chunk' }],
    });
  });

  it('passes the active document ids parameter to the API call', async () => {
    mockStreamMessage.mockImplementation(() =>
      makeStream([{ event: 'end', session_id: 'session-2', sources: [] }]) as AsyncGenerator<never>,
    );

    // activeDocIds is now an input parameter (owned by useDocumentSelection),
    // not internal state.
    const { result } = renderHook(() => useChat('ROOM-2222', 'conv-1', ['doc-1', 'doc-2']));

    await act(async () => {
      await result.current.sendUserMessage('Filter');
    });

    expect(mockStreamMessage).toHaveBeenCalledWith('Filter', 'ROOM-2222', undefined, ['doc-1', 'doc-2'], expect.any(AbortSignal));
  });

  it('handles stream error events', async () => {
    mockStreamMessage.mockImplementation(() =>
      makeStream([{ event: 'error', data: 'Backend failed' }]) as AsyncGenerator<never>,
    );

    const { result } = renderHook(() => useChat('ROOM-3333', 'conv-1', []));

    await act(async () => {
      await result.current.sendUserMessage('Oops');
    });

    expect(result.current.messages[1]).toMatchObject({
      role: 'assistant',
      content: 'Backend failed',
      isError: true,
    });
  });

  it('shows an empty transcript when switching to a fresh conversation', async () => {
    mockStreamMessage.mockImplementation(() =>
      makeStream([{ event: 'start', session_id: 'session-clear' }, { event: 'end', session_id: 'session-clear', sources: [] }]) as AsyncGenerator<never>,
    );

    const { result, rerender } = renderHook(
      ({ conv }) => useChat('ROOM-4444', conv, []),
      { initialProps: { conv: 'conv-full' } },
    );

    await act(async () => {
      await result.current.sendUserMessage('Fill this conversation');
    });

    expect(result.current.messages.length).toBeGreaterThan(0);

    // Switching the active conversation to a brand-new (unstored) one loads an
    // empty transcript — the replacement for the old clearMessages behavior.
    rerender({ conv: 'conv-empty' });

    await waitFor(() => {
      expect(result.current.messages).toEqual([]);
      expect(result.current.sessionId).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // Persistence tests
  // ---------------------------------------------------------------------------

  it('persists messages to the conversation transcript key after a stream completes', async () => {
    mockStreamMessage.mockImplementation(() =>
      makeStream([
        { event: 'start', session_id: 'sess-persist' },
        { event: 'token', data: 'Persisted' },
        { event: 'end', session_id: 'sess-persist', sources: [] },
      ]) as AsyncGenerator<never>,
    );

    const { result } = renderHook(() => useChat('ROOM-PERSIST', 'conv-persist', []));

    await act(async () => {
      await result.current.sendUserMessage('Save me');
    });

    // Persistence now targets the per-conversation key readmind_chat:{room}:{convId}.
    const raw = localStorage.getItem('readmind_chat:ROOM-PERSIST:conv-persist');
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.sessionId).toBe('sess-persist');
    expect(parsed.messages).toHaveLength(2);
    expect(parsed.messages[1].content).toBe('Persisted');
    // isStreaming must be stripped on save
    expect(parsed.messages[1].isStreaming).toBeUndefined();
  });

  it('revives timestamp as a Date on load', () => {
    // Pre-populate the conversation transcript key
    const stored = {
      sessionId: 'sess-revive',
      messages: [
        { id: 'msg-1', role: 'user', content: 'Hello', timestamp: '2024-01-15T10:00:00.000Z' },
        { id: 'msg-2', role: 'assistant', content: 'Hi there', timestamp: '2024-01-15T10:00:01.000Z' },
      ],
    };
    localStorage.setItem('readmind_chat:ROOM-REVIVE:conv-revive', JSON.stringify(stored));

    const { result } = renderHook(() => useChat('ROOM-REVIVE', 'conv-revive', []));

    // Messages should be hydrated immediately
    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[0].timestamp).toBeInstanceOf(Date);
    expect(result.current.messages[1].timestamp).toBeInstanceOf(Date);
    expect(result.current.sessionId).toBe('sess-revive');
  });

  it('isolates storage per conversation — switching the active conversation loads its transcript', async () => {
    // Pre-populate two conversations in the same room
    const convA = {
      sessionId: 'sess-a',
      messages: [{ id: 'a1', role: 'user', content: 'Conversation A message', timestamp: new Date().toISOString() }],
    };
    const convB = {
      sessionId: 'sess-b',
      messages: [{ id: 'b1', role: 'user', content: 'Conversation B message', timestamp: new Date().toISOString() }],
    };
    localStorage.setItem('readmind_chat:ROOM-ISO:conv-a', JSON.stringify(convA));
    localStorage.setItem('readmind_chat:ROOM-ISO:conv-b', JSON.stringify(convB));

    // Mount with conv-a
    const { result, rerender } = renderHook(({ conv }) => useChat('ROOM-ISO', conv, []), {
      initialProps: { conv: 'conv-a' },
    });

    expect(result.current.messages[0].content).toBe('Conversation A message');
    expect(result.current.sessionId).toBe('sess-a');

    // Switch to conv-b
    rerender({ conv: 'conv-b' });

    await waitFor(() => {
      expect(result.current.messages[0].content).toBe('Conversation B message');
      expect(result.current.sessionId).toBe('sess-b');
    });
  });

  it('renders an empty transcript when there is no active conversation', () => {
    localStorage.setItem(
      'readmind_chat:ROOM-NULL:conv-x',
      JSON.stringify({ sessionId: 'sess-x', messages: [{ id: 'x1', role: 'user', content: 'hi', timestamp: new Date().toISOString() }] }),
    );

    // A null conversationId is treated like the empty case: render nothing.
    const { result } = renderHook(() => useChat('ROOM-NULL', null, []));

    expect(result.current.messages).toEqual([]);
    expect(result.current.sessionId).toBeNull();
  });

  it('tolerates malformed storage and starts empty', () => {
    localStorage.setItem('readmind_chat:ROOM-BAD:conv-bad', 'not valid json {{{{');

    const { result } = renderHook(() => useChat('ROOM-BAD', 'conv-bad', []));

    expect(result.current.messages).toEqual([]);
    expect(result.current.sessionId).toBeNull();
  });
});
