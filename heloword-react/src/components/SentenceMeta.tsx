import React from 'react';
import { useTranslation } from 'react-i18next';
import { TAG_GROUPS } from './JpSentenceFilter';

const JLPT = /^N[1-5]$/;

/**
 * Level and category of the sentence being practised, e.g. "中等 · N2 · 個人成長".
 * Uses the same labels as the practice filters. Renders nothing when there is
 * nothing to show (e.g. an AI-made sentence).
 */
const SentenceMeta: React.FC<{ difficulty?: string; tags?: string[]; className?: string }> = ({
  difficulty, tags = [], className = '',
}) => {
  const { t } = useTranslation();
  const parts: string[] = [];
  if (difficulty) parts.push(t(`jpFilter.${difficulty}`, { defaultValue: difficulty }));
  const jlpt = tags.find((tag) => JLPT.test(tag));
  if (jlpt) parts.push(jlpt);
  // Topic: the first filter group any of the sentence's tags belongs to.
  const group = TAG_GROUPS.find((g) => g.tags.some((tag) => tags.includes(tag)));
  if (group) parts.push(t(`jpFilter.groups.${group.name}`, { defaultValue: group.label }));
  if (parts.length === 0) return null;
  return (
    <span className={`text-[11px] tracking-wide text-ink-faint whitespace-nowrap ${className}`}>
      {parts.join(' · ')}
    </span>
  );
};

export default SentenceMeta;
