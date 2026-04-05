## ADDED Requirements

### Requirement: Frontend establishes an anonymous room context
The system SHALL establish an active anonymous `room_code` before any document-scoped API request is made.

#### Scenario: First visit creates a room
- **WHEN** a user opens the app without a stored room and without a room value in the URL
- **THEN** the frontend generates a new anonymous `room_code`
- **AND** persists it locally for later visits

#### Scenario: Returning visit restores the room
- **WHEN** a user revisits the app and a previously stored `room_code` exists
- **THEN** the frontend reuses that room as the active workspace

#### Scenario: Shared link joins a room
- **WHEN** a user opens the app with a room value in the URL
- **THEN** the frontend adopts that `room_code` as the active workspace
- **AND** persists it locally for subsequent requests

### Requirement: Room changes reset room-dependent client state
The frontend SHALL clear room-dependent state when the active room changes.

#### Scenario: Switching rooms resets chat context
- **WHEN** the active `room_code` changes
- **THEN** the frontend clears the current chat session state
- **AND** clears selected document IDs from the previous room

### Requirement: Room identity is visible and shareable
The system SHALL expose the active `room_code` in the UI so users can understand and share their anonymous workspace.

#### Scenario: User views current room
- **WHEN** the sidebar or room control area renders
- **THEN** the active `room_code` is displayed
- **AND** the user can copy or reuse it for the same workspace
