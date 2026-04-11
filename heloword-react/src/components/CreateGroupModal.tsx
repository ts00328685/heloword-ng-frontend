import React, { useState, useRef } from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';

interface Props {
  onClose: () => void;
  onSave: (name: string, description: string, language: string, tags: string) => Promise<void>;
  initialName?: string;
  initialDescription?: string;
  initialLanguage?: string;
  initialTags?: string;
}

const LANGUAGES = ['EN', 'JA', 'DE', 'Other'];

const CreateGroupModal: React.FC<Props> = ({
  onClose, onSave,
  initialName = '', initialDescription = '', initialLanguage = 'EN', initialTags = '',
}) => {
  const { t } = useTranslation();
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [language, setLanguage] = useState(initialLanguage);
  const [tags, setTags] = useState<string[]>(
    initialTags ? initialTags.split(',').map((t) => t.trim()).filter(Boolean) : []
  );
  const [tagInput, setTagInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const tagInputRef = useRef<HTMLInputElement>(null);
  const composingRef = useRef(false);

  const addTag = (value: string) => {
    const trimmed = value.trim().toLowerCase();
    if (trimmed && !tags.includes(trimmed)) {
      setTags((prev) => [...prev, trimmed]);
    }
    setTagInput('');
  };

  const removeTag = (tag: string) => setTags((prev) => prev.filter((t) => t !== tag));

  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === 'Enter' || e.key === ',') && !composingRef.current) {
      e.preventDefault();
      addTag(tagInput);
    } else if (e.key === 'Backspace' && !tagInput && tags.length > 0) {
      setTags((prev) => prev.slice(0, -1));
    }
  };

  const handleSave = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) { setError(t('userVocab.groupNameRequired', 'Group name is required')); return; }
    setSaving(true);
    setError('');
    // Flush any pending tag input
    const finalTags = tagInput.trim()
      ? [...tags, tagInput.trim().toLowerCase()].filter((v, i, a) => a.indexOf(v) === i)
      : tags;
    try {
      await onSave(trimmedName, description.trim(), language, finalTags.join(','));
      onClose();
    } catch (e: any) {
      const msg = e?.message === 'GROUP_LIMIT_EXCEEDED' ? t('userVocab.groupLimitReached') : (e?.message || 'Error');
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  return ReactDOM.createPortal(
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

            <div>
              <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1 block">
                {t('userVocab.tags')}
              </label>
              <div
                className="flex flex-wrap gap-1.5 px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 cursor-text min-h-[42px]"
                onClick={() => tagInputRef.current?.focus()}
              >
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="flex items-center gap-1 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-xs font-medium px-2 py-0.5 rounded-md"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); removeTag(tag); }}
                      className="text-blue-400 hover:text-blue-600 dark:hover:text-blue-200 leading-none"
                    >
                      ×
                    </button>
                  </span>
                ))}
                <input
                  ref={tagInputRef}
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={handleTagKeyDown}
                  onCompositionStart={() => { composingRef.current = true; }}
                  onCompositionEnd={() => { composingRef.current = false; }}
                  onBlur={() => { if (tagInput.trim() && !composingRef.current) addTag(tagInput); }}
                  placeholder={tags.length === 0 ? t('userVocab.tagsPlaceholder') : ''}
                  className="flex-1 min-w-[80px] bg-transparent text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none"
                />
              </div>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{t('userVocab.tagsHint')}</p>
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
    </div>,
    document.body
  );
};

export default CreateGroupModal;
