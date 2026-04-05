## 1. Theme System Foundation

- [x] 1.1 Define CSS theme variables in `index.css` — `:root` for light, `[data-theme="dark"]` for dark (backgrounds, text, borders, accents)
- [x] 1.2 Create `ThemeProvider.tsx` context component with `useTheme` hook (theme state, toggleTheme, isDark)
- [x] 1.3 Add localStorage persistence for theme preference with SSR-safe hydration
- [x] 1.4 Add inline script in `index.html` to prevent theme flash on load
- [x] 1.5 Create `ThemeToggle.tsx` button component with sun/moon icons and smooth transition
- [x] 1.6 Integrate ThemeProvider in `main.tsx` wrapping App ← (verify: theme toggle works, persists across refresh, no flash)

## 2. Glassmorphism Utilities

- [x] 2.1 Add `.glass-surface` utility class with `backdrop-filter: blur(12px)` and semi-transparent background
- [x] 2.2 Add `.glass-border` utility class with luminous border effect
- [x] 2.3 Add `@supports` fallback for browsers without backdrop-filter support
- [x] 2.4 Define z-index scale CSS variables (--z-sidebar, --z-overlay, --z-modal)
- [x] 2.5 Update theme variables to include glass-specific colors for both themes ← (verify: glass effect visible on dark/light, fallback works)

## 3. Sidebar Glassmorphism Upgrade

- [x] 3.1 Apply glass-surface to sidebar container in `Sidebar.tsx`
- [x] 3.2 Update sidebar header with subtle gradient overlay
- [x] 3.3 Restyle "New Conversation" button with glass border and hover states
- [x] 3.4 Update file upload area styling to match glass aesthetic
- [x] 3.5 Update URL ingest area styling to match glass aesthetic ← (verify: sidebar looks cohesive in both themes)

## 4. Card-Based Document Selector

- [x] 4.1 Create `DocumentCard.tsx` component with file icon, name, size, chunk count
- [x] 4.2 Add file type icon mapping (PDF=red, TXT/MD=blue, URL=green)
- [x] 4.3 Implement card selection states (default, hover, selected) with check overlay
- [x] 4.4 Refactor `DocumentList.tsx` to use 2-column grid of DocumentCard components
- [x] 4.5 Add "Select All / Deselect All" button above document grid
- [x] 4.6 Add document count display "X of Y selected" ← (verify: document selection works, cards show correct metadata)

## 5. Chat Window Enhancements

- [x] 5.1 Apply glass-surface to chat container background
- [x] 5.2 Create `ParticleBackground.tsx` canvas component with ~50 drifting particles
- [x] 5.3 Add `prefers-reduced-motion` check to disable/static particles
- [x] 5.4 Integrate ParticleBackground behind chat messages
- [x] 5.5 Create `EmptyState.tsx` with animated gradient title text
- [x] 5.6 Add floating icon animations to empty state
- [x] 5.7 Update suggestion chips with hover micro-interactions (scale, border color)
- [x] 5.8 Replace current empty state in ChatWindow with new EmptyState component ← (verify: particles animate, gradient text visible, chips interactive)

## 6. Message Animations & Loading States

- [x] 6.1 Enhance message fade-in animation timing (300ms ease-out, 20px slide)
- [x] 6.2 Create skeleton loading placeholder component
- [x] 6.3 Add skeleton shimmer animation CSS
- [x] 6.4 Implement inline error display component with retry button
- [x] 6.5 Update typing indicator animation (3 dots with staggered pulse)
- [x] 6.6 Integrate error handling in MessageBubble for failed messages ← (verify: new messages animate smoothly, errors show retry button)

## 7. Inline Source Citations

- [x] 7.1 Create `SourceChip.tsx` component with truncated name and file icon
- [x] 7.2 Create `SourcePopover.tsx` for expanded source details
- [x] 7.3 Add "Ask about this" action in popover that triggers document selection + prompt
- [x] 7.4 Refactor `SourceList.tsx` to render chips below message text
- [x] 7.5 Update `MessageBubble.tsx` to include inline SourceList when sources exist ← (verify: chips appear below assistant messages, popover opens on click)

## 8. Chat Input Upgrade

- [x] 8.1 Apply glass-surface to input container with elevated appearance
- [x] 8.2 Add subtle glow effect on input focus
- [x] 8.3 Update send button with accent color and hover states
- [x] 8.4 Ensure input styling matches both light and dark themes ← (verify: input looks premium, focus states work)

## 9. Responsive Layout

- [ ] 9.1 Define responsive breakpoint CSS variables (mobile: <768px, tablet: 768-1023px, desktop: ≥1024px)
- [ ] 9.2 Create `MobileHeader.tsx` with hamburger menu, centered title, theme toggle
- [ ] 9.3 Create `SidebarDrawer.tsx` wrapper for mobile slide-out behavior
- [ ] 9.4 Add backdrop overlay component for drawer
- [ ] 9.5 Implement drawer open/close state management with body scroll lock
- [ ] 9.6 Update document cards to single column on tablet
- [ ] 9.7 Fix input area to bottom on mobile with keyboard-aware positioning
- [ ] 9.8 Ensure all tap targets are minimum 44x44px
- [ ] 9.9 Update `App.tsx` to conditionally render MobileHeader vs desktop header ← (verify: sidebar drawer works on mobile, responsive breakpoints correct)

## 10. Header Integration & Polish

- [ ] 10.1 Add ThemeToggle to desktop header (right side)
- [ ] 10.2 Apply glass-surface to header for consistency
- [ ] 10.3 Update header styling for both themes
- [ ] 10.4 Final visual QA pass across all components
- [ ] 10.5 Test full flow: theme toggle, document selection, chat, sources ← (verify: end-to-end user flow works, visual consistency across themes)
