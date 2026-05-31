import { useState, useCallback, useEffect } from 'react';
import type { LayoutState } from '../types';

// ---------------------------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------------------------

const LAYOUT_STORAGE_KEY = 'readmind_layout';

const DEFAULT_LAYOUT: LayoutState = { leftCollapsed: false, rightCollapsed: false };

/**
 * Load the persisted layout collapse state. Defaults both regions to expanded
 * (Requirement 1.7). Does not inspect the viewport width, so it never
 * auto-expands a region below 1024px (where drawer mode applies).
 */
function loadLayoutState(): LayoutState {
  try {
    const raw = localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_LAYOUT };
    const parsed = JSON.parse(raw) as Partial<LayoutState>;
    return {
      leftCollapsed:
        typeof parsed.leftCollapsed === 'boolean' ? parsed.leftCollapsed : false,
      rightCollapsed:
        typeof parsed.rightCollapsed === 'boolean' ? parsed.rightCollapsed : false,
    };
  } catch {
    // Storage unavailable or malformed JSON — fall back to defaults.
    return { ...DEFAULT_LAYOUT };
  }
}

/**
 * Persist the layout collapse state under `readmind_layout` (Requirement 1.6).
 * Silent on failure (quota exceeded or storage unavailable).
 */
function saveLayoutState(state: LayoutState): void {
  try {
    localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage quota or unavailable — silently ignore.
  }
}

// ---------------------------------------------------------------------------
// Reduced-motion helper
// ---------------------------------------------------------------------------

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

function readPrefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  try {
    return window.matchMedia(REDUCED_MOTION_QUERY).matches;
  } catch {
    return false;
  }
}

/**
 * Track the user's `prefers-reduced-motion` setting via `matchMedia`
 * (Requirement 15.3). Consumers use the returned boolean to zero transition
 * durations for region/drawer animations. `matchMedia` is mockable so tests can
 * drive both states.
 */
export function usePrefersReducedMotion(): boolean {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState<boolean>(
    () => readPrefersReducedMotion(),
  );

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }
    const mediaQuery = window.matchMedia(REDUCED_MOTION_QUERY);
    // Sync in case the preference changed between the initial read and mount.
    setPrefersReducedMotion(mediaQuery.matches);

    const handleChange = (event: MediaQueryListEvent) => {
      setPrefersReducedMotion(event.matches);
    };
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  return prefersReducedMotion;
}

// ---------------------------------------------------------------------------
// Hook interface
// ---------------------------------------------------------------------------

type DrawerSide = 'left' | 'right' | null;

interface UseLayoutReturn {
  // Desktop (>=1024px): collapse/expand the side regions.
  leftCollapsed: boolean;
  rightCollapsed: boolean;
  toggleLeft: () => void;
  toggleRight: () => void;
  // Mobile (<1024px): slide-over drawers, at most one open at a time.
  openDrawer: DrawerSide;
  openLeftDrawer: () => void;
  openRightDrawer: () => void;
  closeDrawer: () => void;
}

/**
 * Layout state for the three-region layout: desktop collapse state for the left
 * (Conversation_Sidebar) and right (Document_Panel) regions, persisted to
 * `readmind_layout`, plus mobile drawer state with one-open-at-a-time semantics.
 */
export function useLayout(): UseLayoutReturn {
  const [layout, setLayout] = useState<LayoutState>(() => loadLayoutState());
  const [openDrawer, setOpenDrawer] = useState<DrawerSide>(null);

  // Persist collapse state whenever it changes (Requirement 1.6).
  useEffect(() => {
    saveLayoutState(layout);
  }, [layout]);

  const toggleLeft = useCallback(() => {
    setLayout((prev) => ({ ...prev, leftCollapsed: !prev.leftCollapsed }));
  }, []);

  const toggleRight = useCallback(() => {
    setLayout((prev) => ({ ...prev, rightCollapsed: !prev.rightCollapsed }));
  }, []);

  // Opening one drawer replaces any open drawer, enforcing one-open-at-a-time
  // (Requirement 13.2).
  const openLeftDrawer = useCallback(() => setOpenDrawer('left'), []);
  const openRightDrawer = useCallback(() => setOpenDrawer('right'), []);
  const closeDrawer = useCallback(() => setOpenDrawer(null), []);

  return {
    leftCollapsed: layout.leftCollapsed,
    rightCollapsed: layout.rightCollapsed,
    toggleLeft,
    toggleRight,
    openDrawer,
    openLeftDrawer,
    openRightDrawer,
    closeDrawer,
  };
}
