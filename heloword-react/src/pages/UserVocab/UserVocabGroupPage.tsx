import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Header from '../../components/Header';
import UserVocabWordFormModal from '../../components/UserVocabWordFormModal';
import CreateGroupModal from '../../components/CreateGroupModal';
import {
  CustomGroup,
  CustomWord,
  fetchCustomWords,
  addCustomWord,
  updateCustomWord,
  deleteCustomWord,
  updateCustomGroup,
} from '../../services/customVocab.service';
import { Sentence } from '../../models';
import { useData } from '../../contexts/DataContext';

const UserVocabGroupPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { groupId } = useParams<{ groupId: string }>();
  const location = useLocation();
  const { wordStore } = useData();

  const [group, setGroup] = useState<CustomGroup>(location.state?.group ?? { id: Number(groupId), name: '', description: '', language: '', wordCount: 0, createDate: '' });
  const [words, setWords] = useState<CustomWord[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingWord, setEditingWord] = useState<CustomWord | null>(null);
  const [editingGroup, setEditingGroup] = useState(false);
  const [confirmDeleteWord, setConfirmDeleteWord] = useState<CustomWord | null>(null);
  const [deletingWord, setDeletingWord] = useState(false);
  const [quizLoading, setQuizLoading] = useState(false);

  const id = Number(groupId);

  // Flatten all system words for the "Fill from system word" search
  const systemWords: Sentence[] = [
    ...(wordStore.wordEnglishList ?? []),
    ...(wordStore.wordGermanList ?? []),
    ...(wordStore.wordJapaneseList ?? []),
    ...(wordStore.wordJapaneseVerbList ?? []),
  ];

  useEffect(() => {
    loadWords();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadWords = async () => {
    setLoading(true);
    try {
      const data = await fetchCustomWords(id);
      setWords(data);
    } finally {
      setLoading(false);
    }
  };

  const handleAddWord = async (data: any) => {
    const created = await addCustomWord(id, data);
    setWords((prev) => [...prev, created]);
    setGroup((g) => ({ ...g, wordCount: g.wordCount + 1 }));
  };

  const handleUpdateWord = async (data: any) => {
    if (!editingWord) return;
    const updated = await updateCustomWord(editingWord.id, data);
    setWords((prev) => prev.map((w) => (w.id === updated.id ? updated : w)));
  };

  const handleDeleteWord = async () => {
    if (!confirmDeleteWord) return;
    setDeletingWord(true);
    try {
      await deleteCustomWord(confirmDeleteWord.id);
      setWords((prev) => prev.filter((w) => w.id !== confirmDeleteWord.id));
      setGroup((g) => ({ ...g, wordCount: Math.max(0, g.wordCount - 1) }));
      setConfirmDeleteWord(null);
    } finally {
      setDeletingWord(false);
    }
  };

  const handleUpdateGroup = async (name: string, description: string, language: string) => {
    const updated = await updateCustomGroup(id, name, description, language);
    setGroup(updated);
  };

  const handleStartQuiz = async () => {
    setQuizLoading(true);
    try {
      const freshWords = words.length > 0 ? words : await fetchCustomWords(id);
      if (freshWords.length === 0) return;

      const quizType = `userCustomGroup:${id}`;
      // Tag each word with the quiz type for settingIdMapRef lookup in VocabularyQuizPage
      const preloadedWords: Sentence[] = freshWords.map((w) => ({
        id: w.id,
        word: w.word,
        sentence: w.sentence || '',
        translateEn: w.translateEn,
        translateCh: w.translateCh || '',
        tableName: 'USER_CUSTOM_WORD',
        language: (group.language === 'JA' ? 'jp' : 'en') as any,
        status: 1,
        _quizType: quizType,
      }));

      const quizSetting = {
        type: quizType,
        tableName: 'USER_CUSTOM_WORD',
        total: freshWords.length,
        min: 1,
        max: freshWords.length,
        isSelected: true,
        timestamp: new Date(),
      };

      navigate('/vocabulary/quiz', {
        state: {
          quizSettings: { [quizType]: quizSetting },
          preloadedWords,
        },
      });
    } finally {
      setQuizLoading(false);
    }
  };

  const filtered = query.trim()
    ? words.filter((w) =>
        w.word.toLowerCase().includes(query.toLowerCase()) ||
        (w.translateEn || '').toLowerCase().includes(query.toLowerCase())
      )
    : words;

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header
        title={group.name || t('userVocab.title')}
        showBack
        rightContent={
          <button
            onClick={() => setShowAddModal(true)}
            className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            aria-label={t('userVocab.addWord')}
          >
            <svg className="w-6 h-6 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
        }
      />

      <main className="flex-1 pb-32 px-4 pt-4 max-w-2xl mx-auto w-full">
        {/* Group info bar */}
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xs bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded-md font-medium">
            {group.language}
          </span>
          <span className="text-xs text-gray-400 dark:text-gray-500">
            {t('userVocab.wordCount', { count: words.length })}
          </span>
          {group.description && (
            <span className="text-xs text-gray-400 dark:text-gray-500 truncate flex-1">· {group.description}</span>
          )}
          <button
            onClick={() => setEditingGroup(true)}
            className="ml-auto p-1.5 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
        </div>

        {/* Search */}
        <div className="relative mb-4">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('review.searchPlaceholder')}
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

        {loading && (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-[3px] border-blue-400 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!loading && words.length === 0 && (
          <div className="text-center py-16 flex flex-col items-center gap-4">
            <p className="text-sm text-gray-400 dark:text-gray-500">{t('userVocab.emptyWords', 'No words yet. Add your first word!')}</p>
            <button
              onClick={() => setShowAddModal(true)}
              className="px-6 py-2.5 bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold rounded-xl transition-colors"
            >
              {t('userVocab.addWord')}
            </button>
          </div>
        )}

        {!loading && words.length > 0 && (
          <div className="space-y-2">
            {filtered.map((word) => (
              <div
                key={word.id}
                className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-3 flex gap-3 items-start"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">{word.word}</p>
                  {word.translateEn && <p className="text-xs text-blue-500 mt-0.5">{word.translateEn}</p>}
                  {word.translateCh && <p className="text-xs text-gray-400 dark:text-gray-500">{word.translateCh}</p>}
                  {word.sentence && <p className="text-xs text-gray-500 dark:text-gray-400 italic mt-1 leading-relaxed line-clamp-2">{word.sentence}</p>}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => setEditingWord(word)}
                    className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  >
                    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => setConfirmDeleteWord(word)}
                    className="p-2 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  >
                    <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* FAB */}
        {!loading && (
          <button
            onClick={() => setShowAddModal(true)}
            className="fixed bottom-36 right-6 w-14 h-14 bg-blue-500 hover:bg-blue-600 active:bg-blue-700 text-white rounded-2xl shadow-lg flex items-center justify-center transition-colors z-30"
            aria-label={t('userVocab.addWord')}
          >
            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
        )}
      </main>

      {/* Start Quiz button */}
      {!loading && words.length > 0 && (
        <div className="fixed bottom-20 left-0 right-0 px-4 pb-2 z-20 max-w-2xl mx-auto">
          <button
            onClick={handleStartQuiz}
            disabled={quizLoading}
            className="w-full bg-blue-500 hover:bg-blue-600 active:bg-blue-700 disabled:opacity-40 text-white font-bold py-3.5 rounded-2xl shadow-lg transition-colors"
          >
            {quizLoading ? '…' : t('userVocab.startQuiz')}
          </button>
        </div>
      )}

      {showAddModal && (
        <UserVocabWordFormModal
          onClose={() => setShowAddModal(false)}
          onSave={handleAddWord}
          systemWords={systemWords}
        />
      )}

      {editingWord && (
        <UserVocabWordFormModal
          initial={{
            word: editingWord.word,
            translateEn: editingWord.translateEn,
            translateCh: editingWord.translateCh,
            sentence: editingWord.sentence,
            phonetics: editingWord.phonetics,
          }}
          onClose={() => setEditingWord(null)}
          onSave={handleUpdateWord}
          systemWords={systemWords}
        />
      )}

      {editingGroup && (
        <CreateGroupModal
          onClose={() => setEditingGroup(false)}
          onSave={handleUpdateGroup}
          initialName={group.name}
          initialDescription={group.description}
          initialLanguage={group.language}
        />
      )}

      {confirmDeleteWord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-6 max-w-sm w-full">
            <h2 className="text-base font-bold text-gray-900 dark:text-gray-100 mb-2">{t('userVocab.deleteWord', 'Delete word')}</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-1 font-semibold">{confirmDeleteWord.word}</p>
            <p className="text-sm text-gray-400 dark:text-gray-500 mb-5">{t('userVocab.confirmDeleteWord', 'Are you sure you want to delete this word?')}</p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDeleteWord(null)}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 text-sm text-gray-600 dark:text-gray-300 font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                {t('social.cancel')}
              </button>
              <button
                onClick={handleDeleteWord}
                disabled={deletingWord}
                className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-semibold disabled:opacity-40 transition-colors"
              >
                {deletingWord ? '…' : t('review.deleteGroup')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserVocabGroupPage;
