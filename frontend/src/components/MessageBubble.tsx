import { motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { Sparkles, User, AlertCircle, RefreshCw } from 'lucide-react';
import type { ChatMessage } from '../types';
import { SourceList } from './SourceList';

interface MessageBubbleProps {
  message: ChatMessage;
  onRetry?: () => void;
}

export function MessageBubble({ message, onRetry }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const isError = message.isError;

  return (
    <motion.div 
      className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
    >
      {/* Avatar */}
      <div
        className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center shadow-lg ${
          isUser
            ? 'bg-[var(--bg-tertiary)] shadow-black/5'
            : isError
            ? 'bg-[var(--error)]/20 shadow-[var(--error)]/10'
            : 'bg-[var(--accent)] shadow-[var(--accent)]/20'
        }`}
      >
        {isUser ? (
          <User className="w-4 h-4 text-[var(--text-secondary)]" />
        ) : isError ? (
          <AlertCircle className="w-4 h-4 text-[var(--error)]" />
        ) : (
          <Sparkles className="w-4 h-4 text-white" />
        )}
      </div>

      {/* Message content */}
      <div
        className={`max-w-[75%] rounded-2xl px-4 py-3 overflow-hidden ${
          isUser
            ? 'bg-[var(--accent)] text-white rounded-br-md shadow-lg shadow-[var(--accent)]/20'
            : isError
            ? 'glass-surface border border-[var(--error)]/30 bg-[var(--error)]/10 text-[var(--error)] rounded-bl-md'
            : 'glass-surface text-[var(--text-primary)] rounded-bl-md'
        }`}
      >
        {/* Message text */}
        {isUser ? (
          <div className="whitespace-pre-wrap break-words text-white">
            {message.content}
          </div>
        ) : (
          <div className="markdown-content break-words">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeHighlight]}
            >
              {message.content}
            </ReactMarkdown>
          </div>
        )}

        {/* Timestamp and retry button */}
        <div className="flex items-center justify-between mt-2">
          <span
            className={`text-xs ${
              isUser 
                ? 'text-white/60' 
                : isError 
                ? 'text-[var(--error)]/60' 
                : 'text-[var(--text-tertiary)]'
            }`}
          >
            {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
          
          {/* Retry button for error messages */}
          {isError && onRetry && (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={onRetry}
              className="flex items-center gap-1 text-xs text-[var(--error)] hover:text-[var(--error)]/80 transition-colors"
            >
              <RefreshCw className="w-3 h-3" />
              Retry
            </motion.button>
          )}
        </div>

        {/* Sources for assistant messages */}
        {!isUser && !isError && message.sources && message.sources.length > 0 && (
          <SourceList sources={message.sources} />
        )}
      </div>
    </motion.div>
  );
}
