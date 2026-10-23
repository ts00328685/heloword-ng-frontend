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
        // 0 means "not from the system word list" (chat bot, article lookups)
        sourceWordId: word.id || undefined,
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
        className="bg-surface rounded-t-3xl sm:rounded-2xl shadow-2xl w-full max-w-sm max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 rounded-full bg-ink/20" />
        </div>
        <div className="px-6 pt-4 pb-3 border-b border-line">
          <h2 className="text-base font-semibold text-ink">{t('userVocab.addToGroup')}</h2>
          <p className="text-xs text-ink-muted mt-0.5 truncate">
            {word.word || word.sentence}
          </p>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-3 space-y-2">
          {loading && (
            <div className="flex justify-center py-6">
              <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {!loading && groups.length === 0 && !showCreateForm && (
            <p className="text-sm text-ink-faint text-center py-4">{t('userVocab.emptyGroups')}</p>
          )}

          {groups.map((group) => (
            <button
              key={group.id}
              onClick={() => handleAddToGroup(group)}
              disabled={saving !== null || saved !== null}
              className={`w-full text-left px-4 py-3 rounded-xl border transition-all ${
                saved === group.id
                  ? 'border-success bg-success-soft '
                  : 'border-line hover:border-line hover:bg-accent-soft '
              } disabled:opacity-60`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-ink">{group.name}</p>
                  <p className="text-xs text-ink-faint">
                    {t('userVocab.wordCount', { count: group.wordCount })} · {group.language}
                  </p>
                </div>
                {saving === group.id && (
                  <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                )}
                {saved === group.id && (
                  <svg className="w-5 h-5 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
            </button>
          ))}

          {showCreateForm ? (
            <div className="border border-line rounded-xl p-3 space-y-2">
              <input
                autoFocus
                type="text"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleCreateAndAdd(); }}
                placeholder={t('userVocab.groupName')}
                className="w-full px-3 py-2 rounded-xl border border-line bg-paper text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
              />
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-ink-faint shrink-0">{t('userVocab.language')}</span>
                <div className="flex gap-1">
                  {LANGUAGES.map((lang) => (
                    <button
                      key={lang}
                      type="button"
                      onClick={() => setNewGroupLang(lang)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
                        newGroupLang === lang
                          ? 'bg-ink text-paper'
                          : 'bg-ink/5 text-ink-muted hover:bg-ink/10 '
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
                  className="flex-1 bg-ink text-paper text-sm font-semibold py-2 rounded-xl disabled:opacity-40 hover:bg-ink/85 transition-colors"
                >
                  {creating ? '…' : t('userVocab.createAndAdd', 'Create & Add')}
                </button>
                <button
                  onClick={() => { setShowCreateForm(false); setNewGroupName(''); setNewGroupLang('EN'); }}
                  className="text-sm text-ink-faint px-4 rounded-xl border border-line hover:bg-paper transition-colors"
                >
                  {t('social.cancel')}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowCreateForm(true)}
              className="w-full text-left px-4 py-3 rounded-xl border border-dashed border-line text-accent text-sm font-medium hover:bg-accent-soft transition-colors"
            >
              + {t('userVocab.newGroup')}
            </button>
          )}

          {error && <p className="text-xs text-danger">{error}</p>}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default AddToGroupModal;
