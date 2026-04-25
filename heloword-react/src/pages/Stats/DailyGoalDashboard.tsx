import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDailyGoal } from '../../contexts/DailyGoalContext';
import { GoalLang, ProgressLang } from '../../services/dailyGoal.service';
import DailyGoalSetupModal from './DailyGoalSetupModal';

interface BarRowProps {
  icon: string;
  label: string;
  current: number;
  goal: number;
  extra?: string;
}

const BarRow: React.FC<BarRowProps> = ({ icon, label, current, goal, extra }) => {
  const pct = goal > 0 ? Math.min(100, Math.round((current / goal) * 100)) : 0;
  const done = current >= goal;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 text-gray-600 dark:text-gray-300 font-medium">
          <span>{icon}</span>
          <span>{label}</span>
          {extra && <span className="text-gray-400 dark:text-gray-500 font-normal">{extra}</span>}
        </span>
        <span className={`font-bold tabular-nums ${done ? 'text-green-500' : 'text-gray-700 dark:text-gray-200'}`}>
          {current}/{goal}
          {done && <span className="ml-1">✓</span>}
        </span>
      </div>
      <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${done ? 'bg-green-400' : 'bg-blue-400'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
};

const FIELDS: Array<{ key: keyof GoalLang; labelKey: string; icon: string }> = [
  { key: 'quizWords',         labelKey: 'dailyGoal.fieldQuizWords', icon: '📚' },
  { key: 'scrambleSentences', labelKey: 'dailyGoal.fieldScramble',  icon: '🧩' },
  { key: 'spokenSentences',   labelKey: 'dailyGoal.fieldSpoken',    icon: '🎤' },
  { key: 'writtenSentences',  labelKey: 'dailyGoal.fieldWritten',   icon: '✍️' },
];

const DailyGoalDashboard: React.FC = () => {
  const { t } = useTranslation();
  const { config, progress, updateConfig, hasGoals, unfinishedCount } = useDailyGoal();
  const [showModal, setShowModal] = useState(false);
  const [activeLang, setActiveLang] = useState<'japanese' | 'english'>('japanese');

  const goalLang: GoalLang = config[activeLang];
  const progLang: ProgressLang = progress[activeLang];
  const activeFields = FIELDS.filter(f => goalLang[f.key] > 0);

  if (!hasGoals) {
    return (
      <>
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-dashed border-gray-200 dark:border-gray-700 flex flex-col items-center gap-2 mb-4">
          <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">{t('dailyGoal.noGoalsTitle')}</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 text-center">{t('dailyGoal.noGoalsHint')}</p>
          <button
            onClick={() => setShowModal(true)}
            className="mt-1 px-4 py-2 rounded-xl text-sm font-semibold bg-blue-500 hover:bg-blue-600 text-white transition-colors"
          >
            {t('dailyGoal.setGoals')}
          </button>
        </div>
        {showModal && (
          <DailyGoalSetupModal config={config} onSave={updateConfig} onClose={() => setShowModal(false)} />
        )}
      </>
    );
  }

  const allDone = unfinishedCount === 0;

  return (
    <>
      <div className={`rounded-2xl p-4 shadow-sm border mb-4 ${
        allDone
          ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
          : 'bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700'
      }`}>

        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-base">{allDone ? '🎉' : '🎯'}</span>
            <h3 className="text-sm font-bold text-gray-800 dark:text-gray-100">
              {allDone ? t('dailyGoal.allDone') : t('dailyGoal.todayGoals')}
            </h3>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            title={t('dailyGoal.editGoals')}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
        </div>

        {/* Language toggle */}
        <div className="flex gap-1 bg-gray-100 dark:bg-gray-700 rounded-xl p-1 mb-3">
          {(['japanese', 'english'] as const).map(lang => {
            const hasGoalForLang = FIELDS.some(f => config[lang][f.key] > 0);
            if (!hasGoalForLang) return null;
            return (
              <button
                key={lang}
                onClick={() => setActiveLang(lang)}
                className={`flex-1 py-1 text-xs font-semibold rounded-lg transition-colors ${
                  activeLang === lang
                    ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100 shadow-sm'
                    : 'text-gray-500 dark:text-gray-400'
                }`}
              >
                {lang === 'japanese' ? '🇯🇵 JP' : '🇬🇧 EN'}
              </button>
            );
          })}
        </div>

        {/* Progress bars */}
        {activeFields.length === 0 ? (
          <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-2">
            {t('dailyGoal.noGoalsForLang')}
          </p>
        ) : (
          <div className="space-y-3">
            {activeFields.map(({ key, labelKey, icon }) => {
              const avgScore = key === 'spokenSentences' && progLang.spokenSentences > 0
                ? Math.round(progLang.spokenScoreTotal / progLang.spokenSentences)
                : null;
              return (
                <BarRow
                  key={key}
                  icon={icon}
                  label={t(labelKey)}
                  current={progLang[key as keyof ProgressLang] as number}
                  goal={goalLang[key]}
                  extra={avgScore != null ? `(avg ${avgScore}%)` : undefined}
                />
              );
            })}
          </div>
        )}

      </div>

      {showModal && (
        <DailyGoalSetupModal config={config} onSave={updateConfig} onClose={() => setShowModal(false)} />
      )}
    </>
  );
};

export default DailyGoalDashboard;
