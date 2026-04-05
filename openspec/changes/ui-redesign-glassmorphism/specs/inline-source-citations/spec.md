## ADDED Requirements

### Requirement: Inline source citation chips
Source citations SHALL appear as small chips directly below the assistant message content.

#### Scenario: Assistant message with sources
- **WHEN** assistant response includes source citations
- **THEN** small chips appear below the message text showing truncated source name and document icon

#### Scenario: No sources available
- **WHEN** assistant response has no source citations
- **THEN** no source chips section is displayed (clean message without placeholder)

### Requirement: Source chip visual design
Source chips SHALL have a compact, pill-shaped design that integrates with the message.

#### Scenario: Source chip appearance
- **WHEN** source chips are displayed
- **THEN** each chip shows: small file icon, truncated filename (max 15 chars), and subtle background color matching document type

#### Scenario: Multiple source chips
- **WHEN** message has multiple sources
- **THEN** chips wrap to multiple lines with consistent spacing (8px gap)

### Requirement: Source chip expand interaction
Users SHALL click on a source chip to view full source details in a popover.

#### Scenario: User clicks source chip
- **WHEN** user clicks on a source chip
- **THEN** a popover appears showing: full source path, document type, relevance score (if available), and "Ask about this" action

#### Scenario: Popover dismissal
- **WHEN** popover is open and user clicks outside or presses Escape
- **THEN** popover closes smoothly

### Requirement: Source chip hover state
Source chips SHALL provide visual feedback on hover.

#### Scenario: User hovers source chip
- **WHEN** user hovers over a source chip
- **THEN** chip background darkens slightly and cursor changes to pointer

### Requirement: Ask about source action
Users SHALL be able to directly ask about a specific source from its expanded popover.

#### Scenario: User clicks "Ask about this" in popover
- **WHEN** user clicks the "Ask about this" button in source popover
- **THEN** the source document is selected, input is focused, and a prompt like "Tell me about [source]" is suggested
