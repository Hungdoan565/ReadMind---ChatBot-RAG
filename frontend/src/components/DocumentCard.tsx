import { motion } from 'framer-motion';
import { FileText, Globe, File, Check, Loader2, Trash2, MessageSquare } from 'lucide-react';

interface DocumentCardProps {
  docId: string;
  source: string;
  chunkCount: number;
  fileSize?: number;
  isSelected: boolean;
  isDeleting: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onAskAbout: () => void;
}

// File type icon mapping
function getFileIcon(source: string) {
  const extension = source.split('.').pop()?.toLowerCase();
  
  // URL sources
  if (source.startsWith('http://') || source.startsWith('https://')) {
    return { icon: Globe, color: 'text-emerald-400', bgColor: 'bg-emerald-400/10' };
  }
  
  // PDF
  if (extension === 'pdf') {
    return { icon: FileText, color: 'text-red-400', bgColor: 'bg-red-400/10' };
  }
  
  // Text/Markdown
  if (extension === 'txt' || extension === 'md') {
    return { icon: FileText, color: 'text-blue-400', bgColor: 'bg-blue-400/10' };
  }
  
  // DOCX
  if (extension === 'docx') {
    return { icon: FileText, color: 'text-blue-500', bgColor: 'bg-blue-500/10' };
  }
  
  // Default
  return { icon: File, color: 'text-gray-400', bgColor: 'bg-gray-400/10' };
}

function getFileName(source: string): string {
  // For URLs, try to get a meaningful name
  if (source.startsWith('http://') || source.startsWith('https://')) {
    try {
      const url = new URL(source);
      const pathname = url.pathname;
      const lastSegment = pathname.split('/').filter(Boolean).pop();
      return lastSegment || url.hostname;
    } catch {
      return source;
    }
  }
  
  // For files, get just the filename
  const parts = source.split(/[/\\]/);
  return parts[parts.length - 1] || source;
}

function formatFileSize(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DocumentCard({
  source,
  chunkCount,
  fileSize,
  isSelected,
  isDeleting,
  onToggle,
  onDelete,
  onAskAbout,
}: DocumentCardProps) {
  const { icon: Icon, color, bgColor } = getFileIcon(source);
  const fileName = getFileName(source);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.2 }}
      className={`
        group relative glass-border rounded-xl p-3 cursor-pointer
        transition-all duration-200
        ${isSelected 
          ? 'bg-[var(--accent)]/10 border-[var(--accent)]/40 ring-1 ring-[var(--accent)]/20' 
          : 'bg-[var(--bg-secondary)] border-[var(--border-primary)] hover:border-[var(--border-secondary)] hover:bg-[var(--bg-tertiary)]'
        }
        ${isDeleting ? 'opacity-50 pointer-events-none' : ''}
      `}
      onClick={onToggle}
    >
      {/* Selection check overlay */}
      <motion.div
        initial={false}
        animate={{ 
          opacity: isSelected ? 1 : 0,
          scale: isSelected ? 1 : 0.5
        }}
        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-[var(--accent)] flex items-center justify-center shadow-lg"
      >
        <Check className="w-3 h-3 text-white" />
      </motion.div>

      {/* File icon */}
      <div className={`w-10 h-10 rounded-lg ${bgColor} flex items-center justify-center mb-2`}>
        <Icon className={`w-5 h-5 ${color}`} />
      </div>

      {/* File name */}
      <p 
        className={`text-sm font-medium truncate leading-tight mb-1 ${
          isSelected ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'
        }`}
        title={source}
      >
        {fileName}
      </p>

      {/* Metadata */}
      <div className="flex items-center gap-2 text-xs text-[var(--text-tertiary)]">
        <span>{chunkCount} đoạn</span>
        {fileSize && (
          <>
            <span>•</span>
            <span>{formatFileSize(fileSize)}</span>
          </>
        )}
      </div>

      {/* Action buttons (visible on hover) */}
      <div className="absolute bottom-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onAskAbout();
          }}
          className="p-1.5 rounded-md bg-[var(--bg-tertiary)] text-[var(--text-secondary)] 
                     hover:text-[var(--accent)] hover:bg-[var(--accent)]/10 transition-colors"
          title="Hỏi về tài liệu này"
          disabled={isDeleting}
        >
          <MessageSquare className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="p-1.5 rounded-md bg-[var(--bg-tertiary)] text-[var(--text-secondary)] 
                     hover:text-[var(--error)] hover:bg-[var(--error)]/10 transition-colors"
          title="Xóa tài liệu"
          disabled={isDeleting}
        >
          {isDeleting ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Trash2 className="w-3.5 h-3.5" />
          )}
        </button>
      </div>
    </motion.div>
  );
}
