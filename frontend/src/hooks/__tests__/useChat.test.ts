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
    const { result } = renderHook(() => useChat('ROOM-1234'));

    expect(result.current.messages).toEqual([]);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.sessionId).toBeNull();
    expect(result.current.activeDocIds).toEqual([]);
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

    const { result } = renderHook(() => useChat('ROOM-1234'));

    await act(async () => {
      await result.current.sendUserMessage('Hi');
    });

    expect(mockStreamMessage).toHaveBeenCalledWith('Hi', 'ROOM-1234', undefined, undefined, expect.any(AbortSignal));
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

  it('passes active document ids to the API call', async () => {
    mockStreamMessage.mockImplementation(() =>
      makeStream([{ event: 'end', session_id: 'session-2', sources: [] }]) as AsyncGenerator<never>,
    );

    const { result } = renderHook(() => useChat('ROOM-2222'));

    act(() => {
      result.current.setActiveDocIds(['doc-1', 'doc-2']);
    });

    await act(async () => {
      await result.current.sendUserMessage('Filter');
    });

    expect(mockStreamMessage).toHaveBeenCalledWith('Filter', 'ROOM-2222', undefined, ['doc-1', 'doc-2'], expect.any(AbortSignal));
  });

  it('handles stream error events', async () => {
    mockStreamMessage.mockImplementation(() =>
      makeStream([{ event: 'error', data: 'Backend failed' }]) as AsyncGenerator<never>,
    );

    const { result } = renderHook(() => useChat('ROOM-3333'));

    await act(async () => {
      await result.current.sendUserMessage('Oops');
    });

    expect(result.current.messages[1]).toMatchObject({
      role: 'assistant',
      content: 'Backend failed',
      isError: true,
    });
  });

  it('resets messages and session when cleared', async () => {
    mockStreamMessage.mockImplementation(() =>
      makeStream([{ event: 'start', session_id: 'session-clear' }, { event: 'end', session_id: 'session-clear', sources: [] }]) as AsyncGenerator<never>,
    );

    const { result } = renderHook(() => useChat('ROOM-4444'));

    await act(async () => {
      await result.current.sendUserMessage('Clear me');
    });

    act(() => {
      result.current.clearMessages();
    });

    await waitFor(() => {
      expect(result.current.messages).toEqual([]);
      expect(result.current.sessionId).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // Persistence tests
  // ---------------------------------------------------------------------------

  it('persists messages to localStorage after a stream completes', async () => {
    mockStreamMessage.mockImplementation(() =>
      makeStream([
        { event: 'start', session_id: 'sess-persist' },
        { event: 'token', data: 'Persisted' },
        { event: 'end', session_id: 'sess-persist', sources: [] },
      ]) as AsyncGenerator<never>,
    );

    const { result } = renderHook(() => useChat('ROOM-PERSIST'));

    await act(async () => {
      await result.current.sendUserMessage('Save me');
    });

    const raw = localStorage.getItem('readmind_chat:ROOM-PERSIST');
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.sessionId).toBe('sess-persist');
    expect(parsed.messages).toHaveLength(2);
    expect(parsed.messages[1].content).toBe('Persisted');
    // isStreaming must be stripped on save
    expect(parsed.messages[1].isStreaming).toBeUndefined();
  });

  it('revives timestamp as a Date on load', async () => {
    // Pre-populate storage
    const stored = {
      sessionId: 'sess-revive',
      messages: [
        { id: 'msg-1', role: 'user', content: 'Hello', timestamp: '2024-01-15T10:00:00.000Z' },
        { id: 'msg-2', role: 'assistant', content: 'Hi there', timestamp: '2024-01-15T10:00:01.000Z' },
      ],
    };
    localStorage.setItem('readmind_chat:ROOM-REVIVE', JSON.stringify(stored));

    const { result } = renderHook(() => useChat('ROOM-REVIVE'));

    // Messages should be hydrated immediately
    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[0].timestamp).toBeInstanceOf(Date);
    expect(result.current.messages[1].timestamp).toBeInstanceOf(Date);
    expect(result.current.sessionId).toBe('sess-revive');
  });

  it('isolates storage per room — switching rooms loads that room transcript', async () => {
    // Pre-populate two rooms
    const roomA = {
      sessionId: 'sess-a',
      messages: [{ id: 'a1', role: 'user', content: 'Room A message', timestamp: new Date().toISOString() }],
    };
    const roomB = {
      sessionId: 'sess-b',
      messages: [{ id: 'b1', role: 'user', content: 'Room B message', timestamp: new Date().toISOString() }],
    };
    localStorage.setItem('readmind_chat:ROOM-A', JSON.stringify(roomA));
    localStorage.setItem('readmind_chat:ROOM-B', JSON.stringify(roomB));

    // Mount with ROOM-A
    const { result, rerender } = renderHook(({ room }) => useChat(room), {
      initialProps: { room: 'ROOM-A' },
    });

    expect(result.current.messages[0].content).toBe('Room A message');
    expect(result.current.sessionId).toBe('sess-a');

    // Switch to ROOM-B
    rerender({ room: 'ROOM-B' });

    await waitFor(() => {
      expect(result.current.messages[0].content).toBe('Room B message');
      expect(result.current.sessionId).toBe('sess-b');
    });
  });

  it('clearMessages removes the stored entry', async () => {
    mockStreamMessage.mockImplementation(() =>
      makeStream([
        { event: 'start', session_id: 'sess-clear-store' },
        { event: 'end', session_id: 'sess-clear-store', sources: [] },
      ]) as AsyncGenerator<never>,
    );

    const { result } = renderHook(() => useChat('ROOM-CLEAR'));

    await act(async () => {
      await result.current.sendUserMessage('Store this');
    });

    // Verify it was stored
    expect(localStorage.getItem('readmind_chat:ROOM-CLEAR')).not.toBeNull();

    act(() => {
      result.current.clearMessages();
    });

    // Storage entry must be removed
    expect(localStorage.getItem('readmind_chat:ROOM-CLEAR')).toBeNull();
  });

  it('tolerates malformed storage and starts empty', () => {
    localStorage.setItem('readmind_chat:ROOM-BAD', 'not valid json {{{{');

    const { result } = renderHook(() => useChat('ROOM-BAD'));

    expect(result.current.messages).toEqual([]);
    expect(result.current.sessionId).toBeNull();
  });
});
