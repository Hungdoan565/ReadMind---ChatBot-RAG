import { useState, useCallback, useEffect } from 'react';

// ---------------------------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------------------------

const DOCSEL_STORAGE_PREFIX = 'readmind_docsel:';

function storageKey(roomCode: string): string {
  return `${DOCSEL_STORAGE_PREFIX}${roomCode}`;
}

function loadSelection(roomCode: string): string[] {
  if (!roomCode) return [];
  try {
    const raw = localStorage.getItem(storageKey(roomCode));
    if (!raw) return [];
    const data = JSON.parse(raw) as unknown;
    if (!Array.isArray(data)) return [];
    return data.filter((id): id is string => typeof id === 'string');
  } catch {
    // Storage unavailable or parse error — default to empty selection
    return [];
  }
}

function saveSelection(roomCode: string, ids: string[]): void {
  if (!roomCode) return;
  try {
    localStorage.setItem(storageKey(roomCode), JSON.stringify(ids));
  } catch {
    // Storage quota or serialization error — silently ignore
  }
}

// ---------------------------------------------------------------------------
// Hook interface
// ---------------------------------------------------------------------------

interface UseDocumentSelectionReturn {
  activeDocIds: string[];
  setActiveDocIds: (ids: string[]) => void;
}

/**
 * Per-room active document selection.
 *
 * Selection is scoped to the room and persisted under `readmind_docsel:{room}`,
 * so it survives reloads and is independent of the active conversation. Switching
 * conversations within a room does not touch the selection because this hook only
 * depends on `roomCode` (Requirement 12.2).
 */
export function useDocumentSelection(roomCode: string): UseDocumentSelectionReturn {
  // Hydrate from storage on mount for the initial room
  const [activeDocIds, setActiveDocIdsState] = useState<string[]>(() => loadSelection(roomCode));

  // When the room changes, load that room's stored selection (default [] on miss)
  useEffect(() => {
    setActiveDocIdsState(loadSelection(roomCode));
  }, [roomCode]);

  // Update in-memory selection and persist it for the open room
  const setActiveDocIds = useCallback(
    (ids: string[]) => {
      setActiveDocIdsState(ids);
      saveSelection(roomCode, ids);
    },
    [roomCode],
  );

  return {
    activeDocIds,
    setActiveDocIds,
  };
}
