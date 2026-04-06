import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Header from '../../components/Header';
import CreateGroupModal from '../../components/CreateGroupModal';
import {
  CustomGroup,
  fetchCustomGroups,
  createCustomGroup,
  updateCustomGroup,
  deleteCustomGroup,
} from '../../services/customVocab.service';

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

  const handleCreate = async (name: string, description: string, language: string) => {
    const created = await createCustomGroup(name, description, language);
    setGroups((prev) => [created, ...prev]);
  };

  const handleUpdate = async (name: string, description: string, language: string) => {
    if (!editingGroup) return;
    const updated = await updateCustomGroup(editingGroup.id, name, description, language);
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
          <div className="space-y-3">
            {groups.map((group, i) => (
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
                  </button>
                  <div className="flex items-center gap-1 shrink-0">
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
                  {t('home.viewAll')} →
                </button>
              </div>
            ))}
          </div>
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
        />
      )}

      {confirmDelete && (
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
        </div>
      )}
    </div>
  );
};

export default UserVocabPage;
