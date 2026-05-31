import { motion, AnimatePresence } from 'framer-motion';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** When true, the confirm button uses a destructive (red) style */
  destructive?: boolean;
}

/**
 * Minimal shared confirm dialog.
 * Renders a modal overlay with a title, message, and two action buttons.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Xác nhận',
  cancelLabel = 'Hủy',
  onConfirm,
  onCancel,
  destructive = false,
}: ConfirmDialogProps) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={onCancel}
          />

          {/* Dialog */}
          <motion.div
            className="relative glass-surface rounded-2xl p-6 max-w-sm w-full shadow-2xl border border-[var(--border-primary)]"
            initial={{ scale: 0.95, opacity: 0, y: 8 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 8 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
          >
            <h3 className="text-base font-semibold text-[var(--text-primary)] mb-2">
              {title}
            </h3>
            <p className="text-sm text-[var(--text-secondary)] mb-6 leading-relaxed">
              {message}
            </p>

            <div className="flex gap-3 justify-end">
              <button
                onClick={onCancel}
                className="px-4 py-2 text-sm rounded-lg bg-[var(--bg-tertiary)] text-[var(--text-secondary)]
                           hover:text-[var(--text-primary)] hover:bg-[var(--border-primary)]
                           transition-colors"
              >
                {cancelLabel}
              </button>
              <button
                onClick={onConfirm}
                className={`px-4 py-2 text-sm rounded-lg font-medium transition-colors ${
                  destructive
                    ? 'bg-[var(--error)] hover:bg-[var(--error)]/80 text-white'
                    : 'bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white'
                }`}
              >
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
