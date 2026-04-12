import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Header from '../../components/Header';
import { useAuth } from '../../contexts/AuthContext';
import { SharedVocabGroup, fetchSharedGroups, deleteSharedGroup } from '../../services/customVocab.service';

const SharedVocabListPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { hasAnyRole } = useAuth();
  const isAdmin = hasAnyRole(['ADMIN']);
  const [groups, setGroups] = useState<SharedVocabGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [deleteLoading, setDeleteLoading] = useState<number | null>(null);

  useEffect(() => {
    fetchSharedGroups()
      .then(setGroups)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleDelete = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    if (!window.confirm(t('sharedVocab.deleteConfirm', 'Delete this shared group? This cannot be undone.'))) return;
    setDeleteLoading(id);
    try {
      await deleteSharedGroup(id);
      setGroups((prev) => prev.filter((g) => g.id !== id));
    } catch {
      // ignore
    } finally {
      setDeleteLoading(null);
    }
  };

  const filtered = query.trim()
    ? groups.filter(
        (g) =>
          g.name.toLowerCase().includes(query.toLowerCase()) ||
          (g.description || '').toLowerCase().includes(query.toLowerCase()) ||
          (g.tags || '').toLowerCase().includes(query.toLowerCase()) ||
          g.sharerDisplayName.toLowerCase().includes(query.toLowerCase()),
      )
    : groups;

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header title={t('sharedVocab.title')} showBack />

      <main className="flex-1 max-w-2xl mx-auto w-full px-4 pt-4 pb-24">
        {/* Search */}
        <div className="relative mb-4">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('userVocab.searchGroups', 'Search…')}
            className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-[3px] border-blue-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-10">
            {query ? t('userVocab.noResults') : t('sharedVocab.noSharedGroups')}
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {filtered.map((sg) => (
              <div
                key={sg.id}
                className="relative bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-3 text-left hover:shadow-lg hover:-translate-y-0.5 transition-all cursor-pointer"
                onClick={() => navigate(`/shared-vocab/${sg.id}`, { state: { group: sg } })}
              >
                {isAdmin && (
                  <button
                    onClick={(e) => handleDelete(e, sg.id)}
                    disabled={deleteLoading === sg.id}
                    className="absolute top-2 right-2 w-5 h-5 flex items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30 text-red-500 hover:bg-red-200 dark:hover:bg-red-800/40 disabled:opacity-40 transition-colors"
                    aria-label={t('sharedVocab.delete', 'Delete')}
                  >
                    {deleteLoading === sg.id ? (
                      <span className="text-[8px]">…</span>
                    ) : (
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    )}
                  </button>
                )}
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-[10px] bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400 px-1.5 py-0.5 rounded font-medium">
                    {sg.language}
                  </span>
                  <span className="text-[10px] text-gray-400 dark:text-gray-500">
                    {t('userVocab.wordCount', { count: sg.wordCount })}
                  </span>
                </div>
                <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 line-clamp-1">{sg.name}</p>
                <p className="text-[10px] text-blue-400 dark:text-blue-500 mt-0.5 truncate">
                  {t('sharedVocab.sharedBy', { name: sg.sharerDisplayName })}
                </p>
                {sg.tags && (
                  <div className="flex gap-1 mt-1.5 overflow-hidden">
                    {sg.tags.split(',').map((s) => s.trim()).filter(Boolean).map((tag) => (
                      <span key={tag} className="shrink-0 text-[9px] font-medium px-1.5 py-0.5 rounded-md bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-600">
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default SharedVocabListPage;
