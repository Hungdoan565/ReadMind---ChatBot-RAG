## ADDED Requirements

### Requirement: Document listing is room-scoped
The system SHALL return only documents that belong to the active `room_code`.

#### Scenario: Room document list excludes foreign documents
- **WHEN** a client requests the document list for a room
- **THEN** the backend returns only documents whose chunks were stored with that `room_code`
- **AND** documents from other rooms are excluded from the response

#### Scenario: Empty room returns no documents
- **WHEN** a client requests the document list for a room with no stored documents
- **THEN** the backend returns an empty list and a total of zero

### Requirement: Document deletion is room-scoped
The system SHALL only delete documents that belong to the active `room_code`.

#### Scenario: Delete succeeds within the same room
- **WHEN** a client requests deletion for a `doc_id` that belongs to the provided `room_code`
- **THEN** the backend deletes all chunks for that document within that room

#### Scenario: Delete cannot cross room boundaries
- **WHEN** a client requests deletion for a `doc_id` that does not belong to the provided `room_code`
- **THEN** the backend responds as if the document does not exist in that room
- **AND** no chunks from another room are deleted
