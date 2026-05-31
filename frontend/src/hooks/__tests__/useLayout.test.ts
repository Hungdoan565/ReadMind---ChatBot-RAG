import { renderHook, act } from '@testing-library/react';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { useLayout, usePrefersReducedMotion } from '../useLayout';
import type { LayoutState } from '../../types';

/**
 * Example-based unit tests (Vitest + Testing Library `renderHook`) for the
 * `useLayout` hook and its `usePrefersReducedMotion` companion.
 *
 * Covers: collapse toggles persist to `readmind_layout` and restore on a fresh
 * mount, one-drawer-at-a-time drawer semantics, and reduced-motion detection via
 * a mocked `window.matchMedia`.
 *
 * Requirements: 1.6, 1.7, 13.2, 15.3
 */

const LAYOUT_KEY = 'readmind_layout';

/**
 * Install a `window.matchMedia` stub (jsdom does not implement it). `matches`
 * controls what `(prefers-reduced-motion: reduce)` reports. Mirrors the stub
 * pattern used in `MessageBubble.test.tsx`.
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

function readPersistedLayout(): LayoutState | null {
  const raw = localStorage.getItem(LAYOUT_KEY);
  return raw ? (JSON.parse(raw) as LayoutState) : null;
}

describe('useLayout', () => {
  beforeEach(() => {
    localStorage.clear();
    // Default: motion allowed. Individual tests can re-stub as needed.
    stubMatchMedia(false);
  });

  describe('collapse persistence', () => {
    it('persists collapse toggles to readmind_layout', () => {
      const { result } = renderHook(() => useLayout());

      expect(result.current.leftCollapsed).toBe(false);
      expect(result.current.rightCollapsed).toBe(false);

      act(() => {
        result.current.toggleLeft();
      });
      expect(result.current.leftCollapsed).toBe(true);
      expect(readPersistedLayout()).toEqual({ leftCollapsed: true, rightCollapsed: false });

      act(() => {
        result.current.toggleRight();
      });
      expect(result.current.rightCollapsed).toBe(true);
      expect(readPersistedLayout()).toEqual({ leftCollapsed: true, rightCollapsed: true });
    });

    it('restores persisted collapse state on a fresh mount', () => {
      localStorage.setItem(
        LAYOUT_KEY,
        JSON.stringify({ leftCollapsed: true, rightCollapsed: false }),
      );

      const { result } = renderHook(() => useLayout());

      expect(result.current.leftCollapsed).toBe(true);
      expect(result.current.rightCollapsed).toBe(false);
    });

    it('defaults both regions to expanded when nothing is persisted', () => {
      const { result } = renderHook(() => useLayout());

      expect(result.current.leftCollapsed).toBe(false);
      expect(result.current.rightCollapsed).toBe(false);
    });
  });

  describe('drawer semantics (one open at a time)', () => {
    it('opening the right drawer after the left leaves only the right open', () => {
      const { result } = renderHook(() => useLayout());

      expect(result.current.openDrawer).toBeNull();

      act(() => {
        result.current.openLeftDrawer();
      });
      expect(result.current.openDrawer).toBe('left');

      act(() => {
        result.current.openRightDrawer();
      });
      expect(result.current.openDrawer).toBe('right');
    });

    it('closeDrawer sets the open drawer back to null', () => {
      const { result } = renderHook(() => useLayout());

      act(() => {
        result.current.openLeftDrawer();
      });
      expect(result.current.openDrawer).toBe('left');

      act(() => {
        result.current.closeDrawer();
      });
      expect(result.current.openDrawer).toBeNull();
    });
  });

  describe('usePrefersReducedMotion', () => {
    it('returns true when matchMedia reports a reduced-motion preference', () => {
      stubMatchMedia(true);

      const { result } = renderHook(() => usePrefersReducedMotion());

      expect(result.current).toBe(true);
    });

    it('returns false when matchMedia reports no reduced-motion preference', () => {
      stubMatchMedia(false);

      const { result } = renderHook(() => usePrefersReducedMotion());

      expect(result.current).toBe(false);
    });
  });
});
