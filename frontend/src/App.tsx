import { useCallback, useState, useEffect } from 'react';
import { LogIn, LogOut, User, Link, Check } from 'lucide-react';
import { Sidebar } from './components/Sidebar';
import { ChatWindow } from './components/ChatWindow';
import { ChatInput } from './components/ChatInput';
import { MobileHeader } from './components/MobileHeader';
import { SidebarDrawer } from './components/SidebarDrawer';
import { ThemeToggle } from './components/ThemeToggle';
import { AuthModal } from './components/AuthModal';
import { useChat } from './hooks/useChat';
import { useRoom } from './hooks/useRoom';
import { useAuth } from './hooks/useAuth';

function App() {
  const { roomCode, setRoomCode, copyRoomToClipboard, regenerateRoom } = useRoom();
  const {
    messages,
    isLoading,
    activeDocIds,
    setActiveDocIds,
    sendUserMessage,
    clearMessages,
    stopGeneration,
    regenerateLastAnswer,
  } = useChat(roomCode);
  
  const {
    user,
    isAuthenticated,
    isLoading: isAuthLoading,
    login,
    register,
    forgotPassword,
    logout,
  } = useAuth();

  // Reset active doc selection when room changes (transcript is loaded by useChat)
  useEffect(() => {
    setActiveDocIds([]);
  }, [roomCode, setActiveDocIds]);

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [roomLinkCopied, setRoomLinkCopied] = useState(false);

  const handleAskAboutDoc = useCallback((docId: string, source: string) => {
    // Select only this document and ask about it
    setActiveDocIds([docId]);
    sendUserMessage(`Cho tôi biết nội dung của "${source}"`);
  }, [setActiveDocIds, sendUserMessage]);

  const openSidebar = useCallback(() => setIsSidebarOpen(true), []);
  const closeSidebar = useCallback(() => setIsSidebarOpen(false), []);

  const handleShareRoom = useCallback(() => {
    if (navigator.clipboard) {
      copyRoomToClipboard();
      setRoomLinkCopied(true);
      setTimeout(() => setRoomLinkCopied(false), 2000);
    } else {
      copyRoomToClipboard();
    }
  }, [copyRoomToClipboard]);

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--bg-primary)]">
      {/* Desktop Sidebar */}
      <div className="desktop-only h-full">
        <Sidebar
          roomCode={roomCode}
          isAuthenticated={isAuthenticated}
          onSelectRoom={setRoomCode}
          onClearChat={clearMessages}
          activeDocIds={activeDocIds}
          onActiveDocsChange={setActiveDocIds}
          onAskAboutDoc={handleAskAboutDoc}
          onRegenerateRoom={regenerateRoom}
        />
      </div>

      <SidebarDrawer
        roomCode={roomCode}
        isAuthenticated={isAuthenticated}
        onSelectRoom={setRoomCode}
        isOpen={isSidebarOpen}
        onClose={closeSidebar}
        onClearChat={clearMessages}
        activeDocIds={activeDocIds}
        onActiveDocsChange={setActiveDocIds}
        onAskAboutDoc={handleAskAboutDoc}
        onRegenerateRoom={regenerateRoom}
      />

      <main className="flex-1 flex flex-col min-w-0 min-h-0">
        {/* Mobile Header */}
        <MobileHeader
          onMenuClick={openSidebar}
          onClearChat={clearMessages}
          messageCount={messages.length}
        />

        {/* Desktop Header */}
        <header className="glass-surface border-b border-[var(--border-primary)] px-6 py-4 desktop-only flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">Trò chuyện</h2>
              <p className="text-sm text-[var(--text-secondary)]">
                {messages.length === 0 
                  ? 'Tải tài liệu lên và bắt đầu đặt câu hỏi'
                  : `${messages.length} tin nhắn trong cuộc trò chuyện này`
                }
              </p>
            </div>
            <div className="flex items-center gap-3">
              {/* Room Control */}
              <span
                className="text-xs px-2 py-1 rounded bg-[var(--bg-tertiary)] text-[var(--text-secondary)]"
                title="Phòng là không gian tài liệu riêng của bạn. Chia sẻ liên kết để người khác cùng truy cập."
              >
                Phòng {roomCode}
              </span>
              <button
                onClick={handleShareRoom}
                className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                title="Chia sẻ phòng"
              >
                {roomLinkCopied ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    Đã sao chép liên kết
                  </>
                ) : (
                  <Link className="w-3.5 h-3.5" />
                )}
              </button>

              {/* Auth Control */}
              {!isAuthLoading && (
                isAuthenticated && user ? (
                  <div className="flex items-center gap-2">
                    <span
                      className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-[var(--bg-tertiary)] text-[var(--text-secondary)] max-w-[12rem]"
                      title={user.email}
                    >
                      <User className="w-3.5 h-3.5 flex-shrink-0" />
                      <span className="truncate">{user.email}</span>
                    </span>
                    <button
                      onClick={logout}
                      className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                      title="Đăng xuất"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      Đăng xuất
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setAuthModalOpen(true)}
                    className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                    title="Đăng nhập"
                  >
                    <LogIn className="w-3.5 h-3.5" />
                    Đăng nhập
                  </button>
                )
              )}

              <ThemeToggle />
            </div>
          </div>
        </header>

        <ChatWindow
          messages={messages}
          isLoading={isLoading}
          hasActiveDocuments={activeDocIds.length > 0}
          onSuggestionClick={sendUserMessage}
          onRetry={sendUserMessage}
          onRegenerate={regenerateLastAnswer}
        />

        <div className="md:relative chat-input-fixed md:chat-input-fixed-reset">
          <ChatInput onSend={sendUserMessage} isLoading={isLoading} onStop={stopGeneration} />
        </div>
      </main>

      <AuthModal
        open={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onLogin={login}
        onRegister={register}
        onForgotPassword={forgotPassword}
      />
    </div>
  );
}

export default App;