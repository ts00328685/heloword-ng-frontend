import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { QuizSetting, Sentence, WordStore } from '../models';
import { useData } from '../contexts/DataContext';
import { useAuth } from '../contexts/AuthContext';
import { useUI } from '../contexts/UIContext';
import { doPost } from '../services/api.service';
import { DEFAULT_INTERVALS_MS, getIntervals, saveIntervals, formatInterval } from '../utils/ebbinghaus';

// Language color palette keyed by list type
const TYPE_COLOR: Record<string, { bg: string; dot: string; badge: string }> = {
  wordEnglishList:     { bg: 'bg-blue-50 dark:bg-blue-900/20',   dot: 'bg-blue-400',   badge: 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300' },
  wordGermanList:      { bg: 'bg-red-50 dark:bg-red-900/20',     dot: 'bg-red-400',    badge: 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-300' },
  wordJapaneseList:    { bg: 'bg-pink-50 dark:bg-pink-900/20',   dot: 'bg-pink-400',   badge: 'bg-pink-100 dark:bg-pink-900/40 text-pink-600 dark:text-pink-300' },
  sentenceEnglishList: { bg: 'bg-cyan-50 dark:bg-cyan-900/20',   dot: 'bg-cyan-400',   badge: 'bg-cyan-100 dark:bg-cyan-900/40 text-cyan-600 dark:text-cyan-300' },
  sentenceGermanList:  { bg: 'bg-orange-50 dark:bg-orange-900/20', dot: 'bg-orange-400', badge: 'bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-300' },
  sentenceJapaneseList:{ bg: 'bg-purple-50 dark:bg-purple-900/20', dot: 'bg-purple-400', badge: 'bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-300' },
};
const DEFAULT_COLOR = { bg: 'bg-gray-50 dark:bg-gray-800', dot: 'bg-gray-400', badge: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300' };

interface QuizSettingItemProps {
  setting: QuizSetting;
  title: string;
  onChange: (setting: QuizSetting) => void;
}

const Toggle: React.FC<{ checked: boolean; onChange: () => void }> = ({ checked, onChange }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    onClick={onChange}
    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
      checked ? 'bg-blue-500' : 'bg-gray-200 dark:bg-gray-600'
    }`}
  >
    <span
      aria-hidden="true"
      className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-md ring-0 transition-transform duration-200 ease-in-out ${
        checked ? 'translate-x-5' : 'translate-x-0'
      }`}
    />
  </button>
);

const QuizSettingItem: React.FC<QuizSettingItemProps> = ({ setting, title, onChange }) => {
  const color = TYPE_COLOR[setting.type] ?? DEFAULT_COLOR;
  const { t } = useTranslation();

  // Local string state so the user can freely edit without being snapped back mid-type.
  // Sync back to parent as a raw number (no clamping) — clamping happens on Start.
  const [minStr, setMinStr] = useState(String(setting.min ?? 1));
  const [maxStr, setMaxStr] = useState(String(setting.max ?? setting.total));

  // When the setting is toggled on, reset the displayed values.
  useEffect(() => {
    if (setting.isSelected) {
      setMinStr(String(setting.min ?? 1));
      setMaxStr(String(setting.max ?? setting.total));
    }
  }, [setting.isSelected]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      className={`rounded-2xl border-2 transition-all duration-200 overflow-hidden ${
        setting.isSelected
          ? 'border-blue-400 dark:border-blue-500 shadow-sm'
          : 'border-gray-100 dark:border-gray-700'
      }`}
    >
      {/* Header row */}
      <div
        className={`flex items-center justify-between px-4 py-3 cursor-pointer ${
          setting.isSelected ? 'bg-white dark:bg-gray-800' : 'bg-white dark:bg-gray-800'
        }`}
        onClick={() => onChange({ ...setting, isSelected: !setting.isSelected })}
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${color.dot}`} />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">{title}</p>
            <p className="text-xs text-gray-400 dark:text-gray-500">{t('quizModal.itemCount', { count: setting.total })}</p>
          </div>
        </div>
        <Toggle
          checked={setting.isSelected}
          onChange={() => onChange({ ...setting, isSelected: !setting.isSelected })}
        />
      </div>

      {/* Range picker — revealed when selected */}
      {setting.isSelected && (
        <div className={`px-4 pb-4 pt-1 ${color.bg}`}>
          <div className="flex items-center gap-2 mb-2">
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${color.badge}`}>
              {t('quizModal.range', { min: setting.min ?? 1, max: setting.max ?? setting.total })}
            </span>
            <span className="text-xs text-gray-400 dark:text-gray-500">
              {t('quizModal.countSelected', { count: (setting.max ?? setting.total) - (setting.min ?? 1) + 1 })}
            </span>
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs text-gray-500 dark:text-gray-400 font-medium block mb-1.5">{t('quizModal.from')}</label>
              <input
                type="number"
                min={1}
                max={setting.total}
                value={minStr}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => {
                  setMinStr(e.target.value);
                  const v = parseInt(e.target.value, 10);
                  if (!isNaN(v)) onChange({ ...setting, min: v });
                }}
                className="w-full text-sm border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
              />
            </div>
            <div className="flex-1">
              <label className="text-xs text-gray-500 dark:text-gray-400 font-medium block mb-1.5">{t('quizModal.to')}</label>
              <input
                type="number"
                min={1}
                max={setting.total}
                value={maxStr}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => {
                  setMaxStr(e.target.value);
                  const v = parseInt(e.target.value, 10);
                  if (!isNaN(v)) onChange({ ...setting, max: v });
                }}
                className="w-full text-sm border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

