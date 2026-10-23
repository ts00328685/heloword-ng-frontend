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
        <span className="flex items-center gap-1.5 text-ink-muted font-medium">
          
          <span>{label}</span>
          {extra && <span className="text-ink-faint font-normal">{extra}</span>}
        </span>
        <span className={`font-semibold tabular-nums ${done ? 'text-success' : 'text-ink '}`}>
          {current}/{goal}
          {done && <span className="ml-1">✓</span>}
        </span>
      </div>
      <div className="h-2 bg-ink/5 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${done ? 'bg-success' : 'bg-ink'}`}
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
        <div className="bg-surface rounded-2xl p-4 shadow-sm border border-dashed border-line flex flex-col items-center gap-2 mb-4">
          <p className="text-sm font-semibold text-ink-muted">{t('dailyGoal.noGoalsTitle')}</p>
          <p className="text-xs text-ink-faint text-center">{t('dailyGoal.noGoalsHint')}</p>
          <button
            onClick={() => setShowModal(true)}
            className="mt-1 px-4 py-2 rounded-xl text-sm font-semibold bg-ink hover:bg-ink/85 text-paper transition-colors"
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
          ? 'bg-success-soft border-success/30 '
          : 'bg-surface border-line '
      }`}>

        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-base">{allDone ? '' : ''}</span>
            <h3 className="text-sm font-semibold text-ink">
              {allDone ? t('dailyGoal.allDone') : t('dailyGoal.todayGoals')}
            </h3>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="p-1.5 rounded-lg text-ink-faint hover:text-ink-muted hover:bg-ink/5 transition-colors"
            title={t('dailyGoal.editGoals')}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
        </div>

        {/* Language toggle */}
        <div className="flex gap-1 bg-ink/5 rounded-xl p-1 mb-3">
          {(['japanese', 'english'] as const).map(lang => {
            const hasGoalForLang = FIELDS.some(f => config[lang][f.key] > 0);
            if (!hasGoalForLang) return null;
            return (
              <button
                key={lang}
                onClick={() => setActiveLang(lang)}
                className={`flex-1 py-1 text-xs font-semibold rounded-lg transition-colors ${
                  activeLang === lang
                    ? 'bg-surface text-ink shadow-sm'
                    : 'text-ink-muted '
                }`}
              >
                {lang === 'japanese' ? 'JP' : 'EN'}
              </button>
            );
          })}
        </div>

        {/* Progress bars */}
        {activeFields.length === 0 ? (
          <p className="text-xs text-ink-faint text-center py-2">
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
