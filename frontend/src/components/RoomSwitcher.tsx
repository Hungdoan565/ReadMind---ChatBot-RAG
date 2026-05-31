import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { DoorOpen, ChevronDown, Link as LinkIcon, RefreshCw, Check } from 'lucide-react';
import { MyRooms } from './MyRooms';

interface RoomSwitcherProps {
  roomCode: string;
  isAuthenticated: boolean;
  onSelectRoom: (roomCode: string) => void;
  onNewRoom: () => void;
  onShareRoom: () => void;
}

/**
 * Current-room pill that opens a menu to share the room, create a new room
 * ("Phòng mới" — distinct from the "Cuộc trò chuyện mới" action that lives in the
 * sidebar), and, when authenticated, switch between the user's saved rooms via the
 * relocated `MyRooms` list. The menu closes on outside click and on Escape.
 */
export function RoomSwitcher({
  roomCode,
  isAuthenticated,
  onSelectRoom,
  onNewRoom,
  onShareRoom,
}: RoomSwitcherProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const prefersReducedMotion = useReducedMotion();

  const closeMenu = useCallback(() => setIsOpen(false), []);

  // Close on click outside the switcher (trigger + menu).
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        closeMenu();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, closeMenu]);

  // Close on Escape and return focus to the trigger.
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeMenu();
        triggerRef.current?.focus();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, closeMenu]);

  const handleShare = useCallback(() => {
    onShareRoom();
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 2000);
  }, [onShareRoom]);

  const handleNewRoom = useCallback(() => {
    closeMenu();
    onNewRoom();
  }, [closeMenu, onNewRoom]);

  // Switching to another saved room closes the menu.
  const handleSelectRoom = useCallback(
    (code: string) => {
      closeMenu();
      onSelectRoom(code);
    },
    [closeMenu, onSelectRoom]
  );

  const menuTransition = prefersReducedMotion ? { duration: 0 } : { duration: 0.15 };

  return (
    <div ref={containerRef} className="relative">
      {/* Current-room pill */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        title="Phòng hiện tại — nhấn để chuyển hoặc tạo phòng"
        className="w-full flex items-center justify-between gap-2 glass-border
                   bg-[var(--sidebar-bg-light)] hover:border-[var(--accent)]
                   text-[var(--sidebar-text)] rounded-lg px-3 py-2 text-sm font-medium
                   transition-all duration-200 hover:scale-[1.01] active:scale-[0.99]"
      >
        <span className="flex items-center gap-2 min-w-0">
          <DoorOpen className="w-4 h-4 shrink-0 text-[var(--accent)]" />
          <span className="flex flex-col items-start min-w-0">
            <span className="text-[10px] uppercase tracking-wide text-[var(--sidebar-text-secondary)] leading-none">
              Phòng
            </span>
            <span className="truncate font-semibold leading-tight">{roomCode}</span>
          </span>
        </span>
        <ChevronDown
          className={`w-4 h-4 shrink-0 text-[var(--sidebar-text-secondary)] transition-transform duration-200 ${
            isOpen ? 'rotate-180' : ''
          }`}
          aria-hidden="true"
        />
      </button>

      {/* Menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            role="menu"
            aria-label="Tùy chọn phòng"
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={menuTransition}
            className="absolute left-0 right-0 top-full mt-2 z-[var(--z-dropdown)]
                       glass-surface rounded-xl border border-[var(--sidebar-border)]
                       overflow-hidden shadow-xl"
          >
            <div className="p-2 flex flex-col gap-1">
              {/* Share room */}
              <button
                type="button"
                role="menuitem"
                onClick={handleShare}
                className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-sm
                           text-[var(--sidebar-text)] hover:bg-[var(--sidebar-bg-light)]
                           hover:text-[var(--accent)] transition-colors"
              >
                {shareCopied ? (
                  <>
                    <Check className="w-4 h-4 shrink-0 text-[var(--accent)]" />
                    <span>Đã sao chép liên kết</span>
                  </>
                ) : (
                  <>
                    <LinkIcon className="w-4 h-4 shrink-0" />
                    <span>Chia sẻ phòng</span>
                  </>
                )}
              </button>

              {/* New room — distinct from "Cuộc trò chuyện mới" */}
              <button
                type="button"
                role="menuitem"
                onClick={handleNewRoom}
                title="Tạo phòng mới (không gian tài liệu trống hoàn toàn)"
                className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-sm
                           text-[var(--sidebar-text)] hover:bg-[var(--sidebar-bg-light)]
                           hover:text-[var(--accent)] transition-colors"
              >
                <RefreshCw className="w-4 h-4 shrink-0" />
                <span>Phòng mới</span>
              </button>
            </div>

            {/* Saved rooms — MyRooms self-gates on auth and renders nothing when anonymous */}
            <MyRooms
              isAuthenticated={isAuthenticated}
              currentRoomCode={roomCode}
              onSelectRoom={handleSelectRoom}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
