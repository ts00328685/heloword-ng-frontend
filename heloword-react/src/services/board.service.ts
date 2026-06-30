import { doGet, doPost, doDelete } from './api.service';

const BASE = '/frontend-api/api/fe/board';

// ── Types (UUID-only; no username/email ever) ───────────────────────────────

export interface LiveBoardSession {
  id: number;
  name: string;
  boardState: 'ACTIVE' | 'ENDED';
  createdByUserId: string;
  createdByName: string;
  createDate: string;
  endedDate: string | null;
}

export interface LiveBoardMessage {
  id: number;
  sessionId: number;
  authorUserId: string;
  authorName: string;
  content: string;
  official: boolean;
  createDate: string;
  likeCount: number;
  liked?: boolean;
}

export interface LiveBoardSong {
  id: number;
  sessionId: number;
  title: string;
  sung: boolean;
  performing: boolean;
  requestCount: number;
  sortOrder: number;
}

export interface LiveBoardSnapshot {
  session: LiveBoardSession;
  messages: LiveBoardMessage[];
  songs: LiveBoardSong[];
  mutedUserIds: string[];
  likedMessageIds: number[];
}

export interface LiveBoardEvent {
  type: 'DELETE' | 'MUTE' | 'UNMUTE' | 'SESSION_ENDED' | 'SESSION_RESTARTED' | 'PRESENCE' | 'LIKE';
  sessionId: number;
  messageId?: number;
  userId?: string;
  userName?: string;
  presence?: number;
  likeCount?: number;
}

export interface BoardResult<T> {
  ok: boolean;
  message: string;
  data: T | null;
}

// ── Public ──────────────────────────────────────────────────────────────────

export async function fetchActiveSession(): Promise<LiveBoardSession | null> {
  const res = await doGet<LiveBoardSession | null>(`${BASE}/active`);
  return res.code === '0000' ? (res.data ?? null) : null;
}

export async function fetchBoardSnapshot(id: number, userId?: string): Promise<LiveBoardSnapshot | null> {
  const res = await doGet<LiveBoardSnapshot>(`${BASE}/sessions/${id}`, userId ? { userId } : {});
  return res.code === '0000' ? res.data : null;
}

export async function likeBoardMessage(
  id: number,
  messageId: number,
  authorUserId: string
): Promise<LiveBoardMessage | null> {
  const res = await doPost<LiveBoardMessage>(`${BASE}/sessions/${id}/messages/${messageId}/like`, { authorUserId });
  return res.code === '0000' ? res.data : null;
}

export async function postBoardMessage(
  id: number,
  content: string,
  authorUserId: string,
  authorName: string
): Promise<BoardResult<LiveBoardMessage>> {
  const res = await doPost<LiveBoardMessage>(`${BASE}/sessions/${id}/messages`, {
    content,
    authorUserId,
    authorName,
  });
  return { ok: res.code === '0000', message: res.message ?? '', data: res.data };
}

export async function sendBoardPresence(id: number, authorUserId: string): Promise<number> {
  const res = await doPost<number>(`${BASE}/sessions/${id}/presence`, { authorUserId });
  return res.code === '0000' && typeof res.data === 'number' ? res.data : 0;
}

export async function toggleBoardSong(
  id: number,
  songId: number,
  action: 'sung' | 'request' | 'performing'
): Promise<LiveBoardSong[]> {
  const res = await doPost<LiveBoardSong[]>(`${BASE}/sessions/${id}/songs/${songId}/toggle?action=${action}`);
  return res.code === '0000' ? (res.data ?? []) : [];
}

// ── Admin ─────────────────────────────────────────────────────────────────--

export async function createBoardSession(name: string): Promise<BoardResult<LiveBoardSession>> {
  const res = await doPost<LiveBoardSession>(`${BASE}/sessions`, { name });
  return { ok: res.code === '0000', message: res.message ?? '', data: res.data };
}

export async function fetchBoardSessions(): Promise<LiveBoardSession[]> {
  const res = await doGet<LiveBoardSession[]>(`${BASE}/sessions`);
  return res.code === '0000' ? (res.data ?? []) : [];
}

export async function endBoardSession(id: number): Promise<LiveBoardSession | null> {
  const res = await doPost<LiveBoardSession>(`${BASE}/sessions/${id}/end`);
  return res.code === '0000' ? res.data : null;
}

export async function restartBoardSession(id: number): Promise<LiveBoardSession | null> {
  const res = await doPost<LiveBoardSession>(`${BASE}/sessions/${id}/restart`);
  return res.code === '0000' ? res.data : null;
}

export async function postOfficialMessage(id: number, content: string): Promise<LiveBoardMessage | null> {
  const res = await doPost<LiveBoardMessage>(`${BASE}/sessions/${id}/official`, { content });
  return res.code === '0000' ? res.data : null;
}

export async function deleteBoardMessage(messageId: number): Promise<boolean> {
  const res = await doDelete(`${BASE}/messages/${messageId}`);
  return res.code === '0000';
}

export async function muteBoardUser(id: number, userId: string, mutedName: string): Promise<string[]> {
  const res = await doPost<string[]>(`${BASE}/sessions/${id}/mute`, { userId, mutedName });
  return res.code === '0000' ? (res.data ?? []) : [];
}

export async function unmuteBoardUser(id: number, userId: string): Promise<string[]> {
  const res = await doDelete<string[]>(`${BASE}/sessions/${id}/mute/${encodeURIComponent(userId)}`);
  return res.code === '0000' ? (res.data ?? []) : [];
}

export async function addBoardSong(id: number, title: string): Promise<LiveBoardSong[]> {
  const res = await doPost<LiveBoardSong[]>(`${BASE}/sessions/${id}/songs`, { title });
  return res.code === '0000' ? (res.data ?? []) : [];
}

export async function deleteBoardSong(id: number, songId: number): Promise<LiveBoardSong[]> {
  const res = await doDelete<LiveBoardSong[]>(`${BASE}/sessions/${id}/songs/${songId}`);
  return res.code === '0000' ? (res.data ?? []) : [];
}
