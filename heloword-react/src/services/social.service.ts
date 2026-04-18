import { doGet, doPost, doPut, doDelete, getCommonHeaders } from './api.service';
import { environment } from '../config/environment';

export interface OnlineUser {
  userId: string;
  displayName: string;
  isGuest: boolean;
}

export interface ChatMessage {
  id: number;
  senderUserId: string;
  senderDisplayName: string;
  recipientUserId: string;
  roomId: string;
  content: string;
  sentAt: string;
  readAt: string | null;
}

export interface Friend {
  id: number;
  otherUserId: string;
  displayName: string;
  myNickname: string | null;
  /** PENDING_SENT | PENDING_RECEIVED | ACCEPTED */
  status: string;
  isOnline: boolean;
}

export interface OfficialMessage {
  id: number;
  title: string;
  content: string;
  publishedAt: string;
}

export async function fetchOfficialMessages(): Promise<OfficialMessage[]> {
  const res = await doGet('/frontend-api/api/fe/official-messages');
  return res.code === '0000' ? (res.data ?? []) : [];
}

/** Compute a deterministic room ID from two user IDs */
export function computeRoomId(a: string, b: string): string {
  return [a, b].sort().join(':');
}

/** Get or create a stable guest identity stored in localStorage */
export function getOrCreateGuestIdentity(): { userId: string; displayName: string } {
  let userId = localStorage.getItem('hw-guest-id');
  if (!userId) {
    userId =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `guest-${Date.now().toString(36)}`;
    localStorage.setItem('hw-guest-id', userId);
  }
  const shortId = userId.replace(/-/g, '').slice(-4).toUpperCase();
  const displayName = localStorage.getItem('hw-guest-name') || `Guest-${shortId}`;
  return { userId, displayName };
}

// ── Online Presence ───────────────────────────────────────────────────────

export async function sendHeartbeat(userId: string, displayName: string, isGuest: boolean) {
  return doPost('/frontend-api/api/fe/social/heartbeat', { userId, displayName, isGuest });
}

export async function removeOnlineUser(userId: string) {
  return doDelete(`/frontend-api/api/fe/social/heartbeat/${encodeURIComponent(userId)}`);
}

/**
 * Fire-and-forget removal using fetch keepalive so the request completes
 * even when called from a beforeunload handler (browser tab close).
 */
export function removeOnlineUserBeacon(userId: string): void {
  const url = `${environment.backendBaseUrl}/frontend-api/api/fe/social/heartbeat/${encodeURIComponent(userId)}`;
  fetch(url, {
    method: 'DELETE',
    keepalive: true,
    credentials: 'include',
    headers: getCommonHeaders(),
  }).catch(() => {});
}

export async function fetchOnlineUsers(): Promise<OnlineUser[]> {
  const res = await doGet('/frontend-api/api/fe/social/online-users');
  return res.code === '0000' ? (res.data ?? []) : [];
}

// ── Chat ──────────────────────────────────────────────────────────────────

export async function sendChatMessage(
  senderUserId: string,
  senderDisplayName: string,
  recipientUserId: string,
  content: string
): Promise<ChatMessage | null> {
  const res = await doPost('/frontend-api/api/fe/social/messages', {
    senderUserId,
    senderDisplayName,
    recipientUserId,
    content,
  });
  return res.code === '0000' ? res.data : null;
}

export async function fetchMessages(roomId: string, since?: number): Promise<ChatMessage[]> {
  const params: Record<string, unknown> = {};
  if (since) params.since = since;
  const res = await doGet(
    `/frontend-api/api/fe/social/messages/room/${encodeURIComponent(roomId)}`,
    params
  );
  return res.code === '0000' ? (res.data ?? []) : [];
}

export async function markRoomRead(roomId: string) {
  return doPost(`/frontend-api/api/fe/social/messages/read/${encodeURIComponent(roomId)}`);
}

export async function fetchUnreadCounts(): Promise<Record<string, number>> {
  const res = await doGet('/frontend-api/api/fe/social/messages/unread');
  return res.code === '0000' ? (res.data ?? {}) : {};
}

export async function fetchChatRooms(): Promise<ChatMessage[]> {
  const res = await doGet('/frontend-api/api/fe/social/messages/rooms');
  return res.code === '0000' ? (res.data ?? []) : [];
}

// ── Friends (logged-in only) ──────────────────────────────────────────────

export async function fetchFriends(): Promise<Friend[]> {
  const res = await doGet('/frontend-api/api/fe/social/friends');
  return res.code === '0000' ? (res.data ?? []) : [];
}

export async function sendFriendRequest(addresseeUsername: string): Promise<Friend | null> {
  const res = await doPost('/frontend-api/api/fe/social/friends/request', addresseeUsername);
  if (res.code !== '0000') throw new Error(res.message || 'Failed to send friend request');
  return res.data;
}

export async function acceptFriendRequest(id: number) {
  const res = await doPost(`/frontend-api/api/fe/social/friends/accept/${id}`);
  if (res.code !== '0000') throw new Error(res.message || 'Failed to accept friend request');
  return res;
}

export async function rejectFriendRequest(id: number) {
  const res = await doPost(`/frontend-api/api/fe/social/friends/reject/${id}`);
  if (res.code !== '0000') throw new Error(res.message || 'Failed to reject friend request');
  return res;
}

export async function removeFriend(id: number) {
  return doDelete(`/frontend-api/api/fe/social/friends/${id}`);
}

export async function updateFriendNickname(id: number, nickname: string) {
  return doPut(`/frontend-api/api/fe/social/friends/${id}/nickname`, nickname);
}
