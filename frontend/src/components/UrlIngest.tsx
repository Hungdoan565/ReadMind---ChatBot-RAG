import { useState, useCallback, type FormEvent } from 'react';
import { Link, Loader2 } from 'lucide-react';
import { ingestUrl } from '../api/ingest';
import type { IngestHistoryItem } from '../types';

interface UrlIngestProps {
  roomCode: string;
  onIngestComplete: (item: IngestHistoryItem) => void;
}

export function UrlIngest({ roomCode, onIngestComplete }: UrlIngestProps) {
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validateUrl = (input: string): boolean => {
    try {
      new URL(input);
      return true;
    } catch {
      return false;
    }
  };

  const handleSubmit = useCallback(async (e: FormEvent) => {
    e.preventDefault();
    
    if (!url.trim()) return;
    
    if (!validateUrl(url.trim())) {
      setError('Please enter a valid URL');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await ingestUrl(url.trim(), roomCode);
      
      onIngestComplete({
        id: Date.now().toString(),
        docId: response.doc_id,
        source: response.source,
        chunkCount: response.chunk_count,
        status: 'success',
        timestamp: new Date(),
      });
      
      setUrl('');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to ingest URL';
      setError(message);
      onIngestComplete({
        id: Date.now().toString(),
        source: url,
        chunkCount: 0,
        status: 'error',
        timestamp: new Date(),
        message,
      });
    } finally {
      setIsLoading(false);
    }
  }, [url, roomCode, onIngestComplete]);

  return (
    <div className="p-4 border-t border-[var(--sidebar-border)]">
      <h3 className="text-sm font-semibold text-[var(--sidebar-text-secondary)] uppercase tracking-wide mb-3">
        Thêm từ URL
      </h3>
      
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <input
            type="text"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setError(null);
            }}
            placeholder="https://example.com/document"
            disabled={isLoading}
            className="w-full glass-border bg-[var(--sidebar-bg-light)] rounded-lg px-3 py-2 text-sm
                       text-[var(--text-primary)] placeholder-[var(--text-tertiary)]
                       focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent
                       disabled:opacity-50 transition-all duration-200"
          />
        </div>
        
        <button
          type="submit"
          disabled={!url.trim() || isLoading}
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
              <Link className="w-4 h-4" />
              <span>Ingest URL</span>
            </>
          )}
        </button>
      </form>

      {error && (
        <div className="mt-3 p-2 bg-red-900/30 border border-red-700 rounded text-red-300 text-xs">
          {error}
        </div>
      )}
    </div>
  );
}