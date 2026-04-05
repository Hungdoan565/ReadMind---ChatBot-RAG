import { motion } from 'framer-motion';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface InlineErrorProps {
  message: string;
  onRetry?: () => void;
}

export function InlineError({ message, onRetry }: InlineErrorProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex items-center gap-3 p-4 glass-surface rounded-xl
                 border border-[var(--error)]/30 bg-[var(--error)]/10"
    >
      <AlertCircle className="w-5 h-5 text-[var(--error)] flex-shrink-0" />
      
      <div className="flex-1">
        <p className="text-sm text-[var(--error)] font-medium">
          Something went wrong
        </p>
        <p className="text-xs text-[var(--error)]/80 mt-0.5">
          {message}
        </p>
      </div>

      {onRetry && (
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={onRetry}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg
                     bg-[var(--error)]/20 text-[var(--error)] text-sm font-medium
                     hover:bg-[var(--error)]/30 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Retry
        </motion.button>
      )}
    </motion.div>
  );
}
