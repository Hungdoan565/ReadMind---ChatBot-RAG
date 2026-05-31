import apiClient from './client';
import type { RoomInfo, RoomsResponse, ClaimRoomResponse } from '../types';

/**
 * List the rooms claimed by the authenticated user.
 *
 * Calls `GET /api/rooms`, which requires authentication (the httpOnly
 * `readmind_auth` cookie is sent via `apiClient`'s `withCredentials`). Returns
 * the `rooms` array from the response. A 401 (anonymous) rejects — callers only
 * invoke this when authenticated, so the error is intentionally not swallowed.
 */
export async function getRooms(): Promise<RoomInfo[]> {
  const response = await apiClient.get<RoomsResponse>('/api/rooms');
  return response.data.rooms;
}

/**
 * Claim the given room for the authenticated user.
 *
 * Calls `POST /api/rooms/{room_code}/claim`. The operation is idempotent on the
 * backend (INSERT ... ON CONFLICT DO NOTHING), so re-claiming an owned room
 * succeeds without creating a duplicate. Errors (including 401) propagate to the
 * caller, which handles them in the UI.
 */
export async function claimRoom(roomCode: string): Promise<ClaimRoomResponse> {
  const response = await apiClient.post<ClaimRoomResponse>(
    `/api/rooms/${encodeURIComponent(roomCode)}/claim`
  );
  return response.data;
}
