import React from 'react';
import { useTranslation } from 'react-i18next';

// Character-length thresholds derived from p33/p66 of the scramble-en dataset
const EASY_MAX = 85;  // ≤85 chars → easy
const HARD_MIN = 96;  // ≥96 chars → hard

export type EnDifficulty = 'easy' | 'medium' | 'hard';
export const EN_DIFFICULTIES: EnDifficulty[] = ['easy', 'medium', 'hard'];

export function enSentenceDifficulty(sentence: string): EnDifficulty {
  const len = sentence.length;
  if (len <= EASY_MAX) return 'easy';
  if (len < HARD_MIN)  return 'medium';
  return 'hard';
}

export function applyEnDifficultyFilter<T extends { sentence: string }>(
  pool: T[],
  selected: EnDifficulty[],
): T[] {
  if (selected.length === EN_DIFFICULTIES.length) return pool;
  const result = pool.filter(item => selected.includes(enSentenceDifficulty(item.sentence)));
  return result.length > 0 ? result : pool;
}

const ACTIVE: Record<EnDifficulty, string> = {
  easy:   'bg-green-500 text-white',
  medium: 'bg-blue-500 text-white',
  hard:   'bg-red-500 text-white',
};
const INACTIVE = 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300';

interface Props {
  selected: EnDifficulty[];
  onChange: (diffs: EnDifficulty[]) => void;
}

const EnDifficultyFilter: React.FC<Props> = ({ selected, onChange }) => {
  const { t } = useTranslation();

  const toggle = (d: EnDifficulty) => {
    if (selected.includes(d)) {
      if (selected.length === 1) return;
      onChange(selected.filter(x => x !== d));
    } else {
      onChange([...selected, d]);
    }
  };

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="text-[11px] text-gray-400 dark:text-gray-500 w-14 shrink-0">{t('jpFilter.difficulty')}</span>
      {EN_DIFFICULTIES.map(d => (
        <button
          key={d}
          onClick={() => toggle(d)}
          className={`px-2.5 py-0.5 rounded-lg text-xs font-semibold transition-colors ${
            selected.includes(d) ? ACTIVE[d] : INACTIVE
          }`}
        >
          {t(`jpFilter.${d}`)}
        </button>
      ))}
    </div>
  );
};

export default EnDifficultyFilter;
