export interface Role {
  status: number;
  role: string;
  name: string;
}

export interface User {
  username: string;
  fullname: string;
  nickname: string;
  picture: string;
  locale: string;
  email: string;
  googleToken: string;
  facebookToken: string;
  roles: Role[];
  isLoggedIn: boolean;
}

export interface Word {
  id: number;
  createDate?: string;
  updateDate?: string;
  createBy?: string;
  status: number;
  version?: string;
  word: string;
  translateEn: string;
  translateCh: string;
  level?: string;
  tag?: string;
  type?: string;
  note?: string;
  info?: string;
  language: string;
  tableName?: string;
  recordSaved?: boolean;
}

export interface Sentence extends Word {
  sentence: string;
  sentences?: Sentence[];
}

export interface QuizSetting {
  id?: number;
  timestamp: Date;
  latestFinishedTime?: Date;
  min?: number;
  max?: number;
  type: string;
  tableName: string;
  total: number;
  isSelected: boolean;
  finishedCount?: number;
}

export interface CommonResponse<T = any> {
  timestamp: Date;
  code: string;
  message: string;
  data: T;
}

export interface WordStore {
  wordEnglishList: Sentence[];
  wordGermanList: Sentence[];
  wordJapaneseList: Sentence[];
}

export interface SentenceStore {
  sentenceEnglishList: Sentence[];
  sentenceGermanList: Sentence[];
  sentenceJapaneseList: Sentence[];
}

// Table name mapping
export const TYPE_TO_TABLE_MAP: Record<string, string> = {
  wordEnglishList: 'word_english',
  wordGermanList: 'word_german',
  wordJapaneseList: 'word_japanese',
  sentenceEnglishList: 'sentence_english',
  sentenceGermanList: 'sentence_german',
  sentenceJapaneseList: 'sentence_japanese',
};

export interface DueWord {
  answerId: number;
  answerTableName: string;
  lastReviewTime: string;
  nextReviewTime: string;
  reviewCount: number;
  correctCount: number;
}

/** Group-level spaced-repetition state (one entry per unique type:min:max range). */
export interface DueGroup {
  groupKey: string;          // "type:min:max"
  type: string;
  min: number;
  max: number;
  /** UNFINISHED: in-progress session; DUE: interval elapsed; FRESH: grace missed; SCHEDULED: waiting */
  status: 'UNFINISHED' | 'DUE' | 'FRESH' | 'SCHEDULED';
  reviewLevel: number;       // 0–6, index into intervals array
  nextReviewTime?: Date;     // when the review becomes/became due
  lastCompletionTime?: Date; // when the group was last fully completed
}

export interface DailyStat {
  date: string;       // "YYYY-MM-DD"
  total: number;
  wrongCount: number;
  timeSpent: number;  // seconds
}

export const WORD_SENTENCE_TITLE_MAP: Record<string, string> = {
  wordEnglishList: 'English Words',
  wordGermanList: 'German Words',
  wordJapaneseList: 'Japanese Words',
  sentenceEnglishList: 'English Sentences',
  sentenceGermanList: 'German Sentences',
  sentenceJapaneseList: 'Japanese Sentences',
};
