import { useState, useCallback } from 'react';
import { FileStack, BookmarkPlus, Loader2 } from 'lucide-react';
import { FileUpload } from './FileUpload';
import { UrlIngest } from './UrlIngest';
import { NotionIngest } from './NotionIngest';
import { DocumentList } from './DocumentList';
import { claimRoom } from '../api/rooms';
import type { IngestHistoryItem } from '../types';

interface ClaimMessage {
  type: 'success' | 'error';
  text: string;
}

interface DocumentPanelProps {
  roomCode: string;
  isAuthenticated: boolean;
  activeDocIds: string[];
  onActiveDocsChange: (ids: string[]) => void;
  onAskAboutDoc: (docId: string, source: string) => void;
}

export function DocumentPanel({
  roomCode,
  isAuthenticated,
  activeDocIds,
  onActiveDocsChange,
  onAskAboutDoc,
}: DocumentPanelProps) {
  // Bumped on a successful ingest so DocumentList refreshes (Req 3.5).
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Claim-room control state (relocated from Sidebar).
  const [isClaiming, setIsClaiming] = useState(false);
  const [claimMessage, setClaimMessage] = useState<ClaimMessage | null>(null);

  const handleIngestComplete = useCallback((item: IngestHistoryItem) => {
    if (item.status === 'success') {
      // Trigger document list refresh when an ingest completes.
      setRefreshTrigger((prev) => prev + 1);
    }
  }, []);

  const handleClaimRoom = useCallback(async () => {
    if (!roomCode) return;
    setIsClaiming(true);
    setClaimMessage(null);
    try {
      await claimRoom(roomCode);
      setClaimMessage({ type: 'success', text: 'Đã lưu phòng vào tài khoản.' });
    } catch {
      setClaimMessage({ type: 'error', text: 'Không thể lưu phòng.' });
    } finally {
      setIsClaiming(false);
    }
  }, [roomCode]);

  return (
    <aside className="w-80 glass-surface flex flex-col h-full overflow-y-auto border-l border-[var(--sidebar-border)] bg-[var(--sidebar-bg)] z-[var(--z-sidebar)]">
      {/* Header */}
      <div className="relative p-4 border-b border-[var(--sidebar-border)] overflow-hidden flex-shrink-0">
        <div className="absolute inset-0 bg-gradient-to-bl from-[var(--accent)]/10 to-transparent pointer-events-none" />
        <div className="relative flex items-center gap-3">
          <FileStack className="w-6 h-6 text-[var(--accent)]" />
          <div>
            <h2 className="text-lg font-bold text-[var(--sidebar-text)]">Tài liệu</h2>
            <p className="text-xs text-[var(--sidebar-text-secondary)]">Tài liệu của phòng hiện tại</p>
          </div>
        </div>
      </div>

      {/* File Upload */}
      <FileUpload roomCode={roomCode} onUploadComplete={handleIngestComplete} />

      {/* URL Ingest */}
      <UrlIngest roomCode={roomCode} onIngestComplete={handleIngestComplete} />

      {/* Notion Ingest */}
      <NotionIngest roomCode={roomCode} onIngestComplete={handleIngestComplete} />

      {/* Claim current room — only available when logged in */}
      {isAuthenticated && (
        <div className="px-4 pb-2">
          <button
            onClick={handleClaimRoom}
            disabled={isClaiming}
            title="Lưu phòng hiện tại vào tài khoản của bạn"
            className="w-full flex items-center justify-center gap-2 glass-border
                       bg-[var(--sidebar-bg-light)] hover:bg-[var(--sidebar-border)]
                       text-[var(--sidebar-text)] rounded-lg px-4 py-2.5 text-sm font-medium
                       transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]
                       disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100"
          >
            {isClaiming ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Đang lưu...
              </>
            ) : (
              <>
                <BookmarkPlus className="w-4 h-4" />
                Lưu phòng này
              </>
            )}
          </button>
          {claimMessage && (
            <p
              className={`mt-2 text-xs ${
                claimMessage.type === 'success'
                  ? 'text-[var(--accent)]'
                  : 'text-[var(--error)]'
              }`}
            >
              {claimMessage.text}
            </p>
          )}
        </div>
      )}

      {/* Document List with selection */}
      <DocumentList
        roomCode={roomCode}
        activeDocIds={activeDocIds}
        onActiveDocsChange={onActiveDocsChange}
        onAskAboutDoc={onAskAboutDoc}
        refreshTrigger={refreshTrigger}
      />
    </aside>
  );
}
