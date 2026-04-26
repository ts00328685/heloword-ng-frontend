import React from 'react';
import { useTranslation } from 'react-i18next';
import rawGroups from '../data/jp-tag-groups.json';

export interface TagGroup {
  name: string;
  label: string;
  tags: string[];
}

export const TAG_GROUPS: TagGroup[] = rawGroups as TagGroup[];

const DIFFICULTIES = ['easy', 'medium', 'hard'];
const JLPT_LEVELS = ['N1', 'N2', 'N3', 'N4', 'N5'];

const DIFF_ACTIVE: Record<string, string> = {
  easy:   'bg-green-500 text-white',
  medium: 'bg-blue-500 text-white',
  hard:   'bg-red-500 text-white',
};
const JLPT_ACTIVE = 'bg-indigo-500 text-white';
const DIFF_INACTIVE = 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300';

// 6 distinct colors for the group pills
const GROUP_ACTIVE = [
  'bg-violet-500 text-white',
  'bg-pink-500 text-white',
  'bg-amber-500 text-white',
  'bg-teal-500 text-white',
  'bg-sky-500 text-white',
  'bg-orange-500 text-white',
];

export interface JpSentenceFilterProps {
  selectedDifficulties: string[];
  onDifficultiesChange: (diffs: string[]) => void;
  /** null = all JLPT levels */
  selectedJlpt: string[] | null;
  onJlptChange: (levels: string[] | null) => void;
  /** null = all groups selected */
  selectedGroups: string[] | null;
  onGroupsChange: (groups: string[] | null) => void;
}

const JpSentenceFilter: React.FC<JpSentenceFilterProps> = ({
  selectedDifficulties,
  onDifficultiesChange,
  selectedJlpt,
  onJlptChange,
  selectedGroups,
  onGroupsChange,
}) => {
  const { t } = useTranslation();

  const toggleDifficulty = (d: string) => {
    if (selectedDifficulties.includes(d)) {
      if (selectedDifficulties.length === 1) return;
      onDifficultiesChange(selectedDifficulties.filter(x => x !== d));
    } else {
      onDifficultiesChange([...selectedDifficulties, d]);
    }
  };

  const toggleJlpt = (level: string) => {
    if (selectedJlpt === null) {
      onJlptChange([level]);
    } else if (selectedJlpt.includes(level)) {
      if (selectedJlpt.length === 1) {
        onJlptChange(null);
      } else {
        onJlptChange(selectedJlpt.filter(l => l !== level));
      }
    } else {
      const next = [...selectedJlpt, level];
      onJlptChange(next.length === JLPT_LEVELS.length ? null : next);
    }
  };

  const toggleGroup = (name: string) => {
    if (selectedGroups === null) {
      onGroupsChange([name]);
    } else if (selectedGroups.includes(name)) {
      if (selectedGroups.length === 1) {
        onGroupsChange(null);
      } else {
        onGroupsChange(selectedGroups.filter(g => g !== name));
      }
    } else {
      const next = [...selectedGroups, name];
      onGroupsChange(next.length === TAG_GROUPS.length ? null : next);
    }
  };

  return (
    <div className="space-y-1.5">
      {/* Difficulty row */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[11px] text-gray-400 dark:text-gray-500 w-14 shrink-0">{t('jpFilter.difficulty')}</span>
        {DIFFICULTIES.map(d => (
          <button
            key={d}
            onClick={() => toggleDifficulty(d)}
            className={`px-2.5 py-0.5 rounded-lg text-xs font-semibold transition-colors ${
              selectedDifficulties.includes(d) ? DIFF_ACTIVE[d] : DIFF_INACTIVE
            }`}
          >
            {t(`jpFilter.${d}`)}
          </button>
        ))}
      </div>

      {/* JLPT row */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[11px] text-gray-400 dark:text-gray-500 w-14 shrink-0">{t('jpFilter.jlpt')}</span>
        {selectedJlpt !== null && (
          <button
            onClick={() => onJlptChange(null)}
            className="px-2 py-0.5 rounded-lg text-[10px] font-semibold bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            {t('jpFilter.all')}
          </button>
        )}
        {JLPT_LEVELS.map(level => {
          const active = selectedJlpt === null || selectedJlpt.includes(level);
          return (
            <button
              key={level}
              onClick={() => toggleJlpt(level)}
              className={`px-2.5 py-0.5 rounded-lg text-xs font-semibold transition-colors ${
                active ? JLPT_ACTIVE : DIFF_INACTIVE
              }`}
            >
              {level}
            </button>
          );
        })}
      </div>

      {/* Topic groups row */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[11px] text-gray-400 dark:text-gray-500 w-14 shrink-0">{t('jpFilter.topics')}</span>
        {selectedGroups !== null && (
          <button
            onClick={() => onGroupsChange(null)}
            className="px-2 py-0.5 rounded-lg text-[10px] font-semibold bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            {t('jpFilter.all')}
          </button>
        )}
        {TAG_GROUPS.map((g, i) => {
          const active = selectedGroups === null || selectedGroups.includes(g.name);
          return (
            <button
              key={g.name}
              onClick={() => toggleGroup(g.name)}
              title={t(`jpFilter.groups.${g.name}`, { defaultValue: g.label })}
              className={`px-2.5 py-0.5 rounded-lg text-xs font-semibold transition-colors max-w-[160px] truncate ${
                active ? GROUP_ACTIVE[i % GROUP_ACTIVE.length] : DIFF_INACTIVE
              }`}
            >
              {t(`jpFilter.groups.${g.name}`, { defaultValue: g.label })}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default JpSentenceFilter;

/** Returns items matching the selected difficulties, JLPT levels, and topic groups. Falls back to full pool if result is empty. */
export function applyJpFilter<T extends { difficulty: string; tags: string[] }>(
  pool: T[],
  selectedDifficulties: string[],
  selectedGroups: string[] | null,
  selectedJlpt: string[] | null = null,
): T[] {
  const selectedTagSet: Set<string> | null =
    selectedGroups === null
      ? null
      : new Set(
          TAG_GROUPS.filter(g => selectedGroups.includes(g.name)).flatMap(g => g.tags)
        );

  const jlptSet: Set<string> | null =
    selectedJlpt === null ? null : new Set(selectedJlpt);

  const result = pool.filter(item => {
    if (!selectedDifficulties.includes(item.difficulty)) return false;
    if (selectedTagSet !== null && !item.tags.some(t => selectedTagSet.has(t))) return false;
    if (jlptSet !== null && !item.tags.some(t => jlptSet.has(t))) return false;
    return true;
  });
  return result.length > 0 ? result : pool;
}
