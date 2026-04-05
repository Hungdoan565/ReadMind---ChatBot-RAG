import { useCallback, useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { ChatWindow } from './components/ChatWindow';
import { ChatInput } from './components/ChatInput';
import { MobileHeader } from './components/MobileHeader';
import { SidebarDrawer } from './components/SidebarDrawer';
import { ThemeToggle } from './components/ThemeToggle';
import { useChat } from './hooks/useChat';
import { useRoom } from './hooks/useRoom';

function App() {
  const { roomCode, copyRoomToClipboard } = useRoom();
  const {
    messages,
    isLoading,
    activeDocIds,
    setActiveDocIds,
    sendUserMessage,
    clearMessages,
  } = useChat(roomCode);
  
  // Clear state when room changes
  useEffect(() => {
    setActiveDocIds([]);
    clearMessages();
  }, [roomCode, setActiveDocIds, clearMessages]);

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const handleAskAboutDoc = useCallback((docId: string, source: string) => {
    // Select only this document and ask about it
    setActiveDocIds([docId]);
    sendUserMessage(`Tell me about the contents of "${source}"`);
  }, [setActiveDocIds, sendUserMessage]);

  const openSidebar = useCallback(() => setIsSidebarOpen(true), []);
  const closeSidebar = useCallback(() => setIsSidebarOpen(false), []);

  return (
    <div className="flex h-screen bg-[var(--bg-primary)]">
      {/* Desktop Sidebar */}
      <div className="desktop-only">
        <Sidebar
          roomCode={roomCode}
          onClearChat={clearMessages}
          activeDocIds={activeDocIds}
          onActiveDocsChange={setActiveDocIds}
          onAskAboutDoc={handleAskAboutDoc}
        />
      </div>

      <SidebarDrawer
        roomCode={roomCode}
        isOpen={isSidebarOpen}
        onClose={closeSidebar}
        onClearChat={clearMessages}
        activeDocIds={activeDocIds}
        onActiveDocsChange={setActiveDocIds}
        onAskAboutDoc={handleAskAboutDoc}
      />

      <main className="flex-1 flex flex-col min-w-0">
        {/* Mobile Header */}
        <MobileHeader
          onMenuClick={openSidebar}
          onClearChat={clearMessages}
          messageCount={messages.length}
        />

        {/* Desktop Header */}
        <header className="glass-surface border-b border-[var(--border-primary)] px-6 py-4 desktop-only">
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
              <button
                onClick={copyRoomToClipboard}
                className="text-xs px-2 py-1 rounded bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                title="Copy shareable link"
              >
                Phòng: {roomCode}
              </button>
              <ThemeToggle />
            </div>
          </div>
        </header>

        <ChatWindow
          messages={messages}
          isLoading={isLoading}
          hasActiveDocuments={activeDocIds.length > 0}
        />

        {/* Chat Input - fixed on mobile */}
        <div className="md:relative chat-input-fixed md:chat-input-fixed-reset">
          <ChatInput onSend={sendUserMessage} isLoading={isLoading} />
        </div>
      </main>
    </div>
  );
}

export default App;