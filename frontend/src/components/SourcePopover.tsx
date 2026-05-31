import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FileText, Globe, X, MessageSquare } from 'lucide-react';
import type { SourceDocument } from '../types';

interface SourcePopoverProps {
  source: SourceDocument;
  isOpen: boolean;
  onClose: () => void;
  onAskAbout?: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
}

// File type icon mapping
function getSourceIcon(source: string) {
  if (source.startsWith('http://') || source.startsWith('https://')) {
    return { icon: Globe, color: 'text-emerald-400' };
  }
  return { icon: FileText, color: 'text-blue-400' };
}

export function SourcePopover({ 
  source, 
  isOpen, 
  onClose, 
  onAskAbout,
  anchorRef 
}: SourcePopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  // Calculate position relative to anchor
  useEffect(() => {
    if (isOpen && anchorRef.current && popoverRef.current) {
      const anchorRect = anchorRef.current.getBoundingClientRect();
      const popoverRect = popoverRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let top = anchorRect.bottom + 8;
      let left = anchorRect.left;

      // Adjust if popover would overflow right edge
      if (left + popoverRect.width > viewportWidth - 16) {
        left = viewportWidth - popoverRect.width - 16;
      }

      // Adjust if popover would overflow bottom
      if (top + popoverRect.height > viewportHeight - 16) {
        top = anchorRect.top - popoverRect.height - 8;
      }

      setPosition({ top, left });
    }
  }, [isOpen, anchorRef]);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        popoverRef.current && 
        !popoverRef.current.contains(e.target as Node) &&
        anchorRef.current &&
        !anchorRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose, anchorRef]);

  const { icon: Icon, color } = getSourceIcon(source.source);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={popoverRef}
          initial={{ opacity: 0, y: -4, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -4, scale: 0.95 }}
          transition={{ duration: 0.15 }}
          className="fixed z-[var(--z-modal)] w-80 glass-surface rounded-xl shadow-xl border border-[var(--border-primary)]"
          style={{ top: position.top, left: position.left }}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-3 border-b border-[var(--border-primary)]">
            <div className="flex items-center gap-2 min-w-0">
              <Icon className={`w-4 h-4 ${color} flex-shrink-0`} />
              <span className="text-sm font-medium text-[var(--text-primary)] truncate">
                {source.source}
              </span>
            </div>
            <button
              onClick={onClose}
              className="p-1 rounded-md text-[var(--text-tertiary)] hover:text-[var(--text-primary)] 
                         hover:bg-[var(--bg-tertiary)] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Content */}
          <div className="p-3">
            {source.page !== undefined && (
              <span className="inline-block text-xs bg-[var(--bg-tertiary)] text-[var(--text-secondary)] 
                             px-2 py-0.5 rounded mb-2">
                Trang {source.page}
              </span>
            )}
            <p className="text-sm text-[var(--text-secondary)] leading-relaxed line-clamp-4">
              {source.content_preview}
            </p>
          </div>

          {/* Actions */}
          {onAskAbout && (
            <div className="p-3 border-t border-[var(--border-primary)]">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => {
                  onAskAbout();
                  onClose();
                }}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg
                           bg-[var(--accent)] text-white text-sm font-medium
                           hover:bg-[var(--accent-hover)] transition-colors"
              >
                <MessageSquare className="w-4 h-4" />
                Hỏi về nguồn này
              </motion.button>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
