import { useState, useCallback, useEffect } from 'react';

const STORAGE_KEY = 'readmind_room_code';

/**
 * Generate a short, readable room code (8 uppercase chars)
 * Format: XXXX-XXXX for readability
 */
function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Exclude confusing chars
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  // Format as XXXX-XXXX
  return code.slice(0, 4) + '-' + code.slice(4);
}

/**
 * Get room code from URL query params (?room=XXXX-XXXX)
 */
function getRoomFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get('room');
}

interface UseRoomReturn {
  roomCode: string;
  setRoomCode: (code: string) => void;
  regenerateRoom: () => void;
  copyRoomToClipboard: () => void;
}

export function useRoom(): UseRoomReturn {
  const [roomCode, setRoomCodeState] = useState<string>('');

  // Initialize room on mount
  useEffect(() => {
    // 1. Check URL first (shared link)
    const urlRoom = getRoomFromUrl();
    if (urlRoom && urlRoom.trim()) {
      setRoomCodeState(urlRoom.trim());
      localStorage.setItem(STORAGE_KEY, urlRoom.trim());
      return;
    }

    // 2. Check localStorage (returning user)
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && stored.trim()) {
      setRoomCodeState(stored.trim());
      return;
    }

    // 3. Generate new room (first visit)
    const newCode = generateRoomCode();
    setRoomCodeState(newCode);
    localStorage.setItem(STORAGE_KEY, newCode);
  }, []);

  const setRoomCode = useCallback((code: string) => {
    const trimmed = code.trim();
    setRoomCodeState(trimmed);
    localStorage.setItem(STORAGE_KEY, trimmed);
  }, []);

  const regenerateRoom = useCallback(() => {
    const newCode = generateRoomCode();
    setRoomCodeState(newCode);
    localStorage.setItem(STORAGE_KEY, newCode);
  }, []);

  const copyRoomToClipboard = useCallback(() => {
    if (roomCode) {
      const url = new URL(window.location.href);
      url.searchParams.set('room', roomCode);
      navigator.clipboard.writeText(url.toString());
    }
  }, [roomCode]);

  return {
    roomCode,
    setRoomCode,
    regenerateRoom,
    copyRoomToClipboard,
  };
}