import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';
import { CustomGroup, addCustomWord, fetchCustomGroups, createCustomGroup } from '../services/customVocab.service';
import { Sentence } from '../models';

interface Props {
  word: Sentence;
  onClose: () => void;
}

const AddToGroupModal: React.FC<Props> = ({ word, onClose }) => {
  const { t } = useTranslation();
  const [groups, setGroups] = useState<CustomGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<number | null>(null);
  const [saved, setSaved] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupLang, setNewGroupLang] = useState('EN');
  const [creating, setCreating] = useState(false);

  const LANGUAGES = ['EN', 'JA', 'DE', 'Other'];

  useEffect(() => {
    fetchCustomGroups()
      .then(setGroups)
      .catch(() => setError('Failed to load groups'))
      .finally(() => setLoading(false));
  }, []);

  const handleAddToGroup = async (group: CustomGroup) => {
    setSaving(group.id);
    setError('');
    try {
      await addCustomWord(group.id, {
        word: word.word || word.sentence || '',
        translateEn: word.translateEn || '',
        translateCh: word.translateCh || '',
        sentence: word.sentence && word.word ? word.sentence : '',
        phonetics: '',
        sourceWordId: word.id,
        sourceTableName: word.tableName || undefined,
      });
      setSaved(group.id);
      setTimeout(onClose, 800);
    } catch (e: any) {
      const msg = e?.message === 'WORD_LIMIT_EXCEEDED' ? t('userVocab.wordLimitReached') : (e?.message || 'Failed to add word');
      setError(msg);
    } finally {
      setSaving(null);
    }
  };

  const handleCreateAndAdd = async () => {
    const trimmed = newGroupName.trim();
    if (!trimmed) return;
    setCreating(true);
    setError('');
    try {
      const created = await createCustomGroup(trimmed, '', newGroupLang);
      setGroups((prev) => [created, ...prev]);
      setShowCreateForm(false);
      setNewGroupName('');
      await handleAddToGroup(created);
    } catch (e: any) {
      const msg = e?.message === 'GROUP_LIMIT_EXCEEDED' ? t('userVocab.groupLimitReached')
        : e?.message === 'WORD_LIMIT_EXCEEDED' ? t('userVocab.wordLimitReached')
        : (e?.message || 'Failed to create group');
      setError(msg);
    } finally {
      setCreating(false);
    }
  };

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 px-4 pb-safe" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-t-3xl sm:rounded-2xl shadow-2xl w-full max-w-sm max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-600" />
        </div>
        <div className="px-6 pt-4 pb-3 border-b border-gray-100 dark:border-gray-700">
          <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">{t('userVocab.addToGroup')}</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
            {word.word || word.sentence}
          </p>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-3 space-y-2">
          {loading && (
            <div className="flex justify-center py-6">
              <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {!loading && groups.length === 0 && !showCreateForm && (
            <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">{t('userVocab.emptyGroups')}</p>
          )}

          {groups.map((group) => (
            <button
              key={group.id}
              onClick={() => handleAddToGroup(group)}
              disabled={saving !== null || saved !== null}
              className={`w-full text-left px-4 py-3 rounded-xl border transition-all ${
                saved === group.id
                  ? 'border-green-400 bg-green-50 dark:bg-green-900/20'
                  : 'border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/20'
              } disabled:opacity-60`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">{group.name}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    {t('userVocab.wordCount', { count: group.wordCount })} · {group.language}
                  </p>
                </div>
                {saving === group.id && (
                  <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                )}
                {saved === group.id && (
                  <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
            </button>
          ))}

          {showCreateForm ? (
            <div className="border border-blue-200 dark:border-blue-700 rounded-xl p-3 space-y-2">
              <input
                autoFocus
                type="text"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleCreateAndAdd(); }}
                placeholder={t('userVocab.groupName')}
                className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">{t('userVocab.language')}</span>
                <div className="flex gap-1">
                  {LANGUAGES.map((lang) => (
                    <button
                      key={lang}
                      type="button"
                      onClick={() => setNewGroupLang(lang)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
                        newGroupLang === lang
                          ? 'bg-blue-500 text-white'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                      }`}
                    >
                      {lang}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleCreateAndAdd}
                  disabled={!newGroupName.trim() || creating}
                  className="flex-1 bg-blue-500 text-white text-sm font-semibold py-2 rounded-xl disabled:opacity-40 hover:bg-blue-600 transition-colors"
                >
                  {creating ? '…' : t('userVocab.createAndAdd', 'Create & Add')}
                </button>
                <button
                  onClick={() => { setShowCreateForm(false); setNewGroupName(''); setNewGroupLang('EN'); }}
                  className="text-sm text-gray-400 px-4 rounded-xl border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  {t('social.cancel')}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowCreateForm(true)}
              className="w-full text-left px-4 py-3 rounded-xl border border-dashed border-gray-300 dark:border-gray-600 text-blue-500 text-sm font-medium hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
            >
              + {t('userVocab.newGroup')}
            </button>
          )}

          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default AddToGroupModal;
