## Why

The current RAG Chatbot UI is functional but basic — standard input boxes, simple buttons, and minimal visual effects. As this is the flagship AI portfolio project for job applications, the UI needs to stand out and demonstrate attention to detail. Hiring managers spend 30 seconds to 2 minutes evaluating portfolio projects; a premium, modern UI creates immediate positive impression and differentiates from "tutorial-level" projects.

## What Changes

- **Theme System**: Add dark/light mode toggle with CSS variable-based theming
- **Glassmorphism Design**: Apply semi-transparent backgrounds with blur effects to sidebar and chat components
- **Enhanced Input**: Replace basic textarea with auto-resize PromptInput component with tooltips and micro-interactions
- **Animated Messages**: Upgrade message bubbles with fade-in animations, gradient accents, and polished typography
- **Card-based Documents**: Replace checkbox list with visual card components showing file icons, size, and chunk count
- **Inline Source Citations**: Transform source list into clickable chips that expand to show details
- **Animated Empty State**: Add gradient text, floating icons, and animated suggestion chips for empty chat
- **Particle Effects**: Add subtle animated background particles in chat area
- **Mobile Responsive**: Collapsible sidebar on mobile viewports
- **Enhanced Loading States**: Skeleton loading and streaming-ready typing indicators
- **Inline Error Handling**: Error messages with retry buttons directly in chat flow

## Capabilities

### New Capabilities
- `theme-system`: Dark/light mode toggle with persistent preference, CSS variable theming, smooth transitions
- `glassmorphism-components`: Reusable glassmorphism styles for sidebar, cards, and chat containers
- `animated-chat-ui`: Message animations, typing indicators, particle effects, gradient text
- `card-document-selector`: Card-based document selection with file type icons, metadata display, multi-select
- `inline-source-citations`: Expandable source chips attached to assistant messages
- `responsive-layout`: Mobile-first responsive design with collapsible sidebar

### Modified Capabilities
<!-- No existing specs to modify — this is a UI-only change that doesn't alter backend behavior -->

## Impact

- **Frontend Components**: All 8 components in `frontend/src/components/` will be modified or replaced
- **Styles**: `frontend/src/index.css` will be significantly expanded with theme variables and glassmorphism utilities
- **Dependencies**: May add new packages for theme persistence (e.g., `next-themes` pattern) or enhanced animations
- **No Backend Changes**: All changes are frontend-only; existing API contracts and state management hooks remain unchanged
- **Browser Support**: Modern browsers with CSS backdrop-filter support (Chrome 76+, Firefox 103+, Safari 9+)
