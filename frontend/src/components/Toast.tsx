import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, AlertCircle, CheckCircle } from 'lucide-react';

export interface ToastProps {
  open: boolean;
  message: string;
  type?: 'error' | 'success' | 'info';
  onClose: () => void;
  /** Auto-dismiss after this many ms. Default 4000. Pass 0 to disable. */
  duration?: number;
}

/**
 * Minimal shared toast notification.
 * Renders a fixed bottom-right notification that auto-dismisses.
 */
export function Toast({
  open,
  message,
  type = 'info',
  onClose,
  duration = 4000,
}: ToastProps) {
  useEffect(() => {
    if (!open || duration === 0) return;
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [open, duration, onClose]);

  const icon =
    type === 'error' ? (
      <AlertCircle className="w-4 h-4 text-[var(--error)] flex-shrink-0" />
    ) : type === 'success' ? (
      <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
    ) : null;

  const borderColor =
    type === 'error'
      ? 'border-[var(--error)]/40'
      : type === 'success'
      ? 'border-green-500/40'
      : 'border-[var(--border-primary)]';

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className={`fixed bottom-6 right-6 z-50 flex items-start gap-3 glass-surface rounded-xl px-4 py-3
                      shadow-xl border ${borderColor} max-w-sm`}
          initial={{ opacity: 0, y: 16, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.95 }}
          transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
          role="alert"
        >
          {icon}
          <p className="text-sm text-[var(--text-primary)] flex-1 leading-relaxed">{message}</p>
          <button
            onClick={onClose}
            className="flex-shrink-0 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
            aria-label="Đóng thông báo"
          >
            <X className="w-4 h-4" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
