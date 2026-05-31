import { useEffect, useRef } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';

interface DrawerProps {
  isOpen: boolean;
  side: 'left' | 'right';
  onClose: () => void;
  ariaLabel: string;
  children: ReactNode;
}

export function Drawer({ isOpen, side, onClose, ariaLabel, children }: DrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = useReducedMotion();

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

  // Anchor and slide direction depend on the side. Reduced motion disables the slide.
  const anchorClass = side === 'left' ? 'inset-y-0 left-0' : 'inset-y-0 right-0';
  const offscreenX = prefersReducedMotion ? 0 : side === 'left' ? '-100%' : '100%';
  const slideTransition = prefersReducedMotion
    ? { duration: 0 }
    : { type: 'spring' as const, damping: 25, stiffness: 300 };
  const backdropTransition = { duration: prefersReducedMotion ? 0 : 0.2 };
  // Close button sits on the inner edge: opposite the anchored side.
  const closeButtonClass = side === 'left' ? 'right-4' : 'left-4';

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
            transition={backdropTransition}
            onClick={onClose}
            aria-hidden="true"
          />

          {/* Drawer */}
          <motion.div
            ref={drawerRef}
            className={`fixed ${anchorClass} w-[85vw] max-w-[320px] z-[var(--z-modal)] mobile-only`}
            initial={{ x: offscreenX }}
            animate={{ x: 0 }}
            exit={{ x: offscreenX }}
            transition={slideTransition}
            role="dialog"
            aria-modal="true"
            aria-label={ariaLabel}
          >
            {/* Close button overlay */}
            <button
              onClick={onClose}
              className={`absolute top-4 ${closeButtonClass} z-10 touch-target flex items-center justify-center rounded-full bg-[var(--sidebar-bg-light)] hover:bg-[var(--accent)] transition-colors`}
              aria-label="Đóng"
            >
              <X className="w-5 h-5 text-white" />
            </button>

            {/* Drawer content */}
            <div className="h-full overflow-hidden">{children}</div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
