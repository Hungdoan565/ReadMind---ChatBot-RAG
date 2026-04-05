## ADDED Requirements

### Requirement: Ingestion endpoints require room scope
The system SHALL require a `room_code` for document ingestion requests that create stored document chunks.

#### Scenario: File upload includes room code
- **WHEN** a client uploads a file for ingestion
- **THEN** the request includes `room_code`
- **AND** the backend rejects the request if `room_code` is missing or empty

#### Scenario: URL ingest includes room code
- **WHEN** a client ingests a single URL or URL batch
- **THEN** the request includes `room_code`
- **AND** the backend rejects the request if `room_code` is missing or empty

#### Scenario: Notion ingest includes room code
- **WHEN** a client ingests a Notion page or database
- **THEN** the request includes `room_code`
- **AND** the backend rejects the request if `room_code` is missing or empty

### Requirement: Stored chunks carry room metadata
The system SHALL persist `room_code` on every stored chunk created by an ingestion flow.

#### Scenario: Chunk metadata is tagged with room code
- **WHEN** the backend stores chunked documents in Chroma
- **THEN** each chunk metadata record includes the originating `room_code`
- **AND** the existing `doc_id` metadata remains preserved
