import { useState, useCallback, useRef, type DragEvent, type ChangeEvent } from 'react';
import { Upload, Loader2 } from 'lucide-react';
import { uploadFile } from '../api/ingest';
import type { IngestHistoryItem, UploadProgress } from '../types';

interface FileUploadProps {
  roomCode: string;
  onUploadComplete: (item: IngestHistoryItem) => void;
}

const ACCEPTED_TYPES = ['.pdf', '.docx', '.txt'];
const ACCEPTED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
];

export function FileUpload({ roomCode, onUploadComplete }: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateFile = (file: File): string | null => {
    const extension = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!ACCEPTED_TYPES.includes(extension) && !ACCEPTED_MIME_TYPES.includes(file.type)) {
      return `Invalid file type. Accepted: ${ACCEPTED_TYPES.join(', ')}`;
    }
    if (file.size > 50 * 1024 * 1024) {
      return 'File size exceeds 50MB limit';
    }
    return null;
  };

  const handleUpload = useCallback(async (file: File) => {
    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsUploading(true);
    setError(null);
    setProgress({ loaded: 0, total: file.size, percentage: 0 });

    try {
      const response = await uploadFile(file, roomCode, setProgress);
      
      onUploadComplete({
        id: Date.now().toString(),
        docId: response.doc_id,
        source: response.source,
        chunkCount: response.chunk_count,
        status: 'success',
        timestamp: new Date(),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      setError(message);
      onUploadComplete({
        id: Date.now().toString(),
        source: file.name,
        chunkCount: 0,
        status: 'error',
        timestamp: new Date(),
        message,
      });
    } finally {
      setIsUploading(false);
      setProgress(null);
    }
  }, [roomCode, onUploadComplete]);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const file = e.dataTransfer.files[0];
    if (file) {
      handleUpload(file);
    }
  }, [handleUpload]);

  const handleFileSelect = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleUpload(file);
    }
    // Reset input so same file can be uploaded again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [handleUpload]);

  return (
    <div className="p-4">
      <h3 className="text-sm font-semibold text-[var(--sidebar-text-secondary)] uppercase tracking-wide mb-3">
        Tải tài liệu lên
      </h3>
      
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !isUploading && fileInputRef.current?.click()}
        className={`
          glass-border rounded-lg p-6 text-center cursor-pointer transition-all duration-200
          ${isDragging 
            ? 'border-[var(--accent)] bg-[var(--accent)]/10 scale-[1.02]' 
            : 'border-[var(--sidebar-border)] hover:border-[var(--sidebar-text-secondary)] hover:bg-[var(--sidebar-bg-light)]'
          }
          ${isUploading ? 'pointer-events-none opacity-60' : ''}
        `}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_TYPES.join(',')}
          onChange={handleFileSelect}
          className="hidden"
        />
        
        {isUploading ? (
          <div className="space-y-2">
            <Loader2 className="w-8 h-8 mx-auto text-[var(--accent)] animate-spin" />
            <p className="text-sm text-[var(--text-secondary)]">
              Đang tải lên... {progress?.percentage ?? 0}%
            </p>
            <div className="w-full bg-[var(--border-primary)] rounded-full h-1.5">
              <div 
                className="bg-[var(--accent)] h-1.5 rounded-full transition-all"
                style={{ width: `${progress?.percentage ?? 0}%` }}
              />
            </div>
          </div>
        ) : (
          <>
            <Upload className="w-8 h-8 mx-auto text-[var(--text-secondary)] mb-2" />
            <p className="text-sm text-[var(--text-secondary)] mb-1">
              Kéo thả file vào đây hoặc click để chọn
            </p>
            <p className="text-xs text-[var(--text-tertiary)]">
              PDF, DOCX, TXT (max 50MB)
            </p>
          </>
        )}
      </div>

      {error && (
        <div className="mt-3 p-2 bg-red-900/30 border border-red-700 rounded text-red-300 text-xs">
          {error}
        </div>
      )}
    </div>
  );
}