import React, { useState } from 'react';
import TapToLookup from './TapToLookup';
import { useTranslation } from 'react-i18next';
import { getWeeklyStory, WeeklyStory } from '../services/llm.service';
import { aiErrorMessage } from '../utils/aiError';

/**
 * Members only. The server builds the story from the member's own most-missed words and
 * stores it for the whole week, so re-opening it is free.
 */
const WeeklyStoryCard: React.FC = () => {
  const { t } = useTranslation();
  const [story, setStory] = useState<WeeklyStory | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showTranslation, setShowTranslation] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setStory(await getWeeklyStory());
    } catch (e) {
      setError(aiErrorMessage(e, true));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mb-5 bg-gray-50 dark:bg-gray-800/60 rounded-2xl ring-1 ring-inset ring-gray-100 dark:ring-gray-700 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">📖 {t('llm.weeklyStory')}</p>
        {!story && (
          <button
            data-analytics="ai.weekly_story"
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ring-1 ring-inset ring-gray-300 dark:ring-gray-600 text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-900 hover:ring-gray-500 disabled:opacity-40 transition-all"
          >
            {loading
              ? <><span className="w-3 h-3 border-[1.5px] border-current border-t-transparent rounded-full animate-spin" />{t('llm.thinking')}</>
              : t('llm.weeklyStoryGenerate')}
          </button>
        )}
      </div>

      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}

      {story && !story.story && (
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{t('llm.weeklyStoryEmpty')}</p>
      )}

      {story?.story && (
        <div className="mt-2 space-y-2">
          <p className="text-xs text-gray-400 dark:text-gray-500">
            {t('llm.weeklyStoryWords')}{story.words.join('、')}
          </p>
          <p className="text-sm text-gray-800 dark:text-gray-100 leading-relaxed whitespace-pre-wrap"><TapToLookup>{story.story}</TapToLookup></p>
          {story.translation && (
            showTranslation
              ? <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed whitespace-pre-wrap">{story.translation}</p>
              : <button data-analytics="ai.weekly_story.translation" onClick={() => setShowTranslation(true)} className="text-xs text-blue-400 underline">{t('llm.showTranslation')}</button>
          )}
        </div>
      )}
    </div>
  );
};

export default WeeklyStoryCard;
