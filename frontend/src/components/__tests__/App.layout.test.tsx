import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import App from '../../App';
import { ThemeProvider } from '../ThemeProvider';

/**
 * Layout/integration test (example-based, Testing Library) for the three-region
 * `Layout_Manager` composition in `App.tsx`.
 *
 * This exercises the *whole* App wiring (useRoom + useLayout + useConversations +
 * useDocumentSelection + useChat + useAuth) rather than any single component, so
 * the network-touching API modules are mocked to keep the test deterministic and
 * offline. jsdom has no real viewport width, so we assert the presence of the
 * region controls and the persistence side effect instead of pixel breakpoints.
 *
 * Validates: Requirements 1.1, 1.3, 1.4, 1.5, 1.6, 13.1, 13.2, 15.3
 */

// --- Offline mocks for every network-touching module the App tree imports -----

// Documents: DocumentList fetches on mount; deleteDocument is a no-op here.
vi.mock('../../api/ingest', () => ({
  getDocuments: vi.fn(async () => ({ documents: [], total: 0 })),
  deleteDocument: vi.fn(async () => undefined),
  uploadFile: vi.fn(async () => ({})),
  ingestUrl: vi.fn(async () => ({})),
  ingestNotionPage: vi.fn(async () => ({})),
  ingestNotionDatabase: vi.fn(async () => ({})),
}));

// Rooms: MyRooms only calls getRooms when authenticated (we resolve anonymous).
vi.mock('../../api/rooms', () => ({
  getRooms: vi.fn(async () => []),
  claimRoom: vi.fn(async () => ({ room_code: 'TEST-ROOM', status: 'claimed' })),
}));

// Auth: getMe rejects → useAuth settles to the anonymous (unauthenticated) state.
vi.mock('../../api/auth', () => ({
  getMe: vi.fn(async () => {
    throw new Error('Unauthorized');
  }),
  login: vi.fn(async () => undefined),
  register: vi.fn(async () => undefined),
  forgotPassword: vi.fn(async () => undefined),
  logout: vi.fn(async () => undefined),
}));

// Chat: streamMessage is a no-op async generator (no SSE during layout tests).
vi.mock('../../api/chat', () => ({
  // eslint-disable-next-line require-yield
  streamMessage: vi.fn(async function* () {
    // yields nothing
  }),
  sendMessage: vi.fn(async () => ({})),
}));

const CHAT_INPUT_PLACEHOLDER = 'Đặt câu hỏi về tài liệu của bạn...';
const LAYOUT_STORAGE_KEY = 'readmind_layout';

/**
 * Stub `window.matchMedia` (jsdom does not implement it). ThemeProvider and the
 * reduced-motion checks both rely on it. `matches` drives both
 * `prefers-color-scheme` and `prefers-reduced-motion` for the smoke case.
 */
function stubMatchMedia(matches: boolean): void {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

function renderApp() {
  return render(
    <ThemeProvider>
      <App />
    </ThemeProvider>,
  );
}

describe('App layout (three-region Layout_Manager)', () => {
  beforeEach(() => {
    stubMatchMedia(false);
    // jsdom does not implement scrollIntoView, which ChatWindow calls on mount.
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  it('renders without crashing with the chat input and a "Cuộc trò chuyện mới" control', async () => {
    renderApp();

    // Center region: the chat input is mounted once.
    expect(
      await screen.findByPlaceholderText(CHAT_INPUT_PLACEHOLDER),
    ).toBeInTheDocument();

    // Left region: the prominent new-conversation action is present.
    expect(
      screen.getByRole('button', { name: 'Cuộc trò chuyện mới' }),
    ).toBeInTheDocument();
  });

  it('exposes the desktop collapse toggles for both side regions', async () => {
    renderApp();
    await screen.findByPlaceholderText(CHAT_INPUT_PLACEHOLDER);

    // Both regions start expanded, so the toggles read "Thu gọn ...".
    expect(
      screen.getByLabelText('Thu gọn thanh cuộc trò chuyện'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Thu gọn bảng tài liệu')).toBeInTheDocument();
  });

  it('persists the left collapse state to readmind_layout when toggled', async () => {
    renderApp();

    const leftToggle = await screen.findByLabelText(
      'Thu gọn thanh cuộc trò chuyện',
    );

    fireEvent.click(leftToggle);

    // useLayout persists { leftCollapsed, rightCollapsed } on change (Req 1.6).
    await waitFor(() => {
      const raw = localStorage.getItem(LAYOUT_STORAGE_KEY);
      expect(raw).not.toBeNull();
      const stored = JSON.parse(raw as string) as {
        leftCollapsed: boolean;
        rightCollapsed: boolean;
      };
      expect(stored.leftCollapsed).toBe(true);
    });

    // The collapsed region flips the toggle to the "Mở ..." affordance.
    expect(
      screen.getByLabelText('Mở thanh cuộc trò chuyện'),
    ).toBeInTheDocument();
  });

  it('still renders when prefers-reduced-motion matches (smoke)', async () => {
    stubMatchMedia(true);
    renderApp();

    expect(
      await screen.findByPlaceholderText(CHAT_INPUT_PLACEHOLDER),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Cuộc trò chuyện mới' }),
    ).toBeInTheDocument();
  });
});
