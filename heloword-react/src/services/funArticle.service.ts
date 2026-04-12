import { doGet } from './api.service';

export interface FunArticle {
  word: string;
  content: string;
}

export async function fetchFunArticlePreview(): Promise<FunArticle | null> {
  const res = await doGet<FunArticle>('/frontend-api/api/fe/fun-article/latest');
  if (res.code === '0000' && res.data) return res.data;
  return null;
}

export async function fetchAllFunArticles(): Promise<FunArticle[]> {
  const res = await doGet<FunArticle[]>('/frontend-api/api/fe/fun-article/all');
  if (res.code === '0000' && res.data) return res.data;
  return [];
}
