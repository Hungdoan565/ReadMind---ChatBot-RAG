import { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { FileText, Globe } from 'lucide-react';
import type { SourceDocument } from '../types';
import { SourcePopover } from './SourcePopover';

interface SourceChipProps {
  source: SourceDocument;
  onAskAbout?: () => void;
}

// File type icon mapping
function getSourceIcon(source: string) {
  if (source.startsWith('http://') || source.startsWith('https://')) {
    return { icon: Globe, color: 'text-emerald-400' };
  }
  return { icon: FileText, color: 'text-blue-400' };
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

export function SourceChip({ source, onAskAbout }: SourceChipProps) {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const chipRef = useRef<HTMLButtonElement>(null);
  
  const { icon: Icon, color } = getSourceIcon(source.source);
  const fileName = getFileName(source.source);

  return (
    <>
      <motion.button
        ref={chipRef}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => setIsPopoverOpen(true)}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full
                   glass-border bg-[var(--bg-secondary)] text-[var(--text-secondary)]
                   hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]
                   transition-colors text-xs cursor-pointer"
      >
        <Icon className={`w-3 h-3 ${color}`} />
        <span className="max-w-[120px] truncate">{fileName}</span>
        {source.page !== undefined && (
          <span className="text-[var(--text-tertiary)]">p.{source.page}</span>
        )}
      </motion.button>

      <SourcePopover
        source={source}
        isOpen={isPopoverOpen}
        onClose={() => setIsPopoverOpen(false)}
        onAskAbout={onAskAbout}
        anchorRef={chipRef}
      />
    </>
  );
}
