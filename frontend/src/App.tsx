import { useCallback, useState } from 'react';
import {
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
} from 'lucide-react';
import { ConversationSidebar } from './components/ConversationSidebar';
import { DocumentPanel } from './components/DocumentPanel';
import { Drawer } from './components/Drawer';
import { ChatWindow } from './components/ChatWindow';
import { ChatInput } from './components/ChatInput';
import { MobileHeader } from './components/MobileHeader';
import { AuthModal } from './components/AuthModal';
import { useRoom } from './hooks/useRoom';
import { useLayout } from './hooks/useLayout';
import { useConversations } from './hooks/useConversations';
import { useDocumentSelection } from './hooks/useDocumentSelection';
import { useChat } from './hooks/useChat';
import { useAuth } from './hooks/useAuth';

/**
 * Layout_Manager host. Arranges the three regions of the conversation-centric
 * redesign:
 *
 * - Desktop (>=1024px): `ConversationSidebar` (left), the chat surface (center,
 *   grows to fill), and `DocumentPanel` (right) render side by side. Each side
 *   region collapses/expands via the header toggles, with state persisted by
 *   `useLayout`.
 * - Mobile (<1024px): the chat surface is full width; the left and right regions
 *   mount inside slide-over `Drawer`s, with one-open-at-a-time enforced by
 *   `useLayout`.
 *
 * The streaming engine in `useChat` is untouched; this component only wires the
 * domain hooks together and forwards a `wrappedSend` that records conversation
 * activity (title + `updatedAt`) before delegating to `sendUserMessage`.
 */
