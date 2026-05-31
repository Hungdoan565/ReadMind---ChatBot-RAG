import { useState, useCallback } from 'react';
import { Plus, RefreshCw, BookmarkPlus, Loader2 } from 'lucide-react';
import { DocumentLogoIcon } from './DocumentLogoIcon';
import { FileUpload } from './FileUpload';
import { UrlIngest } from './UrlIngest';
import { NotionIngest } from './NotionIngest';
import { DocumentList } from './DocumentList';
import { MyRooms } from './MyRooms';
import { ConfirmDialog } from './ConfirmDialog';
import { claimRoom } from '../api/rooms';
import type { IngestHistoryItem } from '../types';

const ONBOARDED_KEY = 'readmind_room_onboarded';

interface ClaimMessage {
  type: 'success' | 'error';
  text: string;
}

interface SidebarProps {
  roomCode: string;
  isAuthenticated: boolean;
  onSelectRoom: (roomCode: string) => void;
  onClearChat: () => void;
  activeDocIds: string[];
  onActiveDocsChange: (ids: string[]) => void;
  onAskAboutDoc: (docId: string, source: string) => void;
  onRegenerateRoom: () => void;
}

export function Sidebar({
  roomCode,
  isAuthenticated,
  onSelectRoom,
  onClearChat,
  activeDocIds,
  onActiveDocsChange,
  onAskAboutDoc,
  onRegenerateRoom,
}: SidebarProps) {
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // "My Rooms" reload trigger — bumped after a successful claim so the newly
  // claimed room appears in the list.
  const [roomsRefresh, setRoomsRefresh] = useState(0);
  const [isClaiming, setIsClaiming] = useState(false);
  const [claimMessage, setClaimMessage] = useState<ClaimMessage | null>(null);

  // Onboarding: show explainer on first visit
  const [showOnboarding, setShowOnboarding] = useState<boolean>(() => {
    try {
      return !localStorage.getItem(ONBOARDED_KEY);
    } catch {
      return false;
    }
  });

  // Confirm dialog for "Phòng mới"
  const [confirmNewRoom, setConfirmNewRoom] = useState(false);

  const handleIngestComplete = useCallback((item: IngestHistoryItem) => {
    if (item.status === 'success') {
      // Trigger document list refresh when upload completes
      setRefreshTrigger((prev) => prev + 1);
    }
  }, []);

  const handleDismissOnboarding = () => {
    try {
      localStorage.setItem(ONBOARDED_KEY, '1');
    } catch {
      // ignore
    }
    setShowOnboarding(false);
  };

  const handleNewRoomConfirm = () => {
    setConfirmNewRoom(false);
    onRegenerateRoom();
  };

  const handleClaimRoom = useCallback(async () => {
    if (!roomCode) return;
    setIsClaiming(true);
    setClaimMessage(null);
    try {
      await claimRoom(roomCode);
      // Reload "My Rooms" so the just-claimed room shows up.
      setRoomsRefresh((n) => n + 1);
      setClaimMessage({ type: 'success', text: 'Đã lưu phòng vào tài khoản.' });
    } catch {
      setClaimMessage({ type: 'error', text: 'Không thể lưu phòng.' });
    } finally {
      setIsClaiming(false);
    }
  }, [roomCode]);

  return (
    <aside className="w-80 glass-surface flex flex-col h-full overflow-y-auto border-r border-[var(--sidebar-border)] bg-[var(--sidebar-bg)] z-[var(--z-sidebar)]">
      {/* Header with gradient overlay */}
      <div className="relative p-4 border-b border-[var(--sidebar-border)] overflow-hidden flex-shrink-0">
        {/* Subtle gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-[var(--accent)]/10 to-transparent pointer-events-none" />
        
        <div className="relative flex items-center gap-3">
          <DocumentLogoIcon size={32} className="animate-pulse text-[var(--accent)]" />
          <div>
            <h1 className="text-lg font-bold text-[var(--sidebar-text)]">ReadMind</h1>
            <p className="text-xs text-[var(--sidebar-text-secondary)]">Hỏi đáp về tài liệu của bạn</p>
          </div>
        </div>
      </div>

      {/* Onboarding explainer — shown once on first visit */}
      {showOnboarding && (
        <div className="mx-4 mt-4 p-3 rounded-xl bg-[var(--accent)]/10 border border-[var(--accent)]/30 text-xs text-[var(--sidebar-text-secondary)] leading-relaxed">
          <p className="font-semibold text-[var(--sidebar-text)] mb-1">Chào mừng đến với ReadMind!</p>
          <p>
            Mỗi <strong>Phòng</strong> là một không gian riêng biệt. Tải tài liệu lên phòng của bạn,
            sau đó đặt câu hỏi — AI sẽ trả lời dựa trên nội dung đó.
          </p>
          <p className="mt-1">
            Bạn có thể chia sẻ phòng bằng cách gửi đường link cho người khác.
          </p>
          <button
            onClick={handleDismissOnboarding}
            className="mt-2 text-[var(--accent)] hover:text-[var(--accent-hover)] font-medium transition-colors"
          >
            Đã hiểu ✓
          </button>
        </div>
      )}

      {/* Action buttons */}
      <div className="p-4 flex gap-2">
        <button
          onClick={onClearChat}
          className="flex-1 flex items-center justify-center gap-2 glass-border
                     bg-[var(--sidebar-bg-light)] hover:bg-[var(--sidebar-border)]
                     text-[var(--sidebar-text)] rounded-lg px-4 py-2.5 text-sm font-medium
                     transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
        >
          <Plus className="w-4 h-4" />
          Cuộc trò chuyện mới
        </button>

        <button
          onClick={() => setConfirmNewRoom(true)}
          title="Tạo phòng mới (xóa tài liệu và lịch sử hiện tại)"
          className="flex items-center justify-center gap-1 glass-border
                     bg-[var(--sidebar-bg-light)] hover:bg-[var(--sidebar-border)]
                     text-[var(--sidebar-text-secondary)] hover:text-[var(--sidebar-text)]
                     rounded-lg px-3 py-2.5 text-xs font-medium
                     transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Phòng mới
        </button>
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

      {/* My Rooms — only rendered when authenticated (component also self-gates) */}
      <MyRooms
        isAuthenticated={isAuthenticated}
        currentRoomCode={roomCode}
        onSelectRoom={onSelectRoom}
        refreshTrigger={roomsRefresh}
      />

      {/* Confirm new room dialog */}
      <ConfirmDialog
        open={confirmNewRoom}
        title="Tạo phòng mới?"
        message="Hành động này sẽ tạo một phòng mới hoàn toàn trống. Tài liệu và lịch sử trò chuyện trong phòng hiện tại sẽ không còn truy cập được từ đây nữa."
        confirmLabel="Tạo phòng mới"
        cancelLabel="Hủy"
        onConfirm={handleNewRoomConfirm}
        onCancel={() => setConfirmNewRoom(false)}
      />
    </aside>
  );
}
