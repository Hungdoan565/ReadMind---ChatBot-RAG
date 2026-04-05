## ADDED Requirements

### Requirement: Glass surface utility class
The system SHALL provide a `.glass-surface` utility class that applies semi-transparent background with blur effect.

#### Scenario: Glass effect on sidebar
- **WHEN** `.glass-surface` is applied to sidebar container
- **THEN** the sidebar displays with `backdrop-filter: blur(12px)`, semi-transparent background (`rgba` with 0.7-0.85 opacity), and subtle border

#### Scenario: Fallback for unsupported browsers
- **WHEN** browser does not support `backdrop-filter`
- **THEN** the element falls back to solid semi-transparent background without blur using `@supports` query

### Requirement: Glass border utility class  
The system SHALL provide a `.glass-border` utility class that applies a subtle luminous border effect.

#### Scenario: Glass border on cards
- **WHEN** `.glass-border` is applied to a card element
- **THEN** the card displays with a 1px border using `rgba(255,255,255,0.1)` in dark mode or `rgba(0,0,0,0.05)` in light mode

### Requirement: Glassmorphism sidebar
The sidebar component SHALL use glassmorphism styling with blur effect and semi-transparent background.

#### Scenario: Sidebar appearance in dark mode
- **WHEN** application is in dark mode
- **THEN** sidebar displays with dark glass effect: blurred background showing content behind, luminous top border, subtle gradient overlay

#### Scenario: Sidebar appearance in light mode
- **WHEN** application is in light mode
- **THEN** sidebar displays with light frosted glass effect: white-tinted blur, subtle shadow, clean borders

### Requirement: Glassmorphism chat container
The chat message area SHALL use glassmorphism styling consistent with the sidebar.

#### Scenario: Chat area glass effect
- **WHEN** user views the chat window
- **THEN** the chat container has subtle glass background that differentiates it from the plain document area while maintaining readability

### Requirement: Glassmorphism input area
The chat input container SHALL use glassmorphism styling to create a floating input appearance.

#### Scenario: Input area appearance
- **WHEN** user focuses on chat input
- **THEN** the input container displays with glass effect, subtle glow on focus, and elevated appearance above chat messages
