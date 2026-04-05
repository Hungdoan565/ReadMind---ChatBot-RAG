## ADDED Requirements

### Requirement: Message fade-in animation
Each chat message SHALL animate into view with a smooth fade-in and slide-up effect.

#### Scenario: New message appears
- **WHEN** a new message is added to the chat
- **THEN** the message fades in from 0 to 100% opacity while sliding up 20px over 300ms with ease-out timing

#### Scenario: Initial messages on load
- **WHEN** chat loads with existing messages
- **THEN** messages appear immediately without staggered animation (animation only for new messages)

### Requirement: Typing indicator animation
The system SHALL display an animated typing indicator when the assistant is generating a response.

#### Scenario: Assistant is thinking
- **WHEN** a user message is sent and response is pending
- **THEN** three dots animate in sequence with scale and opacity pulses at 150ms intervals

#### Scenario: Response starts streaming
- **WHEN** assistant response begins arriving
- **THEN** typing indicator fades out and message content starts appearing

### Requirement: Particle background effect
The chat window SHALL display subtle animated particles in the background.

#### Scenario: Particles visible in chat area
- **WHEN** user views the chat window
- **THEN** approximately 50 small particles drift slowly across the background with low opacity (0.1-0.3)

#### Scenario: Particles respect reduced motion preference
- **WHEN** user has `prefers-reduced-motion: reduce` system setting
- **THEN** particles are static or disabled entirely

#### Scenario: Particles don't interfere with interaction
- **WHEN** user interacts with chat messages
- **THEN** particles are positioned behind all interactive elements with `pointer-events: none`

### Requirement: Gradient text in empty state
The empty state hero text SHALL display with an animated gradient effect.

#### Scenario: Empty chat shows gradient title
- **WHEN** chat has no messages
- **THEN** the "How can I help you today?" text displays with a subtle animated gradient that shifts colors over 3-5 seconds

### Requirement: Suggestion chip hover animations
Suggestion chips in empty state SHALL have micro-interactions on hover.

#### Scenario: User hovers suggestion chip
- **WHEN** user hovers over a suggestion chip
- **THEN** the chip scales up slightly (1.02x), border color transitions to accent, and icon subtly animates

### Requirement: Skeleton loading states
The system SHALL display skeleton placeholders while content is loading.

#### Scenario: Documents loading
- **WHEN** document list is fetching data
- **THEN** placeholder cards with shimmer animation appear in place of actual documents

#### Scenario: Message content loading
- **WHEN** streaming response is in progress
- **THEN** message bubble shows animated skeleton lines that are progressively replaced with actual text

### Requirement: Inline error display with retry
Error messages SHALL appear inline within the chat flow with a retry action.

#### Scenario: API request fails
- **WHEN** a chat message fails to send or receive response
- **THEN** an error message appears in the chat flow with red styling and a "Retry" button

#### Scenario: User retries failed message
- **WHEN** user clicks the Retry button on an error message
- **THEN** the original message is resent and the error display is replaced with loading indicator
