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
    <div className="flex flex-col min-h-screen bg-paper">
      <Header title={t('sharedVocab.title')} showBack />

      <main className="flex-1 max-w-2xl mx-auto w-full px-4 pt-4 pb-24">
        {/* Search */}
        <div className="relative mb-4">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-faint" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('userVocab.searchGroups', 'Search…')}
            className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-line bg-surface text-ink placeholder-ink-faint focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-[3px] border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-ink-faint text-center py-10">
            {query ? t('userVocab.noResults') : t('sharedVocab.noSharedGroups')}
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {filtered.map((sg) => (
              <div
                key={sg.id}
                className="relative bg-surface rounded-xl border border-line shadow-sm p-3 text-left hover:shadow-lg transition-all cursor-pointer"
                onClick={() => navigate(`/shared-vocab/${sg.id}`, { state: { group: sg } })}
              >
                {isAdmin && (
                  <button
                    onClick={(e) => handleDelete(e, sg.id)}
                    disabled={deleteLoading === sg.id}
                    className="absolute top-2 right-2 w-5 h-5 flex items-center justify-center rounded-full bg-danger-soft text-danger hover:bg-danger-soft disabled:opacity-40 transition-colors"
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
                  <span className="text-[10px] bg-success-soft text-success px-1.5 py-0.5 rounded font-medium">
                    {sg.language}
                  </span>
                  <span className="text-[10px] text-ink-faint">
                    {t('userVocab.wordCount', { count: sg.wordCount })}
                  </span>
                </div>
                <p className="text-sm font-semibold text-ink line-clamp-1">{sg.name}</p>
                <p className="text-[10px] text-accent mt-0.5 truncate">
                  {t('sharedVocab.sharedBy', { name: sg.sharerDisplayName })}
                </p>
                {sg.tags && (
                  <div className="flex gap-1 mt-1.5 overflow-hidden">
                    {sg.tags.split(',').map((s) => s.trim()).filter(Boolean).map((tag) => (
                      <span key={tag} className="shrink-0 text-[9px] font-medium px-1.5 py-0.5 rounded-md bg-ink/5 text-ink-muted border border-line">
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
