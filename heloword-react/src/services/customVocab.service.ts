import { doDelete, doGet, doPost, doPut } from './api.service';

export interface CustomGroup {
  id: number;
  name: string;
  description: string;
  language: string;
  tags?: string;
  wordCount: number;
  createDate: string;
}

export interface CustomWord {
  id: number;
  groupId: number;
  word: string;
  translateEn: string;
  translateCh?: string;
  sentence?: string;
  phonetics?: string;
  sourceWordId?: number;
  sourceTableName?: string;
  /** Fixed — used by quiz polymorphic record saving */
  tableName: 'USER_CUSTOM_WORD';
  language: 'custom';
}

export async function fetchCustomGroups(): Promise<CustomGroup[]> {
  const res = await doGet<CustomGroup[]>('/frontend-api/api/fe/custom-vocab/groups');
  return res.data ?? [];
}

export async function createCustomGroup(name: string, description: string, language: string, tags?: string): Promise<CustomGroup> {
  const res = await doPost<CustomGroup>('/frontend-api/api/fe/custom-vocab/groups', { name, description, language, tags });
  if (res.code !== '0000' || !res.data) throw new Error(res.message || 'Failed to create group');
  return res.data;
}

export async function updateCustomGroup(id: number, name: string, description: string, language: string, tags?: string): Promise<CustomGroup> {
  const res = await doPut<CustomGroup>(`/frontend-api/api/fe/custom-vocab/groups/${id}`, { name, description, language, tags });
  if (res.code !== '0000' || !res.data) throw new Error(res.message || 'Failed to update group');
  return res.data;
}

export async function deleteCustomGroup(id: number): Promise<void> {
  await doDelete(`/frontend-api/api/fe/custom-vocab/groups/${id}`);
}

export async function fetchCustomWords(groupId: number): Promise<CustomWord[]> {
  const res = await doGet<CustomWord[]>(`/frontend-api/api/fe/custom-vocab/groups/${groupId}/words`);
  return (res.data ?? []).map(w => ({ ...w, tableName: 'USER_CUSTOM_WORD' as const, language: 'custom' as const }));
}

export async function addCustomWord(groupId: number, dto: Omit<CustomWord, 'id' | 'groupId' | 'tableName' | 'language'>): Promise<CustomWord> {
  const res = await doPost<CustomWord>(`/frontend-api/api/fe/custom-vocab/groups/${groupId}/words`, dto);
  if (res.code !== '0000' || !res.data) throw new Error(res.message || 'Failed to add word');
  return { ...res.data, tableName: 'USER_CUSTOM_WORD', language: 'custom' };
}

export async function updateCustomWord(wordId: number, dto: Partial<Omit<CustomWord, 'id' | 'groupId' | 'tableName' | 'language'>>): Promise<CustomWord> {
  const res = await doPut<CustomWord>(`/frontend-api/api/fe/custom-vocab/words/${wordId}`, dto);
  if (res.code !== '0000' || !res.data) throw new Error(res.message || 'Failed to update word');
  return { ...res.data, tableName: 'USER_CUSTOM_WORD', language: 'custom' };
}

export async function deleteCustomWord(wordId: number): Promise<void> {
  await doDelete(`/frontend-api/api/fe/custom-vocab/words/${wordId}`);
}

// ── Shared Vocabulary (公開共享) ──────────────────────────────────────────────

export interface SharedVocabGroup {
  id: number;
  groupId: number;
  name: string;
  description: string;
  language: string;
  tags?: string;
  wordCount: number;
  sharerUuid: string;
  sharerDisplayName: string;
  createDate: string;
}

export interface SharedGroupRequest {
  id: number;
  groupId: number;
  name: string;
  description: string;
  language: string;
  tags?: string;
  wordCount: number;
  requesterUuid: string;
  requesterDisplayName: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  createDate: string;
}

export interface PublicShareStatus {
  shareId: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
}

export async function fetchSharedGroups(): Promise<SharedVocabGroup[]> {
  const res = await doGet<SharedVocabGroup[]>('/frontend-api/api/fe/shared-vocab/groups');
  return res.data ?? [];
}

export async function fetchSharedGroupWords(shareId: number): Promise<CustomWord[]> {
  const res = await doGet<CustomWord[]>(`/frontend-api/api/fe/shared-vocab/groups/${shareId}/words`);
  return (res.data ?? []).map(w => ({ ...w, tableName: 'USER_CUSTOM_WORD' as const, language: 'custom' as const }));
}

export async function requestPublicShare(groupId: number): Promise<PublicShareStatus> {
  const res = await doPost<PublicShareStatus>('/frontend-api/api/fe/shared-vocab/request', { groupId });
  if (res.code !== '0000' || !res.data) throw new Error(res.message || 'Failed to request public share');
  return res.data;
}

export async function fetchPublicShareStatus(groupId: number): Promise<PublicShareStatus | null> {
  const res = await doGet<PublicShareStatus | null>(`/frontend-api/api/fe/shared-vocab/status/${groupId}`);
  return res.data ?? null;
}

export async function fetchPendingSharedRequests(): Promise<SharedGroupRequest[]> {
  const res = await doGet<SharedGroupRequest[]>('/frontend-api/api/fe/shared-vocab/admin/pending');
  return res.data ?? [];
}

export async function approveSharedRequest(shareId: number): Promise<void> {
  await doPost(`/frontend-api/api/fe/shared-vocab/admin/${shareId}/approve`, {});
}

export async function rejectSharedRequest(shareId: number): Promise<void> {
  await doPost(`/frontend-api/api/fe/shared-vocab/admin/${shareId}/reject`, {});
}

export async function copySharedGroup(shareId: number): Promise<CustomGroup> {
  const res = await doPost<CustomGroup>(`/frontend-api/api/fe/shared-vocab/groups/${shareId}/copy`, {});
  if (res.code !== '0000' || !res.data) throw new Error(res.message || 'Failed to copy shared group');
  return res.data;
}

export async function deleteSharedGroup(shareId: number): Promise<void> {
  await doDelete(`/frontend-api/api/fe/shared-vocab/admin/${shareId}`);
}
