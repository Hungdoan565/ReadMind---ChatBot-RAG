import { renderHook, act, waitFor } from '@testing-library/react';
import { useRoom } from '../useRoom';

describe('useRoom', () => {
  it('generates a new room when no URL or localStorage exists', async () => {
    const { result } = renderHook(() => useRoom());

    await waitFor(() => {
      expect(result.current.roomCode).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    });

    expect(localStorage.getItem('readmind_room_code')).toBe(result.current.roomCode);
    expect(window.location.search).toContain(`room=${result.current.roomCode}`);
  });

  it('prefers room code from URL', async () => {
    window.history.replaceState({}, '', '/?room=ABCD-EFGH');

    const { result } = renderHook(() => useRoom());

    await waitFor(() => {
      expect(result.current.roomCode).toBe('ABCD-EFGH');
    });
  });

  it('uses localStorage when URL is absent', async () => {
    localStorage.setItem('readmind_room_code', 'WXYZ-1234');

    const { result } = renderHook(() => useRoom());

    await waitFor(() => {
      expect(result.current.roomCode).toBe('WXYZ-1234');
    });
  });

  it('updates localStorage and URL when room code changes', async () => {
    const { result } = renderHook(() => useRoom());

    await waitFor(() => expect(result.current.roomCode).not.toBe(''));

    act(() => {
      result.current.setRoomCode('TEST-ROOM');
    });

    expect(result.current.roomCode).toBe('TEST-ROOM');
    expect(localStorage.getItem('readmind_room_code')).toBe('TEST-ROOM');
    expect(window.location.search).toContain('room=TEST-ROOM');
  });

  it('regenerates a unique room and syncs it', async () => {
    const { result } = renderHook(() => useRoom());

    await waitFor(() => expect(result.current.roomCode).not.toBe(''));
    const previous = result.current.roomCode;

    act(() => {
      result.current.regenerateRoom();
    });

    expect(result.current.roomCode).not.toBe(previous);
    expect(localStorage.getItem('readmind_room_code')).toBe(result.current.roomCode);
    expect(window.location.search).toContain(`room=${result.current.roomCode}`);
  });

  it('copies a shareable room URL to clipboard', async () => {
    const { result } = renderHook(() => useRoom());

    await waitFor(() => expect(result.current.roomCode).not.toBe(''));

    act(() => {
      result.current.copyRoomToClipboard();
    });

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining(`room=${result.current.roomCode}`),
    );
  });
});
