import type { ChangeEvent } from 'react';
import { Search } from 'lucide-react';

interface ConversationSearchProps {
  value: string;
  onChange: (term: string) => void;
}

/**
 * Controlled, client-side search input for filtering the conversation list by title.
 * Emits the raw term through `onChange`; it performs no backend request itself.
 */
export function ConversationSearch({ value, onChange }: ConversationSearchProps) {
  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
  };

  return (
    <div className="relative">
      <Search
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-tertiary)]"
        aria-hidden="true"
      />
      <input
        type="search"
        value={value}
        onChange={handleChange}
        placeholder="Tìm trong cuộc trò chuyện"
        aria-label="Tìm trong cuộc trò chuyện"
        className="w-full glass-border bg-[var(--sidebar-bg-light)] rounded-lg pl-9 pr-3 py-2 text-sm
                   text-[var(--text-primary)] placeholder-[var(--text-tertiary)]
                   focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent
                   transition-all duration-200"
      />
    </div>
  );
}
