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
