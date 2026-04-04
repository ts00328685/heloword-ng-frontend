import { doPost, doGet } from './api.service';

export interface VocabShareRequest {
  id: number;
  fromUsername: string;
  toUsername: string;
  sourceGroupId: number;
  groupName: string;
  description?: string;
  language: string;
  wordCount: number;
  shareStatus: 'PENDING' | 'ACCEPTED' | 'REJECTED';
  createDate: string;
}

const BASE = '/frontend-api/api/fe/vocab-share';

export async function sendVocabShare(sourceGroupId: number, toUsername: string): Promise<VocabShareRequest> {
  const res = await doPost(BASE, { sourceGroupId, toUsername });
  return res.data as VocabShareRequest;
}

export async function fetchVocabShareInbox(): Promise<VocabShareRequest[]> {
  const res = await doGet(`${BASE}/inbox`);
  return (res.data ?? []) as VocabShareRequest[];
}

export async function acceptVocabShare(id: number): Promise<VocabShareRequest> {
  const res = await doPost(`${BASE}/${id}/accept`);
  return res.data as VocabShareRequest;
}

export async function rejectVocabShare(id: number): Promise<void> {
  await doPost(`${BASE}/${id}/reject`);
}
