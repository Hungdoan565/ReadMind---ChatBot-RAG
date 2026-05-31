// API Request Types
export interface ChatRequest {
  question: string;
  room_code: string;
  session_id?: string;
  active_doc_ids?: string[];
}

export interface IngestUrlRequest {
  url: string;
}

// API Response Types
export interface SourceDocument {
  source: string;
  page?: number;
  content_preview: string;
}

export interface ChatResponse {
  answer: string;
  session_id: string;
  sources: SourceDocument[];
}

// Streaming event types
export interface ChatStreamStartEvent {
  event: 'start';
  session_id: string;
}

export interface ChatStreamTokenEvent {
  event: 'token';
  data: string;
}

export interface ChatStreamEndEvent {
  event: 'end';
  session_id: string;
  sources: SourceDocument[];
}

export interface ChatStreamErrorEvent {
  event: 'error';
  data: string;
}

export type ChatStreamEvent =
  | ChatStreamStartEvent
  | ChatStreamTokenEvent
  | ChatStreamEndEvent
  | ChatStreamErrorEvent;

export interface IngestResponse {
  doc_id: string;
  source: string;
  chunk_count: number;
  status: string;
  message: string;
}

// UI Types
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: SourceDocument[];
  timestamp: Date;
  isError?: boolean;
  isStreaming?: boolean;
}

export interface IngestHistoryItem {
  id: string;
  docId?: string;  // Optional - from backend response
  source: string;
  chunkCount: number;
  status: 'success' | 'error' | 'uploading';
  timestamp: Date;
  message?: string;
}

export interface UploadProgress {
  loaded: number;
  total: number;
  percentage: number;
}

// Document Selection Types
export interface StoredDocument {
  doc_id: string;
  source: string;
  chunk_count: number;
}

export interface DocumentsResponse {
  documents: StoredDocument[];
  total: number;
}

// Auth Types
export interface AuthUser {
  id: string;
  email: string;
  is_active: boolean;
  is_superuser: boolean;
  is_verified: boolean;
  created_at: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
}

export interface ForgotPasswordRequest {
  email: string;
}

// Room Types
export interface RoomInfo {
  room_code: string;
  created_at: string;
  document_count: number;
}

export interface RoomsResponse {
  rooms: RoomInfo[];
}

export interface ClaimRoomResponse {
  room_code: string;
  status: string;
  message: string;
}

// Conversation Types
// Conversation metadata (one entry per conversation in a room)
export interface Conversation {
  id: string;        // e.g. "conv-<epochMs>-<rand>"
  title: string;     // generated, renamed, or placeholder
  createdAt: number; // epoch milliseconds
  updatedAt: number; // epoch milliseconds
}

// Persisted transcript blob (shape is identical to the existing persisted chat)
export interface PersistedTranscript {
  messages: Array<Omit<ChatMessage, 'timestamp'> & { timestamp: string }>;
  sessionId: string | null;
}

// Persisted layout state
export interface LayoutState {
  leftCollapsed: boolean;
  rightCollapsed: boolean;
}
