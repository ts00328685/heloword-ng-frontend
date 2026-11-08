import { GRAMMAR_TOPICS, GrammarTopic } from './grammarContent';
import { GrammarLang } from './grammarPath';
import { GRAMMAR_TOPICS_JA } from './grammarContentJa';

export const GRAMMAR: Record<GrammarLang, { heading: string; topics: GrammarTopic[] }> = {
  en: { heading: '英文句子的組成', topics: GRAMMAR_TOPICS },
  ja: { heading: '日文句子的組成', topics: GRAMMAR_TOPICS_JA },
};
