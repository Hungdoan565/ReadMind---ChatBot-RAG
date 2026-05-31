import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { User, AlertCircle, RefreshCw, Copy, Check } from 'lucide-react';
import type { ChatMessage } from '../types';
import { SourceList } from './SourceList';
import { DocumentLogoIcon } from './DocumentLogoIcon';
import { MermaidDiagram } from './MermaidDiagram';
import { useTheme } from './ThemeProvider';
import { getNodeText, isFenceComplete, languageOf } from './markdownRouting';

interface MessageBubbleProps {
  message: ChatMessage;
  onRetry?: () => void;
  onRegenerate?: () => void;
}

export function MessageBubble({ message, onRetry, onRegenerate }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const isError = message.isError;
  const [copied, setCopied] = useState(false);
  const { isDark } = useTheme();
  const isStreaming = message.isStreaming === true;

  // Memoized markdown component overrides for the assistant branch. Recreated
  // only when content, streaming state, or theme change, so React swaps in the
  // new renderer exactly when the stream finalizes or the theme flips.
  const markdownComponents = useMemo<Components>(
    () => ({
      code({ node, className, children, ...rest }) {
        const lang = languageOf(className); // "mermaid" | "text" | language id | null
        const raw = getNodeText(node); // raw fence body (survives rehype-highlight)
        const fenceClosed = isFenceComplete(message.content, node);

        // Route to the diagram renderer only for a complete, non-streaming
        // mermaid block; everything else (incomplete/streaming mermaid, other
        // languages, inline code) renders exactly as today.
        if (lang === 'mermaid' && fenceClosed && !isStreaming) {
          return <MermaidDiagram source={raw.trimEnd()} isDark={isDark} />;
        }

        return (
          <code className={className} {...rest}>
            {children}
          </code>
        );
      },
      // Wrap tables so wide tables scroll horizontally inside the bubble; raw
      // HTML stays disabled (no rehype-raw, no dangerouslySetInnerHTML).
      table({ children, ...rest }) {
        return (
          <div className="md-table-wrap">
            <table {...rest}>{children}</table>
          </div>
        );
      },
    }),
    [message.content, isStreaming, isDark],
  );

  const handleCopy = () => {
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(message.content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      // clipboard unavailable — silently ignore
    });
  };

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
            : 'bg-[var(--accent-light)] shadow-[var(--accent)]/20'
        }`}
      >
        {isUser ? (
          <User className="w-4 h-4 text-[var(--text-secondary)]" />
        ) : isError ? (
          <AlertCircle className="w-4 h-4 text-[var(--error)]" />
        ) : (
          <DocumentLogoIcon size={18} className="text-[var(--accent)]" />
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
              components={markdownComponents}
            >
              {message.content}
            </ReactMarkdown>
            {message.isStreaming && (
              <span className="inline-block w-1.5 h-4 ml-0.5 bg-[var(--accent)] animate-pulse rounded-sm align-text-bottom" />
            )}
          </div>
        )}

        {/* Timestamp and action buttons */}
        <div className="flex items-center justify-between mt-2 gap-2">
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
          
          <div className="flex items-center gap-1">
            {/* Copy button for assistant messages */}
            {!isUser && !isError && !message.isStreaming && (
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleCopy}
                title={copied ? 'Đã sao chép' : 'Sao chép'}
                className="flex items-center gap-1 text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors px-1.5 py-0.5 rounded"
              >
                {copied ? (
                  <>
                    <Check className="w-3 h-3 text-green-500" />
                    <span className="text-green-500">Đã sao chép</span>
                  </>
                ) : (
                  <Copy className="w-3 h-3" />
                )}
              </motion.button>
            )}

            {/* Regenerate button for assistant messages */}
            {!isUser && !isError && !message.isStreaming && onRegenerate && (
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={onRegenerate}
                title="Tạo lại câu trả lời"
                className="flex items-center gap-1 text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors px-1.5 py-0.5 rounded"
              >
                <RefreshCw className="w-3 h-3" />
              </motion.button>
            )}

            {/* Retry button for error messages */}
            {isError && onRetry && (
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={onRetry}
                className="flex items-center gap-1 text-xs text-[var(--error)] hover:text-[var(--error)]/80 transition-colors"
              >
                <RefreshCw className="w-3 h-3" />
                Thử lại
              </motion.button>
            )}
          </div>
        </div>

        {/* Sources for assistant messages */}
        {!isUser && !isError && message.sources && message.sources.length > 0 && (
          <SourceList sources={message.sources} />
        )}
      </div>
    </motion.div>
  );
}
