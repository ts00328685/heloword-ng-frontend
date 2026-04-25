import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';
import { DailyGoalConfig, GoalLang } from '../../services/dailyGoal.service';

interface Props {
  config: DailyGoalConfig;
  onSave: (config: DailyGoalConfig) => void;
  onClose: () => void;
}

const FIELDS: Array<{ key: keyof GoalLang; labelKey: string; icon: string }> = [
  { key: 'quizWords',          labelKey: 'dailyGoal.fieldQuizWords',    icon: '📚' },
  { key: 'scrambleSentences',  labelKey: 'dailyGoal.fieldScramble',     icon: '🧩' },
  { key: 'spokenSentences',    labelKey: 'dailyGoal.fieldSpoken',       icon: '🎤' },
  { key: 'writtenSentences',   labelKey: 'dailyGoal.fieldWritten',      icon: '✍️' },
];

const DailyGoalSetupModal: React.FC<Props> = ({ config, onSave, onClose }) => {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<DailyGoalConfig>(JSON.parse(JSON.stringify(config)));
  const [activeLang, setActiveLang] = useState<'japanese' | 'english'>('japanese');

  const update = (field: keyof GoalLang, raw: string) => {
    const val = Math.max(0, parseInt(raw, 10) || 0);
    setDraft(prev => ({
      ...prev,
      [activeLang]: { ...prev[activeLang], [field]: val },
    }));
  };

  const handleSave = () => {
    onSave(draft);
    onClose();
  };

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 px-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl w-full sm:max-w-sm shadow-xl flex flex-col mb-4 sm:mb-0 overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h3 className="text-base font-bold text-gray-800 dark:text-gray-100">
            {t('dailyGoal.setupTitle')}
          </h3>
          <button onClick={onClose} className="p-1.5 rounded-xl text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <p className="text-xs text-gray-400 dark:text-gray-500 px-5 pb-3">{t('dailyGoal.setupHint')}</p>

        {/* Language tabs */}
        <div className="flex gap-1 bg-gray-100 dark:bg-gray-700 rounded-xl p-1 mx-5 mb-4">
          {(['japanese', 'english'] as const).map(lang => (
            <button
              key={lang}
              onClick={() => setActiveLang(lang)}
              className={`flex-1 py-1.5 text-sm font-semibold rounded-lg transition-colors ${
                activeLang === lang
                  ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100 shadow-sm'
                  : 'text-gray-500 dark:text-gray-400'
              }`}
            >
              {lang === 'japanese' ? '🇯🇵 Japanese' : '🇬🇧 English'}
            </button>
          ))}
        </div>

        {/* Goal inputs */}
        <div className="px-5 space-y-3 mb-5">
          {FIELDS.map(({ key, labelKey, icon }) => (
            <div key={key} className="flex items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200 flex-1 min-w-0">
                <span>{icon}</span>
                <span className="truncate">{t(labelKey)}</span>
              </label>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => update(key, String(Math.max(0, draft[activeLang][key] - 1)))}
                  className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-bold text-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors flex items-center justify-center"
                >
                  −
                </button>
                <input
                  type="number"
                  min={0}
                  max={999}
                  value={draft[activeLang][key] || ''}
                  placeholder="0"
                  onChange={e => update(key, e.target.value)}
                  className="w-14 text-center text-sm font-bold bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl py-1.5 text-gray-800 dark:text-gray-100 focus:outline-none focus:border-blue-400"
                />
                <button
                  onClick={() => update(key, String(draft[activeLang][key] + 1))}
                  className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-bold text-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors flex items-center justify-center"
                >
                  +
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Footer buttons */}
        <div className="flex gap-2 px-5 pb-5">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleSave}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-blue-500 hover:bg-blue-600 text-white transition-colors"
          >
            {t('common.save')}
          </button>
        </div>

      </div>
    </div>,
    document.body
  );
};

export default DailyGoalSetupModal;
