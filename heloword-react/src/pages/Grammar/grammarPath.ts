export type GrammarLang = 'en' | 'ja';

/** `/grammar?lang=ja` opens the Japanese tab; anything else is English. */
export const grammarLangFrom = (search: string): GrammarLang =>
  new URLSearchParams(search).get('lang') === 'ja' ? 'ja' : 'en';

/** Link to the grammar page, optionally to one topic. Kept free of content so any page can import it. */
export const grammarPath = (lang: GrammarLang, topicId?: string) =>
  `/grammar${lang === 'ja' ? '?lang=ja' : ''}${topicId ? `#${topicId}` : ''}`;
