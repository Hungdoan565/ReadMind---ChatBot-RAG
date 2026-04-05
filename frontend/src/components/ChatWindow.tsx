import { useRef, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Zap, AlertTriangle } from 'lucide-react';
import type { ChatMessage } from '../types';
import { MessageBubble } from './MessageBubble';
import { ParticleBackground } from './ParticleBackground';
import { EmptyState } from './EmptyState';

interface ChatWindowProps {
  messages: ChatMessage[];
  isLoading: boolean;
  hasActiveDocuments: boolean;
  onSuggestionClick?: (text: string) => void;
}

export function ChatWindow({ 
  messages, 
  isLoading, 
  hasActiveDocuments,
  onSuggestionClick 
}: ChatWindowProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  return (
    <div className="flex-1 overflow-y-auto relative bg-[var(--bg-chat)] chat-window-mobile-padding md:pb-0">
      {/* Particle background */}
      <ParticleBackground className="opacity-30" />
      
      {/* Content with glass surface */}
      <div className="relative z-10 p-6 space-y-4">
        {/* No documents warning banner */}
        <AnimatePresence>
          {!hasActiveDocuments && messages.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex items-center gap-3 p-4 glass-surface rounded-xl
                         border border-amber-400/30 bg-amber-500/10"
            >
              <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
                  No documents selected
                </p>
                <p className="text-xs text-amber-600 dark:text-amber-500 mt-0.5">
                  Select documents from the sidebar to get relevant answers from your content.
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
              <MessageBubble message={message} />
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Loading indicator with animated dots */}
        <AnimatePresence>
          {isLoading && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="flex justify-start gap-3"
            >
              {/* Bot avatar for loading */}
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[var(--accent)] flex items-center justify-center
                             shadow-lg shadow-[var(--accent)]/20">
                <Zap className="w-4 h-4 text-white" />
              </div>
              
              <div className="glass-surface text-[var(--text-primary)] rounded-2xl rounded-bl-md px-4 py-3">
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
                  <span className="text-sm text-[var(--text-secondary)]">Thinking...</span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
