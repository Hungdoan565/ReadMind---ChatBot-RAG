import { useState, useCallback } from 'react';
import { Plus } from 'lucide-react';
import { DocumentLogoIcon } from './DocumentLogoIcon';
import { FileUpload } from './FileUpload';
import { UrlIngest } from './UrlIngest';
import { DocumentList } from './DocumentList';
import type { IngestHistoryItem } from '../types';

interface SidebarProps {
  roomCode: string;
  onClearChat: () => void;
  activeDocIds: string[];
  onActiveDocsChange: (ids: string[]) => void;
  onAskAboutDoc: (docId: string, source: string) => void;
}

export function Sidebar({
  roomCode,
  onClearChat,
  activeDocIds,
  onActiveDocsChange,
  onAskAboutDoc,
}: SidebarProps) {
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const handleIngestComplete = useCallback((item: IngestHistoryItem) => {
    if (item.status === 'success') {
      // Trigger document list refresh when upload completes
      setRefreshTrigger((prev) => prev + 1);
    }
  }, []);

  return (
    <aside className="w-80 glass-surface flex flex-col h-full border-r border-[var(--sidebar-border)] bg-[var(--sidebar-bg)] z-[var(--z-sidebar)]">
      {/* Header with gradient overlay */}
      <div className="relative p-4 border-b border-[var(--sidebar-border)] overflow-hidden">
        {/* Subtle gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-[var(--accent)]/10 to-transparent pointer-events-none" />
        
        <div className="relative flex items-center gap-3">
          <DocumentLogoIcon size={32} className="animate-pulse" />
          <div>
            <h1 className="text-lg font-bold text-[var(--sidebar-text)]">ReadMind</h1>
            <p className="text-xs text-[var(--sidebar-text-secondary)]">Hỏi đáp về tài liệu của bạn</p>
          </div>
        </div>
      </div>

      {/* New Chat Button with glass border */}
      <div className="p-4">
        <button
          onClick={onClearChat}
          className="w-full flex items-center justify-center gap-2 glass-border
                     bg-[var(--sidebar-bg-light)] hover:bg-[var(--sidebar-border)]
                     text-[var(--sidebar-text)] rounded-lg px-4 py-2.5 text-sm font-medium
                     transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
        >
          <Plus className="w-4 h-4" />
          New Conversation
        </button>
      </div>

      {/* File Upload */}
      <FileUpload roomCode={roomCode} onUploadComplete={handleIngestComplete} />
      
      {/* URL Ingest */}
      <UrlIngest roomCode={roomCode} onIngestComplete={handleIngestComplete} />
      
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