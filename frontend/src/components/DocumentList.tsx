import { useState, useEffect, useCallback } from 'react';
import { AnimatePresence } from 'framer-motion';
import { FileText, RefreshCw, AlertCircle, Loader2 } from 'lucide-react';
import { DocumentCard } from './DocumentCard';
import type { StoredDocument } from '../types';
import { getDocuments, deleteDocument } from '../api/ingest';

interface DocumentListProps {
  roomCode: string;
  activeDocIds: string[];
  onActiveDocsChange: (ids: string[]) => void;
  onAskAboutDoc: (docId: string, source: string) => void;
  refreshTrigger?: number;
}

export function DocumentList({
  roomCode,
  activeDocIds,
  onActiveDocsChange,
  onAskAboutDoc,
  refreshTrigger = 0,
}: DocumentListProps) {
  const [documents, setDocuments] = useState<StoredDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchDocuments = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await getDocuments(roomCode);
      setDocuments(response.documents);
      
      // Auto-select new documents that aren't already tracked
      const newDocIds = response.documents
        .map((d) => d.doc_id)
        .filter((id) => !activeDocIds.includes(id));
      
      if (newDocIds.length > 0 && refreshTrigger > 0) {
        // Only auto-select if this is a refresh (not initial load)
        onActiveDocsChange([...activeDocIds, ...newDocIds]);
      } else if (activeDocIds.length === 0 && response.documents.length > 0) {
        // On initial load, select all documents
        onActiveDocsChange(response.documents.map((d) => d.doc_id));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load documents');
    } finally {
      setIsLoading(false);
    }
  }, [roomCode, refreshTrigger, activeDocIds, onActiveDocsChange]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  const handleToggleDoc = (docId: string) => {
    if (activeDocIds.includes(docId)) {
      onActiveDocsChange(activeDocIds.filter((id) => id !== docId));
    } else {
      onActiveDocsChange([...activeDocIds, docId]);
    }
  };

  const handleSelectAll = () => {
    onActiveDocsChange(documents.map((d) => d.doc_id));
  };

  const handleDeselectAll = () => {
    onActiveDocsChange([]);
  };

  const handleDelete = async (docId: string) => {
    if (deletingId) return;
    
    setDeletingId(docId);
    try {
      await deleteDocument(docId, roomCode);
      setDocuments((prev) => prev.filter((d) => d.doc_id !== docId));
      onActiveDocsChange(activeDocIds.filter((id) => id !== docId));
    } catch (err) {
      console.error('Failed to delete document:', err);
    } finally {
      setDeletingId(null);
    }
  };

  const getFileName = (source: string) => {
    const parts = source.split(/[/\\]/);
    return parts[parts.length - 1] || source;
  };

  // Loading state
  if (isLoading && documents.length === 0) {
    return (
      <div className="p-4 border-t border-[var(--sidebar-border)]">
        <div className="flex items-center justify-center gap-2 text-[var(--sidebar-text-secondary)] py-8">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Loading documents...</span>
        </div>
      </div>
    );
  }

  // Error state
  if (error && documents.length === 0) {
    return (
      <div className="p-4 border-t border-[var(--sidebar-border)]">
        <div className="flex flex-col items-center gap-2 text-[var(--sidebar-text-secondary)] py-8">
          <AlertCircle className="w-5 h-5 text-red-400" />
          <span className="text-sm text-red-300">{error}</span>
          <button
            onClick={fetchDocuments}
            className="text-xs text-[var(--accent)] hover:text-[var(--accent-hover)] flex items-center gap-1 mt-2"
          >
            <RefreshCw className="w-3 h-3" />
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 border-t border-[var(--sidebar-border)]">
      {/* Header with controls */}
      <div className="p-4 pb-2">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-[var(--sidebar-text-secondary)] uppercase tracking-wide">
            Tài liệu
          </h3>
          <button
            onClick={fetchDocuments}
            disabled={isLoading}
            className="p-1.5 text-[var(--sidebar-text-secondary)] hover:text-[var(--sidebar-text)] 
                       hover:bg-[var(--sidebar-bg-light)] rounded transition-colors disabled:opacity-50"
            title="Refresh documents"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
        
        {/* Select All / Deselect All + Count */}
        {documents.length > 0 && (
          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              <button
                onClick={handleSelectAll}
                className="text-xs text-[var(--accent)] hover:text-[var(--accent-hover)] transition-colors"
              >
                Select All
              </button>
              <span className="text-[var(--sidebar-text-secondary)]">|</span>
              <button
                onClick={handleDeselectAll}
                className="text-xs text-[var(--sidebar-text-secondary)] hover:text-[var(--sidebar-text)] transition-colors"
              >
                Deselect All
              </button>
            </div>
            <span className="text-xs text-[var(--sidebar-text-secondary)]">
              {activeDocIds.length} of {documents.length}
            </span>
          </div>
        )}
      </div>

      {/* Document Grid */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {documents.length === 0 ? (
          <div className="text-center py-8">
            <div className="w-12 h-12 rounded-xl bg-[var(--sidebar-bg-light)] flex items-center justify-center mx-auto mb-3">
              <FileText className="w-6 h-6 text-[var(--sidebar-text-secondary)]" />
            </div>
            <p className="text-sm text-[var(--sidebar-text-secondary)]">Chưa có tài liệu nào</p>
            <p className="text-xs text-[var(--sidebar-text-secondary)] mt-1 opacity-60">
              Tải file lên hoặc thêm URL ở trên
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 tablet:grid-cols-1 gap-4 py-3">
            <AnimatePresence initial={false}>
              {documents.map((doc) => (
                <DocumentCard
                  key={doc.doc_id}
                  docId={doc.doc_id}
                  source={doc.source}
                  chunkCount={doc.chunk_count}
                  isSelected={activeDocIds.includes(doc.doc_id)}
                  isDeleting={deletingId === doc.doc_id}
                  onToggle={() => handleToggleDoc(doc.doc_id)}
                  onDelete={() => handleDelete(doc.doc_id)}
                  onAskAbout={() => onAskAboutDoc(doc.doc_id, getFileName(doc.source))}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}