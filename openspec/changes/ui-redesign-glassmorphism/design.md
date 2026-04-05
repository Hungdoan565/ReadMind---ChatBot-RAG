## Context

The RAG Chatbot frontend is a React + Tailwind + Framer Motion application with 8 components:
- `App.tsx` — Root component, layout orchestration
- `Sidebar.tsx` — Left panel with logo, new chat button, file upload, URL ingest, document list
- `ChatWindow.tsx` — Message display area with empty state and loading indicator
- `ChatInput.tsx` — Message input textarea
- `MessageBubble.tsx` — Individual message rendering with markdown
- `FileUpload.tsx` — File upload with drag-drop
- `UrlIngest.tsx` — URL input for web scraping
- `DocumentList.tsx` — Document selection with checkboxes
- `SourceList.tsx` — Source citations display

Current styling uses Tailwind v4 with custom colors defined in `@theme` block. Dark sidebar with light chat area. Framer Motion animations exist but are basic (fade-in/slide).

**Constraints:**
- React 18+ with TypeScript
- Tailwind CSS v4 (uses `@theme` instead of `theme.extend`)
- Framer Motion for animations
- No backend changes — all existing hooks and APIs remain unchanged
- Browser support: Chrome 76+, Firefox 103+, Safari 9+ (for backdrop-filter)

## Goals / Non-Goals

**Goals:**
- Create a visually distinctive, portfolio-worthy UI that demonstrates frontend expertise
- Implement dark/light theme toggle with smooth transitions
- Apply glassmorphism aesthetic consistently across sidebar and chat components
- Add subtle particle effects and gradient text animations
- Improve document selection UX with card-based design
- Make source citations discoverable with inline expandable chips
- Create memorable empty state with animated hero
- Ensure responsive behavior on mobile with collapsible sidebar

**Non-Goals:**
- Backend changes or API modifications
- Conversation history persistence (future feature)
- Multi-chat sessions UI (future feature)
- Complex accessibility features beyond basic ARIA (a11y audit is separate work)
- Animation performance optimization for low-end devices (acceptable tradeoff)

## Decisions

### D1: Theme Implementation — CSS Variables + React Context

**Choice:** Single CSS file with `:root` and `[data-theme="dark"]` selectors, React context for toggle state, localStorage for persistence.

**Alternatives considered:**
- `next-themes` library — Overkill for non-Next.js project, adds unnecessary dependency
- Tailwind's built-in dark mode — Uses `dark:` prefix which doesn't support dynamic switching without class manipulation at document level
- CSS-in-JS (styled-components) — Would require significant rewrite, Tailwind already handles styling

**Rationale:** CSS variables are the most performant for theme switching (single repaint), work natively with Tailwind, and require no additional dependencies. React context provides clean API for toggle component.

### D2: Glassmorphism Implementation — Utility Classes + Component Variants

**Choice:** Create reusable Tailwind utilities (`.glass-surface`, `.glass-border`) in index.css, apply via className composition.

**Alternatives considered:**
- Tailwind plugin for custom utilities — Unnecessary complexity for a few utilities
- Component-level inline styles — Inconsistent, hard to maintain
- shadcn/ui glass component — Would require installing shadcn which restructures entire component library

**Rationale:** Utility classes in CSS keep the glassmorphism values (blur, opacity, border) consistent and easily adjustable. Component composition allows mixing glass effects with other utilities.

### D3: Particle Effects — Canvas-based with requestAnimationFrame

**Choice:** Lightweight custom canvas component with ~50 particles, positioned behind chat content with `pointer-events: none`.

**Alternatives considered:**
- tsparticles library — Heavy bundle size (~30KB+), overkill for ambient effect
- CSS-only particles — Limited control, performance issues with many elements
- Lottie animation — Requires external asset, not customizable

**Rationale:** Custom canvas implementation gives full control over particle behavior, keeps bundle small (~2KB), and can be easily disabled for reduced-motion preferences.

### D4: Document Cards — Grid Layout with Hover States

**Choice:** 2-column grid of cards showing file icon (by type), name, size, and chunk count. Checkbox overlay on hover.

**Alternatives considered:**
- List view with inline metadata — Current design, visually dense
- Accordion per document — Too much vertical space
- Thumbnail previews — Would require backend support

**Rationale:** Cards provide visual breathing room, support at-a-glance scanning, and align with premium SaaS aesthetics. Grid maximizes sidebar width usage.

### D5: Source Citations — Inline Chips with Popover Expand

**Choice:** Small chips below assistant message text with document icon + truncated name. Click to expand popover showing full source path and relevance score.

**Alternatives considered:**
- Separate source list panel — Current design, disconnected from message
- Footnote-style numbers — Less discoverable, requires scroll
- Modal overlay — Too disruptive for quick reference

**Rationale:** Inline chips keep sources contextually attached to the answer while maintaining clean message layout. Popover provides details without navigation.

### D6: Responsive Strategy — Mobile-First Breakpoints + Sidebar Drawer

**Choice:** Sidebar becomes off-canvas drawer on screens <768px, triggered by hamburger menu in header.

**Alternatives considered:**
- Bottom sheet for sidebar — Awkward for document list height
- Always-visible mini sidebar — Insufficient space for upload UI
- Remove sidebar on mobile — Breaks core functionality

**Rationale:** Drawer pattern is familiar to mobile users, preserves all sidebar functionality, and maximizes chat area on small screens.

## Risks / Trade-offs

| Risk | Impact | Mitigation |
|------|--------|------------|
| `backdrop-filter` not supported on older browsers | Glassmorphism falls back to solid colors | Provide fallback `.glass-surface` styles using `@supports` query |
| Particle canvas performance on low-end devices | CPU usage, battery drain | Respect `prefers-reduced-motion`, provide toggle, limit to 50 particles |
| Theme flash on page load | Brief wrong-theme flicker | Inject theme script in `<head>` before React hydration |
| Sidebar drawer z-index conflicts | Overlapping elements | Establish z-index scale in CSS variables (--z-sidebar: 40, --z-modal: 50) |
| Card grid doesn't scale for 20+ documents | Scroll fatigue | Add search/filter for documents (future enhancement, out of scope) |

## Migration Plan

**Deployment:** No backend changes, pure frontend deployment. Can be deployed incrementally.

**Rollback:** Git revert to previous commit. No data migrations required.

**Testing checkpoints:**
1. Theme toggle works without flash
2. Glassmorphism renders with fallback
3. Particles respect reduced-motion
4. Mobile drawer opens/closes correctly
5. All existing functionality (upload, chat, sources) still works
