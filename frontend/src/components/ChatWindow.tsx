import { useRef, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle } from 'lucide-react';
import type { ChatMessage } from '../types';
import { MessageBubble } from './MessageBubble';
import { EmptyState } from './EmptyState';
import { ConfirmDialog } from './ConfirmDialog';
import { DocumentLogoIcon } from './DocumentLogoIcon';

interface ChatWindowProps {
  messages: ChatMessage[];
  isLoading: boolean;
  hasActiveDocuments: boolean;
  onSuggestionClick?: (text: string) => void;
  onRetry?: (userMessage: string) => void;
  onRegenerate?: () => void;
}

export function ChatWindow({ 
  messages, 
  isLoading, 
  hasActiveDocuments,
  onSuggestionClick,
  onRetry,
  onRegenerate,
}: ChatWindowProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [confirmRegenOpen, setConfirmRegenOpen] = useState(false);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  return (
    <div className="flex-1 overflow-y-auto relative bg-[var(--bg-chat)] chat-window-mobile-padding md:pb-0">
      {/* Content on flat chat surface */}
      <div className="relative z-10 p-6 space-y-4">
        {/* No documents warning banner */}
        <AnimatePresence>
          {!hasActiveDocuments && messages.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex items-center gap-3 p-4 rounded-xl
                         border border-amber-400/30 bg-amber-500/10"
            >
              <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
                  Chưa chọn tài liệu
                </p>
                <p className="text-xs text-amber-600 dark:text-amber-500 mt-0.5">
                  Chọn tài liệu từ thanh bên để nhận câu trả lời sát với nội dung của bạn.
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Empty state */}
        {messages.length === 0 && !isLoading && (
          <EmptyState 
            hasActiveDocuments={hasActiveDocuments} 
            onSuggestionClick={onSuggestionClick}
          />
        )}

        {/* Messages with enhanced animations */}
        <AnimatePresence initial={false}>
          {messages.map((message) => (
            <motion.div
              key={message.id}
              initial={{ opacity: 0, y: 20, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.98 }}
              transition={{ 
                duration: 0.3, 
                ease: [0.4, 0, 0.2, 1] // Custom ease for smooth animation
              }}
            >
              <MessageBubble 
                message={message} 
                onRetry={message.isError && onRetry ? () => {
                  // Find the last user message before this error
                  let lastUserMessage = '';
                  for (let i = messages.indexOf(message) - 1; i >= 0; i--) {
                    if (messages[i].role === 'user') {
                      lastUserMessage = messages[i].content;
                      break;
                    }
                  }
                  if (lastUserMessage) onRetry(lastUserMessage);
                } : undefined}
                onRegenerate={message.role === 'assistant' && !message.isError && onRegenerate ? () => setConfirmRegenOpen(true) : undefined}
              />
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Loading indicator with animated dots */}
        <AnimatePresence>
          {isLoading && !messages.some(m => m.isStreaming) && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="flex justify-start gap-3"
            >
              {/* Bot avatar for loading */}
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[var(--accent-light)] flex items-center justify-center
                             shadow-lg shadow-[var(--accent)]/20">
                <DocumentLogoIcon size={18} className="text-[var(--accent)]" />
              </div>
              
              <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] text-[var(--text-primary)] rounded-2xl rounded-bl-md px-4 py-3">
                <div className="flex items-center gap-2">
                  {/* Animated typing dots */}
                  <div className="flex gap-1">
                    {[0, 1, 2].map((i) => (
                      <motion.span
                        key={i}
                        className="w-2 h-2 bg-[var(--accent)] rounded-full"
                        animate={{
                          scale: [1, 1.3, 1],
                          opacity: [0.4, 1, 0.4],
                        }}
                        transition={{
                          duration: 0.8,
                          repeat: Infinity,
                          delay: i * 0.15,
                          ease: 'easeInOut',
                        }}
                      />
                    ))}
                  </div>
                  <span className="text-sm text-[var(--text-secondary)]">Đang suy nghĩ...</span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div ref={bottomRef} />
      </div>

      {/* Confirm regenerate dialog */}
      <ConfirmDialog
        open={confirmRegenOpen}
        title="Tạo lại câu trả lời?"
        message="Câu trả lời hiện tại sẽ bị thay thế. Hành động này không thể hoàn tác."
        confirmLabel="Tạo lại"
        cancelLabel="Hủy"
        onConfirm={() => {
          setConfirmRegenOpen(false);
          onRegenerate?.();
        }}
        onCancel={() => setConfirmRegenOpen(false)}
      />
    </div>
  );
}
