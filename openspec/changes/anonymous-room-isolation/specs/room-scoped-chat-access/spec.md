## ADDED Requirements

### Requirement: Chat requests declare room scope
The system SHALL require a `room_code` on chat requests that use stored documents.

#### Scenario: Chat request includes room code
- **WHEN** a client sends a chat question
- **THEN** the request includes `room_code`
- **AND** the backend rejects the request if `room_code` is missing or empty

### Requirement: Retrieval is constrained to the active room
The system SHALL retrieve context only from documents that belong to the provided `room_code`.

#### Scenario: Chat without active document filter searches only the room
- **WHEN** a chat request omits `active_doc_ids`
- **THEN** retrieval searches only documents stored in the provided `room_code`

#### Scenario: Chat with selected documents stays inside the room
- **WHEN** a chat request includes `active_doc_ids`
- **THEN** retrieval searches only the intersection of those document IDs and the provided `room_code`

### Requirement: Cross-room document IDs are rejected
The system SHALL reject chat requests that reference selected documents outside the provided room.

#### Scenario: Foreign document ID fails validation
- **WHEN** a chat request includes an `active_doc_id` that does not belong to the provided `room_code`
- **THEN** the backend returns a client error
- **AND** does not run retrieval against that foreign document

### Requirement: Source citations respect room scope
The system SHALL return source citations only from documents inside the active room.

#### Scenario: Source list excludes foreign-room chunks
- **WHEN** the backend returns cited source documents for a chat response
- **THEN** every source belongs to the provided `room_code`