interface QuizSettingModalProps {
  onClose: () => void;
}

const QuizSettingModal: React.FC<QuizSettingModalProps> = ({ onClose }) => {
  const { wordStore, sentenceStore, isWordStoreEmpty, isSentenceStoreEmpty, updateWordStore, updateSentenceStore } = useData();
  const { isLoggedIn } = useAuth();
  const { showAlert } = useUI();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [dataLoading, setDataLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const fetchedRef = useRef(false);

  // Interval configurator state (in minutes for display)
  const [showIntervalConfig, setShowIntervalConfig] = useState(false);
  const [intervalInputs, setIntervalInputs] = useState<string[]>(() =>
    getIntervals().map((ms) => String(Math.round(ms / 60_000))),
  );

  const handleSaveIntervals = () => {
    const parsed = intervalInputs.map((v) => Math.max(1, Number(v) || 1) * 60_000);
    saveIntervals(parsed);
    setShowIntervalConfig(false);
  };

  const handleResetIntervals = () => {
    setIntervalInputs(DEFAULT_INTERVALS_MS.map((ms) => String(Math.round(ms / 60_000))));
    saveIntervals([...DEFAULT_INTERVALS_MS]);
  };

  const buildInitialSettings = (ws = wordStore, ss = sentenceStore): QuizSetting[] => {
    const combined = { ...ws, ...ss } as Record<string, any[]>;
    return Object.entries(combined)
      .filter(([, list]) => list && list.length > 0)
      .map(([key, list]) => ({
        timestamp: new Date(),
        type: key,
        total: list.length,
        tableName: list[0]?.tableName || '',
        isSelected: false,
        min: 1,
        max: list.length,
      }));
  };

  const [settings, setSettings] = useState<QuizSetting[]>(buildInitialSettings);

  useEffect(() => {
    if (fetchedRef.current || !isWordStoreEmpty() || !isSentenceStoreEmpty()) return;
    fetchedRef.current = true;
    setDataLoading(true);
    setLoadError(false);
    doPost('/frontend-api/api/fe/home/dashboard')
      .then((response) => {
        const d = response.data || {};
        const words: WordStore = {
          wordEnglishList: d.wordEnglishList || [],
          wordGermanList: d.wordGermanList || [],
          wordJapaneseList: d.wordJapaneseList || [],
        };
        const sentences = {
          sentenceEnglishList: d.sentenceEnglishList || [],
          sentenceGermanList: d.sentenceGermanList || [],
          sentenceJapaneseList: d.sentenceJapaneseList || [],
        };
        if (isLoggedIn && d.sentenceEnglishList?.length) {
          const sentenceMap: Record<string, string> = {};
          (d.sentenceEnglishList as Sentence[]).forEach((s) => { if (s.word) sentenceMap[s.word] = s.sentence; });
          (words.wordEnglishList || []).forEach((w) => { if (sentenceMap[w.word]) w.sentence = sentenceMap[w.word]; });
        }
        updateWordStore(words);
        updateSentenceStore(sentences);
        setSettings(buildInitialSettings(words, sentences));
      })
      .catch(() => setLoadError(true))
      .finally(() => setDataLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedCount = settings.filter((s) => s.isSelected).length;

  const handleChange = (index: number, updated: QuizSetting) => {
    setSettings((prev) => prev.map((s, i) => (i === index ? updated : s)));
  };

  const handleSelectAll = () => {
    const allSelected = settings.every((s) => s.isSelected);
    setSettings((prev) => prev.map((s) => ({ ...s, isSelected: !allSelected })));
  };

  const handleStart = () => {
    const selected = settings.filter((s) => s.isSelected);
    if (selected.length === 0) {
      showAlert(t('quizModal.selectList'));
      return;
    }
    const timestamp = new Date();
    const quizSettings: Record<string, QuizSetting> = {};
    selected.forEach((s) => {
      // Clamp at start time so mid-edit values don't cause invalid ranges
      const min = Math.max(1, Math.min(s.min ?? 1, s.total));
      const max = Math.max(min, Math.min(s.max ?? s.total, s.total));
      quizSettings[s.type] = { ...s, timestamp, min, max };
    });
    onClose();
    navigate('/vocabulary/quiz', { state: { quizSettings } });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-900 rounded-t-3xl sm:rounded-3xl w-full max-w-md max-h-[90vh] flex flex-col shadow-2xl animate-fade-in">

        {/* Drag handle (mobile) */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 bg-gray-200 dark:bg-gray-700 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-3 pb-4 border-b border-gray-100 dark:border-gray-800">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">{t('quizModal.title')}</h2>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
              {selectedCount === 0 ? t('quizModal.subtitleEmpty') : t('quizModal.subtitleCount', { count: selectedCount })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSelectAll}
              className="text-xs font-semibold text-blue-500 hover:text-blue-700 dark:hover:text-blue-300 px-2 py-1 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
            >
              {settings.every((s) => s.isSelected) ? t('quizModal.deselectAll') : t('quizModal.selectAll')}
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <svg className="w-5 h-5 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">

          {/* Ebbinghaus info card */}
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-2xl p-3 mb-1">
            <div className="flex items-start gap-2">
              <span className="text-base mt-0.5">🧠</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 mb-1">{t('quizModal.ebbinghausTitle')}</p>
                <p className="text-xs text-blue-600 dark:text-blue-400 leading-relaxed">{t('quizModal.ebbinghausDesc')}</p>
                <p className="text-xs text-blue-500 dark:text-blue-500 mt-1 font-medium">{t('quizModal.recommendedSize')}</p>
              </div>
            </div>

            {/* Current intervals display */}
            <div className="mt-2 flex flex-wrap gap-1">
              {getIntervals().map((ms, i) => (
                <span key={i} className="text-xs bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300 px-1.5 py-0.5 rounded-md font-mono">
                  {formatInterval(ms)}
                </span>
              ))}
            </div>

            {/* Toggle interval configurator */}
            <button
              onClick={() => setShowIntervalConfig((v) => !v)}
              className="mt-2 text-xs text-blue-500 dark:text-blue-400 font-medium hover:underline"
            >
              {showIntervalConfig ? '▲' : '▼'} {t('quizModal.customizeIntervals')}
            </button>

            {showIntervalConfig && (
              <div className="mt-2 space-y-2">
                <div className="grid grid-cols-4 gap-1.5">
                  {intervalInputs.map((val, i) => (
                    <div key={i} className="flex flex-col items-center gap-0.5">
                      <span className="text-xs text-blue-400 dark:text-blue-500 font-medium">{i + 1}</span>
                      <input
                        type="number"
                        min={1}
                        value={val}
                        onChange={(e) => {
                          const updated = [...intervalInputs];
                          updated[i] = e.target.value;
                          setIntervalInputs(updated);
                        }}
                        className="w-full text-xs border border-blue-200 dark:border-blue-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 rounded-lg px-1.5 py-1 text-center focus:outline-none focus:ring-1 focus:ring-blue-400"
                      />
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleResetIntervals}
                    className="flex-1 text-xs py-1.5 rounded-xl border border-blue-200 dark:border-blue-700 text-blue-500 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
                  >
                    {t('quizModal.resetIntervals')}
                  </button>
                  <button
                    onClick={handleSaveIntervals}
                    className="flex-1 text-xs py-1.5 rounded-xl bg-blue-500 hover:bg-blue-600 text-white font-semibold transition-colors"
                  >
                    {t('quizModal.saveIntervals')}
                  </button>
                </div>
              </div>
            )}
          </div>

          {dataLoading ? (
            <div className="text-center py-10">
              <div className="w-7 h-7 border-4 border-blue-400 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <p className="text-sm text-gray-400 dark:text-gray-500">{t('quizModal.noLists')}</p>
            </div>
          ) : loadError ? (
            <p className="text-center text-red-400 dark:text-red-500 py-10 text-sm">{t('quizModal.loadError')}</p>
          ) : settings.length === 0 ? (
            <p className="text-center text-gray-400 dark:text-gray-500 py-10 text-sm">
              {t('quizModal.loadError')}
            </p>
          ) : (
            settings.map((s, i) => (
              <QuizSettingItem
                key={s.type}
                setting={s}
                title={t(`wordLists.${s.type}`, s.type)}
                onChange={(updated) => handleChange(i, updated)}
              />
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-4 border-t border-gray-100 dark:border-gray-800">
          <button
            onClick={handleStart}
            disabled={selectedCount === 0}
            className={`w-full font-bold py-4 rounded-2xl transition-all text-base ${
              selectedCount > 0
                ? 'bg-blue-500 hover:bg-blue-600 active:scale-[0.98] text-white shadow-md shadow-blue-200 dark:shadow-none'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-600 cursor-not-allowed'
            }`}
          >
            {selectedCount === 0 ? t('quizModal.selectList') : t('quizModal.startQuiz')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default QuizSettingModal;
