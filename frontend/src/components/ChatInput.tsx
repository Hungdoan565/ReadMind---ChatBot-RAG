import { useState, useCallback, useRef, useEffect, type KeyboardEvent, type FormEvent } from 'react';
import { Send, Loader2 } from 'lucide-react';

interface ChatInputProps {
  onSend: (message: string) => void;
  isLoading: boolean;
}

const MIN_HEIGHT = 48;
const MAX_HEIGHT = 200;

export function ChatInput({ onSend, isLoading }: ChatInputProps) {
  const [input, setInput] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea based on content
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    // Reset height to auto to get correct scrollHeight
    textarea.style.height = 'auto';
    
    // Calculate new height within bounds
    const newHeight = Math.min(Math.max(textarea.scrollHeight, MIN_HEIGHT), MAX_HEIGHT);
    textarea.style.height = `${newHeight}px`;
  }, [input]);

  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      if (input.trim() && !isLoading) {
        onSend(input.trim());
        setInput('');
      }
    },
    [input, isLoading, onSend]
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (input.trim() && !isLoading) {
          onSend(input.trim());
          setInput('');
        }
      }
    },
    [input, isLoading, onSend]
  );

  return (
    <form 
      onSubmit={handleSubmit} 
      className="border-t border-[var(--border-primary)] bg-[var(--bg-primary)] p-4"
    >
      <div className="max-w-4xl mx-auto">
        <div 
          className={`
            relative flex gap-3 items-end glass-surface rounded-2xl p-2 
            transition-all duration-300
            ${isFocused 
              ? 'ring-2 ring-[var(--accent)]/40 border-[var(--accent)]/50 shadow-lg shadow-[var(--accent)]/10' 
              : 'border-[var(--border-primary)]'
            }
          `}
        >
          {/* Subtle glow effect when focused */}
          {isFocused && (
            <div 
              className="absolute inset-0 rounded-2xl bg-gradient-to-r from-[var(--accent)]/5 via-transparent to-[var(--accent)]/5 pointer-events-none"
              style={{ 
                filter: 'blur(8px)',
                transform: 'scale(1.02)'
              }}
            />
          )}
          
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder="Đặt câu hỏi về tài liệu của bạn..."
            disabled={isLoading}
            rows={1}
            className="relative flex-1 resize-none bg-transparent px-3 py-2 
                       text-[var(--text-primary)] placeholder-[var(--text-tertiary)] 
                       focus:outline-none disabled:cursor-not-allowed
                       transition-colors"
            style={{ minHeight: `${MIN_HEIGHT}px`, maxHeight: `${MAX_HEIGHT}px` }}
          />
          
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="relative flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center 
                       transition-all duration-200 
                       bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white
                       hover:scale-105 active:scale-95
                       shadow-lg shadow-[var(--accent)]/20 hover:shadow-[var(--accent)]/30
                       disabled:bg-[var(--bg-tertiary)] disabled:text-[var(--text-tertiary)]
                       disabled:cursor-not-allowed disabled:shadow-none disabled:scale-100"
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </button>
        </div>
        
        <p className="text-xs text-[var(--text-tertiary)] text-center mt-2">
          Nhấn Enter để gửi, Shift+Enter để xuống dòng
        </p>
      </div>
    </form>
  );
}