function App() {
  const { roomCode, setRoomCode, copyRoomToClipboard, regenerateRoom } = useRoom();

  const {
    leftCollapsed,
    rightCollapsed,
    toggleLeft,
    toggleRight,
    openDrawer,
    openLeftDrawer,
    openRightDrawer,
    closeDrawer,
  } = useLayout();

  const {
    activeConversationId,
    searchTerm,
    filteredConversations,
    setSearchTerm,
    selectConversation,
    createConversation,
    renameConversation,
    deleteConversation,
    noteSend,
  } = useConversations(roomCode);

  const { activeDocIds, setActiveDocIds } = useDocumentSelection(roomCode);

  const {
    messages,
    isLoading,
    sendUserMessage,
    stopGeneration,
    regenerateLastAnswer,
  } = useChat(roomCode, activeConversationId, activeDocIds);

  const {
    user,
    isAuthenticated,
    isLoading: isAuthLoading,
    login,
    register,
    forgotPassword,
    logout,
  } = useAuth();

  const [authModalOpen, setAuthModalOpen] = useState(false);

  // Record conversation activity (title from the first user message + bump
  // updatedAt) before handing off to the unchanged streaming engine.
  const wrappedSend = useCallback(
    async (text: string) => {
      const isFirstUserMessage = messages.every((m) => m.role !== 'user');
      if (activeConversationId) {
        noteSend(activeConversationId, isFirstUserMessage ? text : undefined);
      }
      await sendUserMessage(text);
    },
    [messages, activeConversationId, noteSend, sendUserMessage],
  );

  // Switching the active conversation: stop any in-flight stream first so it can
  // never write tokens into the wrong conversation's transcript.
  const handleSelectConversation = useCallback(
    (id: string) => {
      stopGeneration();
      selectConversation(id);
    },
    [stopGeneration, selectConversation],
  );

  const handleNewConversation = useCallback(() => {
    stopGeneration();
    createConversation();
  }, [stopGeneration, createConversation]);

  const openAuthModal = useCallback(() => setAuthModalOpen(true), []);

  const handleAskAboutDoc = useCallback(
    (docId: string, source: string) => {
      // Select only this document and ask about it.
      setActiveDocIds([docId]);
      void wrappedSend(`Cho tôi biết nội dung của "${source}"`);
    },
    [setActiveDocIds, wrappedSend],
  );

  // Shared props for the conversation sidebar (rendered inline on desktop and
  // inside the left drawer on mobile).
  const conversationSidebar = (
    <ConversationSidebar
      roomCode={roomCode}
      isAuthenticated={isAuthenticated}
      conversations={filteredConversations}
      activeConversationId={activeConversationId}
      searchTerm={searchTerm}
      onSearchChange={setSearchTerm}
      onSelectConversation={handleSelectConversation}
      onNewConversation={handleNewConversation}
      onRenameConversation={renameConversation}
      onDeleteConversation={deleteConversation}
      onSelectRoom={setRoomCode}
      onNewRoom={regenerateRoom}
      onShareRoom={copyRoomToClipboard}
      user={isAuthLoading ? null : user}
      onLogin={openAuthModal}
      onLogout={logout}
    />
  );

  const documentPanel = (
    <DocumentPanel
      roomCode={roomCode}
      isAuthenticated={isAuthenticated}
      activeDocIds={activeDocIds}
      onActiveDocsChange={setActiveDocIds}
      onAskAboutDoc={handleAskAboutDoc}
    />
  );

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--bg-primary)]">
      {/* Desktop LEFT region — Conversation_Sidebar (collapsible) */}
      {!leftCollapsed && (
        <div className="desktop-only h-full w-80 flex-shrink-0">{conversationSidebar}</div>
      )}

      {/* CENTER region — Chat_Surface (grows to fill) */}
      <main className="flex-1 flex flex-col min-w-0 min-h-0">
        {/* Mobile header: hamburger opens the left drawer, file icon the right */}
        <MobileHeader
          onMenuClick={openLeftDrawer}
          onDocumentsClick={openRightDrawer}
          messageCount={messages.length}
        />

        {/* Desktop header: minimal — collapse/expand controls for both regions */}
        <header className="glass-surface border-b border-[var(--border-primary)] px-4 py-3 desktop-only flex-shrink-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={toggleLeft}
                aria-label={
                  leftCollapsed
                    ? 'Mở thanh cuộc trò chuyện'
                    : 'Thu gọn thanh cuộc trò chuyện'
                }
                title={
                  leftCollapsed
                    ? 'Mở thanh cuộc trò chuyện'
                    : 'Thu gọn thanh cuộc trò chuyện'
                }
                className="flex items-center justify-center rounded-lg p-2 text-[var(--text-secondary)]
                           transition-colors hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]
                           focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              >
                {leftCollapsed ? (
                  <PanelLeftOpen className="h-5 w-5" />
                ) : (
                  <PanelLeftClose className="h-5 w-5" />
                )}
              </button>
              <h2 className="text-base font-semibold text-[var(--text-primary)]">Trò chuyện</h2>
            </div>

            <button
              type="button"
              onClick={toggleRight}
              aria-label={
                rightCollapsed ? 'Mở bảng tài liệu' : 'Thu gọn bảng tài liệu'
              }
              title={rightCollapsed ? 'Mở bảng tài liệu' : 'Thu gọn bảng tài liệu'}
              className="flex items-center justify-center rounded-lg p-2 text-[var(--text-secondary)]
                         transition-colors hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]
                         focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            >
              {rightCollapsed ? (
                <PanelRightOpen className="h-5 w-5" />
              ) : (
                <PanelRightClose className="h-5 w-5" />
              )}
            </button>
          </div>
        </header>

        <ChatWindow
          messages={messages}
          isLoading={isLoading}
          hasActiveDocuments={activeDocIds.length > 0}
          onSuggestionClick={wrappedSend}
          onRetry={wrappedSend}
          onRegenerate={regenerateLastAnswer}
        />

        <div className="md:relative chat-input-fixed md:chat-input-fixed-reset">
          <ChatInput onSend={wrappedSend} isLoading={isLoading} onStop={stopGeneration} />
        </div>
      </main>

      {/* Desktop RIGHT region — Document_Panel (collapsible) */}
      {!rightCollapsed && (
        <div className="desktop-only h-full flex-shrink-0">{documentPanel}</div>
      )}

      {/* Mobile drawers — at most one open (enforced by useLayout) */}
      <Drawer
        side="left"
        isOpen={openDrawer === 'left'}
        onClose={closeDrawer}
        ariaLabel="Thanh cuộc trò chuyện"
      >
        {conversationSidebar}
      </Drawer>

      <Drawer
        side="right"
        isOpen={openDrawer === 'right'}
        onClose={closeDrawer}
        ariaLabel="Bảng tài liệu"
      >
        {documentPanel}
      </Drawer>

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
