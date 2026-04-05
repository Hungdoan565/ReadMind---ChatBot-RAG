## ADDED Requirements

### Requirement: Card-based document display
Documents SHALL be displayed as visual cards in a grid layout instead of a checkbox list.

#### Scenario: Document grid layout
- **WHEN** user views the document list in sidebar
- **THEN** documents appear as cards in a 2-column grid with file icon, name (truncated), file size, and chunk count

#### Scenario: Document card content
- **WHEN** a document card is rendered
- **THEN** it displays: file type icon (PDF, TXT, MD, URL), filename (max 2 lines with ellipsis), file size (KB/MB), and chunk count badge

### Requirement: File type icons
Each document card SHALL display an icon corresponding to its file type.

#### Scenario: PDF document icon
- **WHEN** document is a PDF file
- **THEN** card displays a PDF-specific icon with red accent color

#### Scenario: Text/Markdown document icon
- **WHEN** document is .txt or .md file
- **THEN** card displays a text document icon with blue accent color

#### Scenario: URL source icon
- **WHEN** document is from URL ingestion
- **THEN** card displays a globe/link icon with green accent color

### Requirement: Document selection interaction
Users SHALL select/deselect documents by clicking on their cards with clear visual feedback.

#### Scenario: User selects a document
- **WHEN** user clicks on an unselected document card
- **THEN** the card shows selected state with accent border, check icon overlay, and subtle background highlight

#### Scenario: User deselects a document
- **WHEN** user clicks on a selected document card
- **THEN** the card returns to unselected state with default styling

#### Scenario: Multiple document selection
- **WHEN** user clicks multiple document cards
- **THEN** all clicked cards remain selected, enabling multi-document queries

### Requirement: Document card hover state
Document cards SHALL provide hover feedback for better affordance.

#### Scenario: User hovers over document card
- **WHEN** user hovers over a document card
- **THEN** the card elevates slightly (shadow increase), border becomes visible, and a subtle checkbox icon appears

### Requirement: Select all / Deselect all action
The document list SHALL provide bulk selection controls.

#### Scenario: User clicks Select All
- **WHEN** user clicks "Select All" button above document list
- **THEN** all visible documents become selected with visual feedback

#### Scenario: User clicks Deselect All
- **WHEN** user clicks "Deselect All" with documents selected
- **THEN** all documents return to unselected state

### Requirement: Document count display
The system SHALL display the total and selected document counts.

#### Scenario: Document count header
- **WHEN** documents are loaded
- **THEN** header shows "X of Y documents selected" or "Y documents" if none selected
