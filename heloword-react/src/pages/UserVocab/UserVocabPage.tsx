import React, { useEffect, useMemo, useState } from 'react';
import ReactDOM from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import * as XLSX from 'xlsx';
import Header from '../../components/Header';
import CreateGroupModal from '../../components/CreateGroupModal';
import ShareVocabGroupModal from '../../components/ShareVocabGroupModal';
import {
  CustomGroup,
  fetchCustomGroups,
  createCustomGroup,
  updateCustomGroup,
  deleteCustomGroup,
  fetchCustomWords,
} from '../../services/customVocab.service';

const ALL_LANGS = ['EN', 'JA', 'DE', 'Other'];

const UserVocabPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [groups, setGroups] = useState<CustomGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState<CustomGroup | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<CustomGroup | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const [shareGroup, setShareGroup] = useState<CustomGroup | null>(null);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);

  // Search / filter state
  const [query, setQuery] = useState('');
  const [langFilter, setLangFilter] = useState<string>('');

  useEffect(() => {
    loadGroups();
  }, []);

  const loadGroups = async () => {
    setLoading(true);
    try {
      const data = await fetchCustomGroups();
      setGroups(data);
    } catch {
      setError('Failed to load groups');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (name: string, description: string, language: string, tags: string) => {
    const created = await createCustomGroup(name, description, language, tags);
    setGroups((prev) => [created, ...prev]);
  };

  const handleUpdate = async (name: string, description: string, language: string, tags: string) => {
    if (!editingGroup) return;
    const updated = await updateCustomGroup(editingGroup.id, name, description, language, tags);
    setGroups((prev) => prev.map((g) => (g.id === updated.id ? updated : g)));
    setEditingGroup(null);
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      await deleteCustomGroup(confirmDelete.id);
      setGroups((prev) => prev.filter((g) => g.id !== confirmDelete.id));
      setConfirmDelete(null);
    } catch {
      setError('Failed to delete group');
    } finally {
      setDeleting(false);
    }
  };

  const handleDownload = async (group: CustomGroup) => {
    setDownloadingId(group.id);
    try {
      const words = await fetchCustomWords(group.id);
      const rows = words.map((w) => ({
        Word: w.word,
        'English Translation': w.translateEn,
        'Chinese Translation': w.translateCh ?? '',
        Sentence: w.sentence ?? '',
        Phonetics: w.phonetics ?? '',
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Words');
      XLSX.writeFile(wb, `${group.name}.xlsx`);
    } catch {
      setError('Failed to download words');
    } finally {
      setDownloadingId(null);
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return groups.filter((g) => {
      if (langFilter && g.language !== langFilter) return false;
      if (!q) return true;
      const tagList = g.tags ? g.tags.split(',').map((t) => t.trim()) : [];
      return (
        g.name.toLowerCase().includes(q) ||
        tagList.some((tag) => tag.includes(q))
      );
    });
  }, [groups, query, langFilter]);

  // Collect all unique languages present in groups for the filter bar
  const presentLangs = useMemo(() => {
    const set = new Set(groups.map((g) => g.language).filter(Boolean));
    return ALL_LANGS.filter((l) => set.has(l));
  }, [groups]);

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 dark:bg-gray-900 animate-page-enter">
      <Header
        title={t('userVocab.title')}
        showBack
        rightContent={
          <button
            onClick={() => setShowCreateModal(true)}
            className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            aria-label={t('userVocab.newGroup')}
          >
            <svg className="w-6 h-6 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
        }
      />

      <main className="flex-1 pb-24 px-4 pt-4 max-w-2xl mx-auto w-full">
        {loading && (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-[3px] border-blue-400 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!loading && error && (
          <p className="text-sm text-red-500 text-center py-8">{error}</p>
        )}

        {!loading && !error && groups.length === 0 && (
          <div className="text-center py-20 flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
              <svg className="w-8 h-8 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <p className="text-sm text-gray-400 dark:text-gray-500">{t('userVocab.emptyGroups')}</p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-6 py-2.5 bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold rounded-xl transition-colors"
            >
              {t('userVocab.newGroup')}
            </button>
          </div>
        )}

        {!loading && groups.length > 0 && (
          <>
            {/* Search + language filter */}
            <div className="mb-4 space-y-2">
              <div className="relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
                </svg>
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t('userVocab.searchGroups')}
                  className="w-full pl-9 pr-9 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-800 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
                {query && (
                  <button onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>

              {presentLangs.length > 1 && (
                <div className="flex gap-1.5 flex-wrap">
                  <button
                    onClick={() => setLangFilter('')}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-colors ${
                      !langFilter
                        ? 'bg-blue-500 text-white border-blue-500'
                        : 'bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-blue-400'
                    }`}
                  >
                    {t('userVocab.allLangs')}
                  </button>
                  {presentLangs.map((lang) => (
                    <button
                      key={lang}
                      onClick={() => setLangFilter(lang === langFilter ? '' : lang)}
                      className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-colors ${
                        langFilter === lang
                          ? 'bg-blue-500 text-white border-blue-500'
                          : 'bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-blue-400'
                      }`}
                    >
                      {lang}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-3">
              {filtered.length === 0 && (
                <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">{t('userVocab.noResults')}</p>
              )}
              {filtered.map((group, i) => {
                const tagList = group.tags ? group.tags.split(',').map((t) => t.trim()).filter(Boolean) : [];
                return (
                  <div
                    key={group.id}
                    className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 shadow-sm animate-fade-in-up"
                    style={{ animationDelay: `${i * 50}ms` }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <button
                        onClick={() => navigate(`/user-vocab/${group.id}`, { state: { group } })}
                        className="flex-1 text-left min-w-0"
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded-md font-medium">
                            {group.language}
                          </span>
                          <span className="text-xs text-gray-400 dark:text-gray-500">
                            {t('userVocab.wordCount', { count: group.wordCount })}
                          </span>
                        </div>
                        <p className="text-sm font-bold text-gray-800 dark:text-gray-100">{group.name}</p>
                        {group.description && (
                          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 line-clamp-1">{group.description}</p>
                        )}
                        {tagList.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {tagList.map((tag) => (
                              <span
                                key={tag}
                                className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 px-1.5 py-0.5 rounded-md"
                              >
                                #{tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </button>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => handleDownload(group)}
                          disabled={downloadingId === group.id}
                          className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-40"
                          title="Download as Excel"
                        >
                          {downloadingId === group.id ? (
                            <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                          )}
                        </button>
                        <button
                          onClick={() => setShareGroup(group)}
                          className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                          title={t('vocabShare.shareTitle', 'Share with friend')}
                        >
                          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => setEditingGroup(group)}
                          className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                        >
                          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => setConfirmDelete(group)}
                          className="p-2 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                        >
                          <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
                    <button
                      onClick={() => navigate(`/user-vocab/${group.id}`, { state: { group } })}
                      className="mt-3 w-full text-center text-xs text-blue-500 font-medium hover:text-blue-700 transition-colors"
                    >
                      {t('home.viewAll')}
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* FAB */}
        {!loading && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="fixed bottom-24 right-6 w-14 h-14 bg-blue-500 hover:bg-blue-600 active:bg-blue-700 text-white rounded-2xl shadow-lg flex items-center justify-center transition-colors z-30"
            aria-label={t('userVocab.newGroup')}
          >
            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
        )}
      </main>

      {showCreateModal && (
        <CreateGroupModal
          onClose={() => setShowCreateModal(false)}
          onSave={handleCreate}
        />
      )}

      {editingGroup && (
        <CreateGroupModal
          onClose={() => setEditingGroup(null)}
          onSave={handleUpdate}
          initialName={editingGroup.name}
          initialDescription={editingGroup.description}
          initialLanguage={editingGroup.language}
          initialTags={editingGroup.tags}
        />
      )}

      {shareGroup && (
        <ShareVocabGroupModal
          groupId={shareGroup.id}
          groupName={shareGroup.name}
          onClose={() => setShareGroup(null)}
        />
      )}

      {confirmDelete && ReactDOM.createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-6 max-w-sm w-full">
            <h2 className="text-base font-bold text-gray-900 dark:text-gray-100 mb-2">{t('userVocab.deleteGroup')}</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">{t('userVocab.confirmDelete')}</p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDelete(null)}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 text-sm text-gray-600 dark:text-gray-300 font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                {t('social.cancel')}
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-semibold disabled:opacity-40 transition-colors"
              >
                {deleting ? '…' : t('review.deleteGroup')}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default UserVocabPage;
