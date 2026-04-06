import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

interface Props {
  onClose: () => void;
  onSave: (name: string, description: string, language: string) => Promise<void>;
  initialName?: string;
  initialDescription?: string;
  initialLanguage?: string;
}

const LANGUAGES = ['EN', 'JA', 'DE', 'Other'];

const CreateGroupModal: React.FC<Props> = ({ onClose, onSave, initialName = '', initialDescription = '', initialLanguage = 'EN' }) => {
  const { t } = useTranslation();
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [language, setLanguage] = useState(initialLanguage);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) { setError(t('userVocab.groupNameRequired', 'Group name is required')); return; }
    setSaving(true);
    setError('');
    try {
      await onSave(trimmedName, description.trim(), language);
      onClose();
    } catch (e: any) {
      const msg = e?.message === 'GROUP_LIMIT_EXCEEDED' ? t('userVocab.groupLimitReached') : (e?.message || 'Error');
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 px-4 pb-safe" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-t-3xl sm:rounded-2xl shadow-2xl w-full max-w-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-600" />
        </div>
        <div className="px-6 pt-4 pb-6">
          <h2 className="text-base font-bold text-gray-900 dark:text-gray-100 mb-4">
            {initialName ? t('userVocab.editGroup', 'Edit Group') : t('userVocab.newGroup')}
          </h2>

          <div className="space-y-3 mb-4">
            <div>
              <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1 block">
                {t('userVocab.groupName')} *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('userVocab.groupName')}
                maxLength={80}
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1 block">
                {t('userVocab.groupDesc')}
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('userVocab.groupDesc')}
                maxLength={200}
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1 block">
                {t('userVocab.language')}
              </label>
              <div className="flex gap-2 flex-wrap">
                {LANGUAGES.map((lang) => (
                  <button
                    key={lang}
                    onClick={() => setLanguage(lang)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                      language === lang
                        ? 'bg-blue-500 text-white border-blue-500'
                        : 'bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:border-blue-400'
                    }`}
                  >
                    {lang}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {error && <p className="text-xs text-red-500 mb-3">{error}</p>}

          <button
            onClick={handleSave}
            disabled={!name.trim() || saving}
            className="w-full bg-blue-500 hover:bg-blue-600 active:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-colors mb-2"
          >
            {saving ? '…' : t('social.save')}
          </button>
          <button
            onClick={onClose}
            className="w-full text-sm text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 py-2 transition-colors"
          >
            {t('social.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreateGroupModal;
