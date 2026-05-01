import { doGet } from './api.service';

export interface NHKArticle {
  id: number;
  title: string;
  sourceUrl: string | null;
  sourceLang: string;
  createDate: number; // epoch ms from Java Date serialization
}

export interface NHKVocabItem {
  word: string;
  reading: string;
  meaning_zh: string;
  meaning_en: string;
}

export interface NHKParagraph {
  original: string;
  ja: string;
  en: string;
  zh: string;
  grammar: string;
  vocabulary: NHKVocabItem[];
}

export interface NHKArticleDetail extends NHKArticle {
  contentJa: string;
  contentEn: string;
  contentZh: string;
  contentGrammar: string;
  contentVocabulary: NHKVocabItem[];
  paragraphs: NHKParagraph[];
}

export async function fetchNHKArticles(): Promise<NHKArticle[]> {
  const res = await doGet<NHKArticle[]>('/frontend-api/api/fe/nhk-article/list');
  if (res.code === '0000' && res.data) return res.data;
  return [];
}

export async function fetchNHKArticleById(id: number | string): Promise<NHKArticleDetail | null> {
  const res = await doGet<NHKArticleDetail>(`/frontend-api/api/fe/nhk-article/${id}`);
  if (res.code === '0000' && res.data) return res.data;
  return null;
}
