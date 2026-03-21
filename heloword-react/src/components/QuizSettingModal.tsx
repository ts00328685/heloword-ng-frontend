import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { QuizSetting, WORD_SENTENCE_TITLE_MAP } from '../models';
import { useData } from '../contexts/DataContext';
import { useUI } from '../contexts/UIContext';

interface QuizSettingItemProps {
  setting: QuizSetting;
  title: string;
  onChange: (setting: QuizSetting) => void;
}

const QuizSettingItem: React.FC<QuizSettingItemProps> = ({ setting, title, onChange }) => {
  const handleToggle = () => {
    onChange({ ...setting, isSelected: !setting.isSelected });
  };

  const handleMin = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Math.max(1, Math.min(Number(e.target.value), setting.max ?? setting.total));
    onChange({ ...setting, min: v });
  };

  const handleMax = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Math.min(setting.total, Math.max(Number(e.target.value), setting.min ?? 1));
    onChange({ ...setting, max: v });
  };

  return (
    <div className={`rounded-xl border-2 p-3 transition-all ${setting.isSelected ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'}`}>
      <div className="flex items-center justify-between mb-2">
        <div>
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">{title}</p>
          <p className="text-xs text-gray-400 dark:text-gray-500">Total: {setting.total} items</p>
        </div>
        <button
          onClick={handleToggle}
          className={`w-12 h-6 rounded-full transition-colors relative ${setting.isSelected ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'}`}
        >
          <span
            className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
              setting.isSelected ? 'translate-x-6' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>

      {setting.isSelected && (
        <div className="flex gap-3 mt-2">
          <div className="flex-1">
            <label className="text-xs text-gray-500 dark:text-gray-400 font-medium block mb-1">From</label>
            <input
              type="number"
              min={1}
              max={setting.max ?? setting.total}
              value={setting.min ?? 1}
              onChange={handleMin}
              className="w-full text-sm border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
          <div className="flex-1">
            <label className="text-xs text-gray-500 dark:text-gray-400 font-medium block mb-1">To</label>
            <input
              type="number"
              min={setting.min ?? 1}
              max={setting.total}
              value={setting.max ?? setting.total}
              onChange={handleMax}
              className="w-full text-sm border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
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
  const { wordStore, sentenceStore } = useData();
  const { showAlert } = useUI();
  const navigate = useNavigate();

  const buildInitialSettings = (): QuizSetting[] => {
    const all: QuizSetting[] = [];
    const combined = { ...wordStore, ...sentenceStore } as Record<string, any[]>;

    Object.entries(combined).forEach(([key, list]) => {
      if (!list || list.length < 1) return;
      all.push({
        timestamp: new Date(),
        type: key,
        total: list.length,
        tableName: list[0]?.tableName || '',
        isSelected: false,
        min: 1,
        max: list.length,
      });
    });

    return all;
  };

  const [settings, setSettings] = useState<QuizSetting[]>(buildInitialSettings);

  const handleChange = (index: number, updated: QuizSetting) => {
    setSettings((prev) => prev.map((s, i) => (i === index ? updated : s)));
  };

  const handleStart = () => {
    const selected = settings.filter((s) => s.isSelected);
    if (selected.length === 0) {
      showAlert('Please select at least one group!');
      return;
    }

    const timestamp = new Date();
    const quizSettings: Record<string, QuizSetting> = {};
    selected.forEach((s) => {
      quizSettings[s.type] = { ...s, timestamp };
    });

    onClose();
    navigate('/vocabulary/quiz', { state: { quizSettings } });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-gray-800 rounded-t-3xl sm:rounded-2xl w-full max-w-md max-h-[85vh] flex flex-col shadow-2xl">
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 bg-gray-300 dark:bg-gray-600 rounded-full" />
        </div>

        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700">
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Quiz Settings</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            aria-label="Close"
          >
            <svg className="w-5 h-5 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {settings.length === 0 ? (
            <p className="text-center text-gray-400 dark:text-gray-500 py-8">No word lists available. Go back to Home.</p>
          ) : (
            settings.map((s, i) => (
              <QuizSettingItem
                key={s.type}
                setting={s}
                title={WORD_SENTENCE_TITLE_MAP[s.type] || s.type}
                onChange={(updated) => handleChange(i, updated)}
              />
            ))
          )}
        </div>

        <div className="px-5 py-4 border-t border-gray-100 dark:border-gray-700">
          <button
            onClick={handleStart}
            className="w-full bg-blue-500 hover:bg-blue-600 active:bg-blue-700 text-white font-bold py-4 rounded-2xl transition-colors text-base shadow-md"
          >
            Start Quiz
          </button>
        </div>
      </div>
    </div>
  );
};

export default QuizSettingModal;
