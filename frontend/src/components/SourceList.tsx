import type { SourceDocument } from '../types';
import { SourceChip } from './SourceChip';

interface SourceListProps {
  sources: SourceDocument[];
  onAskAboutSource?: (source: SourceDocument) => void;
}

export function SourceList({ sources, onAskAboutSource }: SourceListProps) {
  if (sources.length === 0) return null;

  return (
    <div className="mt-3 pt-3 border-t border-[var(--border-primary)]/30">
      <p className="text-xs text-[var(--text-tertiary)] mb-2">
        Nguồn ({sources.length})
      </p>
      <div className="flex flex-wrap gap-2">
        {sources.map((source, index) => (
          <SourceChip
            key={index}
            source={source}
            onAskAbout={onAskAboutSource ? () => onAskAboutSource(source) : undefined}
          />
        ))}
      </div>
    </div>
  );
}
