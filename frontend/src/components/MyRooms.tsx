import { useState, useEffect, useCallback } from 'react';
import { Loader2, DoorOpen, FileText } from 'lucide-react';
import { getRooms } from '../api/rooms';
import type { RoomInfo } from '../types';

interface MyRoomsProps {
  isAuthenticated: boolean;
  currentRoomCode: string;
  onSelectRoom: (roomCode: string) => void;
  refreshTrigger?: number; // bump to force a reload (e.g. after claiming a room)
}

export function MyRooms({
  isAuthenticated,
  currentRoomCode,
  onSelectRoom,
  refreshTrigger = 0,
}: MyRoomsProps) {
  const [rooms, setRooms] = useState<RoomInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadRooms = useCallback(
    async (signal: { cancelled: boolean }) => {
      // Never call getRooms when anonymous — My Rooms is gated on auth.
      if (!isAuthenticated) return;

      setIsLoading(true);
      setError(null);
      try {
        const result = await getRooms();
        if (!signal.cancelled) {
          setRooms(result);
        }
      } catch {
        if (!signal.cancelled) {
          setError('Không thể tải danh sách phòng.');
        }
      } finally {
        if (!signal.cancelled) {
          setIsLoading(false);
        }
      }
    },
    [isAuthenticated]
  );

  useEffect(() => {
    const signal = { cancelled: false };
    void loadRooms(signal);
    return () => {
      signal.cancelled = true;
    };
  }, [isAuthenticated, refreshTrigger, loadRooms]);

  // Not accessible when anonymous — render nothing and issue no requests.
  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="p-4 border-t border-[var(--sidebar-border)]">
      <h3 className="text-sm font-semibold text-[var(--sidebar-text-secondary)] uppercase tracking-wide mb-3">
        Phòng của tôi
      </h3>

      {isLoading ? (
        <div className="flex items-center gap-2 text-[var(--sidebar-text-secondary)] py-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Đang tải phòng...</span>
        </div>
      ) : error ? (
        <div className="p-2 rounded-lg border border-[var(--error)]/30 bg-[var(--error)]/10 text-[var(--error)] text-xs">
          {error}
        </div>
      ) : rooms.length === 0 ? (
        <p className="text-sm text-[var(--sidebar-text-secondary)]">
          Bạn chưa lưu phòng nào.
        </p>
      ) : (
        <ul className="space-y-2">
          {rooms.map((room) => {
            const isActive = room.room_code === currentRoomCode;
            return (
              <li key={room.room_code}>
                <button
                  type="button"
                  onClick={() => onSelectRoom(room.room_code)}
                  aria-current={isActive ? 'true' : undefined}
                  className={`w-full flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm
                             transition-all duration-200 hover:scale-[1.01] active:scale-[0.99]
                             ${
                               isActive
                                 ? 'border border-[var(--accent)] bg-[var(--accent-light)] text-[var(--text-primary)]'
                                 : 'glass-border bg-[var(--sidebar-bg-light)] text-[var(--sidebar-text)] hover:border-[var(--accent)]'
                             }`}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <DoorOpen className="w-4 h-4 shrink-0 text-[var(--accent)]" />
                    <span className="truncate font-medium">{room.room_code}</span>
                  </span>
                  <span className="flex items-center gap-1 shrink-0 text-xs text-[var(--sidebar-text-secondary)]">
                    <FileText className="w-3 h-3" />
                    <span>{room.document_count} tài liệu</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
