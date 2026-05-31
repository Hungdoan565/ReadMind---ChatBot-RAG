import { beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RoomSwitcher } from '../RoomSwitcher';

// Mock the rooms API so the embedded MyRooms list issues no real network request.
vi.mock('../../api/rooms', () => ({
  getRooms: vi.fn().mockResolvedValue([]),
  claimRoom: vi.fn(),
}));

import { getRooms } from '../../api/rooms';

/**
 * Component test (example-based, Testing Library) for RoomSwitcher.
 * Covers opening the menu (showing "Phòng mới" and "Chia sẻ phòng") and gating the
 * embedded MyRooms list on authentication.
 *
 * Validates: Requirements 2.2, 2.3, 5.4
 */

function renderSwitcher(isAuthenticated: boolean) {
  return render(
    <RoomSwitcher
      roomCode="ROOM-123"
      isAuthenticated={isAuthenticated}
      onSelectRoom={vi.fn()}
      onNewRoom={vi.fn()}
      onShareRoom={vi.fn()}
    />,
  );
}

describe('RoomSwitcher', () => {
  beforeEach(() => {
    vi.mocked(getRooms).mockResolvedValue([]);
    // jsdom does not implement matchMedia, used indirectly by framer-motion.
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  it('nhấn pill mở menu hiển thị "Phòng mới" và "Chia sẻ phòng"', async () => {
    const user = userEvent.setup();
    renderSwitcher(false);

    // Menu closed initially.
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    // The pill's accessible name comes from its visible text ("Phòng <code>").
    await user.click(screen.getByRole('button', { name: /Phòng ROOM-123/ }));

    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Phòng mới' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Chia sẻ phòng' })).toBeInTheDocument();
  });

  it('không hiển thị MyRooms khi chưa đăng nhập', async () => {
    const user = userEvent.setup();
    renderSwitcher(false);

    await user.click(screen.getByRole('button', { name: /Phòng ROOM-123/ }));

    expect(screen.queryByText('Phòng của tôi')).not.toBeInTheDocument();
    expect(getRooms).not.toHaveBeenCalled();
  });

  it('hiển thị MyRooms khi đã đăng nhập', async () => {
    const user = userEvent.setup();
    renderSwitcher(true);

    await user.click(screen.getByRole('button', { name: /Phòng ROOM-123/ }));

    expect(await screen.findByText('Phòng của tôi')).toBeInTheDocument();
  });
});
