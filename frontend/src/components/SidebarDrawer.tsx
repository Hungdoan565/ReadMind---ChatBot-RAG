import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { Sidebar } from './Sidebar';

interface SidebarDrawerProps {
  roomCode: string;
  isAuthenticated: boolean;
  onSelectRoom: (roomCode: string) => void;
  isOpen: boolean;
  onClose: () => void;
  onClearChat: () => void;
  activeDocIds: string[];
  onActiveDocsChange: (ids: string[]) => void;
  onAskAboutDoc: (docId: string, source: string) => void;
  onRegenerateRoom: () => void;
}

export function SidebarDrawer({
  roomCode,
  isAuthenticated,
  onSelectRoom,
  isOpen,
  onClose,
  onClearChat,
  activeDocIds,
  onActiveDocsChange,
  onAskAboutDoc,
  onRegenerateRoom,
}: SidebarDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);

  // Lock body scroll when drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.classList.add('body-scroll-lock');
    } else {
      document.body.classList.remove('body-scroll-lock');
    }

    return () => {
      document.body.classList.remove('body-scroll-lock');
    };
  }, [isOpen]);

  // Close on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // Focus trap
  useEffect(() => {
    if (isOpen && drawerRef.current) {
      const focusableElements = drawerRef.current.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      const firstElement = focusableElements[0] as HTMLElement;
      if (firstElement) {
        firstElement.focus();
      }
    }
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            className="drawer-backdrop mobile-only"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            aria-hidden="true"
          />

          {/* Drawer */}
          <motion.div
            ref={drawerRef}
            className="fixed inset-y-0 left-0 w-[85vw] max-w-[320px] z-[var(--z-modal)] mobile-only"
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            role="dialog"
            aria-modal="true"
            aria-label="Navigation menu"
          >
            {/* Close button overlay */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 z-10 touch-target flex items-center justify-center rounded-full bg-[var(--sidebar-bg-light)] hover:bg-[var(--accent)] transition-colors"
              aria-label="Close menu"
            >
              <X className="w-5 h-5 text-white" />
            </button>

            {/* Sidebar content - reuse existing Sidebar component */}
            <div className="h-full overflow-hidden">
              <Sidebar
                roomCode={roomCode}
                isAuthenticated={isAuthenticated}
                onSelectRoom={(code) => {
                  onSelectRoom(code);
                  onClose();
                }}
                onClearChat={() => {
                  onClearChat();
                  onClose();
                }}
                activeDocIds={activeDocIds}
                onActiveDocsChange={onActiveDocsChange}
                onAskAboutDoc={(docId, source) => {
                  onAskAboutDoc(docId, source);
                  onClose();
                }}
                onRegenerateRoom={() => {
                  onRegenerateRoom();
                  onClose();
                }}
              />
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}