## ADDED Requirements

### Requirement: Responsive breakpoint system
The application SHALL respond to viewport width with defined breakpoints for mobile, tablet, and desktop.

#### Scenario: Desktop viewport (≥1024px)
- **WHEN** viewport width is 1024px or greater
- **THEN** sidebar is visible by default, chat area fills remaining space

#### Scenario: Tablet viewport (768px - 1023px)
- **WHEN** viewport width is between 768px and 1023px
- **THEN** sidebar is narrower (240px), document cards switch to single column

#### Scenario: Mobile viewport (<768px)
- **WHEN** viewport width is less than 768px
- **THEN** sidebar becomes a slide-out drawer, chat area fills full width

### Requirement: Collapsible sidebar drawer
On mobile viewports, the sidebar SHALL become a slide-out drawer with overlay.

#### Scenario: Sidebar drawer closed state
- **WHEN** mobile user views the application
- **THEN** sidebar is hidden, hamburger menu icon appears in header

#### Scenario: User opens sidebar drawer
- **WHEN** user taps hamburger menu icon
- **THEN** sidebar slides in from left with backdrop overlay, body scroll is locked

#### Scenario: User closes sidebar drawer
- **WHEN** sidebar is open and user taps backdrop or close button
- **THEN** sidebar slides out, backdrop fades, body scroll is restored

#### Scenario: Sidebar closes after document selection
- **WHEN** user selects/deselects a document in mobile drawer
- **THEN** sidebar remains open for additional selections (doesn't auto-close)

### Requirement: Mobile header layout
The header SHALL adapt for mobile with hamburger menu and compact layout.

#### Scenario: Mobile header appearance
- **WHEN** viewport is mobile (<768px)
- **THEN** header shows: hamburger menu (left), app title (center), theme toggle (right)

### Requirement: Touch-friendly tap targets
All interactive elements SHALL have minimum 44x44px touch targets on mobile.

#### Scenario: Button tap target sizing
- **WHEN** user views buttons on mobile
- **THEN** all buttons have at least 44px height with adequate padding

#### Scenario: Document card tap target
- **WHEN** user taps document cards on mobile
- **THEN** the entire card is tappable with clear feedback (active state)

### Requirement: Input area fixed positioning on mobile
The chat input SHALL remain fixed at the bottom on mobile viewports.

#### Scenario: Mobile input positioning
- **WHEN** user is typing on mobile
- **THEN** input area is fixed to bottom of screen, visible above keyboard when focused

#### Scenario: Mobile keyboard appearance
- **WHEN** input receives focus on mobile
- **THEN** viewport adjusts to keep input visible above virtual keyboard

### Requirement: Message readability on mobile
Chat messages SHALL remain readable on narrow viewports without horizontal scroll.

#### Scenario: Message width on mobile
- **WHEN** viewing messages on mobile
- **THEN** messages have max-width of 100% minus padding, text wraps properly, code blocks scroll horizontally within message
