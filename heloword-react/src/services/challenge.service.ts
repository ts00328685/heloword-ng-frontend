import { doGet, doPost } from './api.service';

export interface ChallengePlayer {
  userId: string;
  displayName: string;
  score: number;
  isGuest: boolean;
}

export interface ChallengeRoom {
  id: string;
  name: string;
  hostUserId: string;
  gameType: string;
  status: 'WAITING' | 'PLAYING' | 'FINISHED';
  system: boolean;
  totalRounds: number;
  currentRound: number;
  players: ChallengePlayer[];
}

export interface ChallengeEvent {
  type: 'ROOM_UPDATE' | 'GAME_STARTED' | 'QUESTION' | 'ROUND_WIN' | 'WRONG_ANSWER' | 'QUESTION_TIMEOUT' | 'GAME_OVER';
  room?: ChallengeRoom;
  roundNumber?: number;
  totalRounds?: number;
  question?: string;
  questionId?: string;
  timeoutSeconds?: number;
  hint?: string;
  winnerId?: string;
  winnerName?: string;
  correctAnswer?: string;
  pointsAwarded?: number;
  scores?: Record<string, number>;
}

export async function fetchRooms(): Promise<ChallengeRoom[]> {
  const res = await doGet('/frontend-api/api/fe/challenge/rooms');
  return res.code === '0000' ? (res.data ?? []) : [];
}

export async function createRoom(name: string, gameType: string, totalRounds: number): Promise<ChallengeRoom | null> {
  const res = await doPost('/frontend-api/api/fe/challenge/rooms', { name, gameType, totalRounds });
  if (res.code !== '0000') throw new Error(res.message || 'Failed to create room');
  return res.data;
}

export async function joinRoom(roomId: string, userId: string, displayName: string, guest: boolean): Promise<ChallengeRoom | null> {
  const res = await doPost(`/frontend-api/api/fe/challenge/rooms/${roomId}/join`, { userId, displayName, guest });
  return res.code === '0000' ? res.data : null;
}

export async function leaveRoom(roomId: string, userId: string): Promise<void> {
  await doPost(`/frontend-api/api/fe/challenge/rooms/${roomId}/leave`, { userId });
}

export async function startGame(roomId: string, userId: string): Promise<void> {
  await doPost(`/frontend-api/api/fe/challenge/rooms/${roomId}/start`, { userId });
}
