import { Menu, Trash2 } from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';

interface MobileHeaderProps {
  onMenuClick: () => void;
  onClearChat: () => void;
  messageCount: number;
}

export function MobileHeader({ onMenuClick, onClearChat, messageCount }: MobileHeaderProps) {
  return (
    <header className="glass-surface border-b border-[var(--border-primary)] px-4 py-3 mobile-only">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onMenuClick}
            className="touch-target flex items-center justify-center rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors"
            aria-label="Mở menu"
          >
            <Menu className="w-6 h-6 text-[var(--text-primary)]" />
          </button>
          <div>
            <h1 className="text-lg font-semibold text-[var(--text-primary)]">ReadMind</h1>
            <p className="text-xs text-[var(--text-secondary)]">
              {messageCount === 0 
                ? 'Bắt đầu trò chuyện'
                : `${messageCount} tin nhắn`
              }
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          {messageCount > 0 && (
            <button 
              onClick={onClearChat} 
              className="touch-target flex items-center justify-center rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors text-[var(--text-secondary)]"
              aria-label="Xóa cuộc trò chuyện"
            >
              <Trash2 className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
