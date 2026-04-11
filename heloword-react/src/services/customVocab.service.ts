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
