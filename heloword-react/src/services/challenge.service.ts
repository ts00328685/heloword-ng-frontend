import { doGet, doPost } from './api.service';

export interface ChallengePlayer {
  userId: string;
  displayName: string;
  score: number;
  isGuest: boolean;
}

export type GameFormat = 'TYPING' | 'MULTI_CHOICE';

export interface ChallengeRoom {
  id: string;
  name: string;
  hostUserId: string;
  gameType: string;
  /** 'TYPING' = free-text input (default); 'MULTI_CHOICE' = 4-button pick one */
  gameFormat?: GameFormat;
  status: 'WAITING' | 'PLAYING' | 'FINISHED';
  system: boolean;
  totalRounds: number;
  currentRound: number;
  players: ChallengePlayer[];
  // Present in the join response when the game is already in progress,
  // so late-joining players can see the ongoing question immediately.
  currentQuestion?: string;
  currentQuestionId?: string;
  currentHint?: string;
  remainingSeconds?: number;
  currentChoices?: string[];
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
  /** Four answer choices sent with QUESTION events in MULTI_CHOICE rooms */
  choices?: string[];
  winnerId?: string;
  winnerName?: string;
  correctAnswer?: string;
  pointsAwarded?: number;
  targetUserId?: string;
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
