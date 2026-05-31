import { useState, useCallback, type FormEvent } from 'react';
import { Database, FileText, Loader2 } from 'lucide-react';
import { ingestNotionPage, ingestNotionDatabase } from '../api/ingest';
import type { IngestHistoryItem } from '../types';

type NotionMode = 'page' | 'database';

interface NotionIngestProps {
  roomCode: string;
  onIngestComplete: (item: IngestHistoryItem) => void;
}

export function NotionIngest({ roomCode, onIngestComplete }: NotionIngestProps) {
  const [value, setValue] = useState('');
  const [mode, setMode] = useState<NotionMode>('page');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(async (e: FormEvent) => {
    e.preventDefault();

    if (!value.trim()) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = mode === 'page'
        ? await ingestNotionPage(value.trim(), roomCode)
        : await ingestNotionDatabase(value.trim(), roomCode);

      onIngestComplete({
        id: Date.now().toString(),
        docId: response.doc_id,
        source: response.source,
        chunkCount: response.chunk_count,
        status: 'success',
        timestamp: new Date(),
      });

      setValue('');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Không thể nhập từ Notion';
      setError(message);
      onIngestComplete({
        id: Date.now().toString(),
        source: value,
        chunkCount: 0,
        status: 'error',
        timestamp: new Date(),
        message,
      });
    } finally {
      setIsLoading(false);
    }
  }, [value, mode, roomCode, onIngestComplete]);

  const placeholder = mode === 'page'
    ? 'ID hoặc URL trang Notion'
    : 'ID hoặc URL cơ sở dữ liệu';

  return (
    <div className="p-4 border-t border-[var(--sidebar-border)]">
      <h3 className="text-sm font-semibold text-[var(--sidebar-text-secondary)] uppercase tracking-wide mb-3">
        Thêm từ Notion
      </h3>

      {/* Page vs database toggle */}
      <div className="flex gap-2 mb-3">
        <button
          type="button"
          onClick={() => {
            setMode('page');
            setError(null);
          }}
          disabled={isLoading}
          className={`flex-1 flex items-center justify-center gap-1.5 glass-border rounded-lg px-3 py-1.5 text-xs font-medium
                      transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed ${
                        mode === 'page'
                          ? 'bg-[var(--accent)] text-white'
                          : 'bg-[var(--sidebar-bg-light)] text-[var(--sidebar-text-secondary)] hover:text-[var(--sidebar-text)]'
                      }`}
        >
          <FileText className="w-3.5 h-3.5" />
          Trang
        </button>
        <button
          type="button"
          onClick={() => {
            setMode('database');
            setError(null);
          }}
          disabled={isLoading}
          className={`flex-1 flex items-center justify-center gap-1.5 glass-border rounded-lg px-3 py-1.5 text-xs font-medium
                      transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed ${
                        mode === 'database'
                          ? 'bg-[var(--accent)] text-white'
                          : 'bg-[var(--sidebar-bg-light)] text-[var(--sidebar-text-secondary)] hover:text-[var(--sidebar-text)]'
                      }`}
        >
          <Database className="w-3.5 h-3.5" />
          Cơ sở dữ liệu
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <input
            type="text"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError(null);
            }}
            placeholder={placeholder}
            disabled={isLoading}
            className="w-full glass-border bg-[var(--sidebar-bg-light)] rounded-lg px-3 py-2 text-sm
                       text-[var(--text-primary)] placeholder-[var(--text-tertiary)]
                       focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent
                       disabled:opacity-50 transition-all duration-200"
          />
        </div>

        <button
          type="submit"
          disabled={!value.trim() || isLoading}
          className="w-full glass-border bg-[var(--accent)] hover:bg-[var(--accent-hover)]
                     text-white rounded-lg px-3 py-2 text-sm font-medium
                     transition-all duration-200 disabled:bg-[var(--bg-tertiary)] disabled:cursor-not-allowed
                     flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-[0.98]"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Đang xử lý...</span>
            </>
          ) : (
            <>
              <Database className="w-4 h-4" />
              <span>Nhập từ Notion</span>
            </>
          )}
        </button>
      </form>

      {error && (
        <div className="mt-3 p-2 glass-border rounded-lg border-[var(--error)]/30 bg-[var(--error)]/10 text-[var(--error)] text-xs">
          {error}
        </div>
      )}
    </div>
  );
}
