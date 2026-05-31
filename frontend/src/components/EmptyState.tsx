import { motion } from 'framer-motion';
import { FileText, HelpCircle, Zap, AlertTriangle } from 'lucide-react';
import { DocumentLogoIcon } from './DocumentLogoIcon';

interface EmptyStateProps {
  hasActiveDocuments: boolean;
  onSuggestionClick?: (text: string) => void;
}

const suggestionChips = [
  { icon: FileText, text: 'Tóm tắt tài liệu của tôi' },
  { icon: HelpCircle, text: 'Tôi có thể hỏi gì?' },
  { icon: Zap, text: 'Tìm kiếm thông tin quan trọng' },
];

export function EmptyState({ hasActiveDocuments, onSuggestionClick }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-4 relative">
      <div className="relative mb-8">
        {/* Main icon */}
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="w-20 h-20 glass-surface rounded-2xl flex items-center justify-center
                     shadow-lg shadow-[var(--accent)]/10"
        >
          <DocumentLogoIcon size={40} className="text-[var(--accent)]" />
        </motion.div>
      </div>

      {/* Gradient title */}
      <motion.h3
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="text-2xl font-bold mb-3 font-heading text-[var(--text-primary)]"
      >
        Tôi có thể giúp gì cho bạn hôm nay?
      </motion.h3>

      <motion.p
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="text-sm text-[var(--text-secondary)] max-w-md mb-6"
      >
        Tải tài liệu lên và đặt câu hỏi để nhận câu trả lời thông minh dựa trên nội dung của bạn.
      </motion.p>

      {/* No documents warning */}
      {!hasActiveDocuments && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3, delay: 0.3 }}
          className="flex items-center gap-2 px-4 py-2.5 glass-surface rounded-xl mb-6
                     border border-amber-400/30 bg-amber-500/10"
        >
          <AlertTriangle className="w-4 h-4 text-amber-500" />
          <span className="text-sm text-amber-600 dark:text-amber-400">
            Chọn hoặc tải tài liệu lên để bắt đầu trò chuyện
          </span>
        </motion.div>
      )}

      {/* Suggestion chips with hover effects */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.4 }}
        className="flex flex-wrap justify-center gap-3"
      >
        {suggestionChips.map((chip, index) => (
          <motion.button
            key={index}
            onClick={() => onSuggestionClick?.(chip.text)}
            whileHover={{ scale: 1.05, borderColor: 'var(--accent)' }}
            whileTap={{ scale: 0.98 }}
            className="flex items-center gap-2 px-4 py-2.5 glass-surface rounded-xl
                       text-sm text-[var(--text-secondary)] border border-transparent
                       hover:text-[var(--accent)] hover:border-[var(--accent)]/30
                       transition-colors duration-200 cursor-pointer"
          >
            <chip.icon className="w-4 h-4" />
            <span>{chip.text}</span>
          </motion.button>
        ))}
      </motion.div>
    </div>
  );
}
