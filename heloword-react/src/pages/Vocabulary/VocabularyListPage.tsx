import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Header from '../../components/Header';
import QuizSettingModal from '../../components/QuizSettingModal';
import { useData } from '../../contexts/DataContext';
import { Sentence } from '../../models';

const VocabularyListPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { wordStore } = useData();
  const [showModal, setShowModal] = useState(false);

  // Words passed via navigation state, fallback to English word store
  const list: Sentence[] =
    location.state?.wordListOriginal ||
    wordStore.wordEnglishList ||
    [];

  if (list.length === 0) {
    navigate('/home', { replace: true });
    return null;
  }

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <Header
        title="Word List"
        showBack
        rightContent={
          <button
            onClick={() => setShowModal(true)}
            className="p-2 rounded-xl hover:bg-gray-100 transition-colors"
            aria-label="Start quiz"
          >
            <svg className="w-6 h-6 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>
        }
      />

      <main className="flex-1 pb-24 px-4 pt-4 max-w-2xl mx-auto w-full">
        <p className="text-xs text-gray-400 mb-3">{list.length} items</p>

        <div className="space-y-2">
          {list.map((word, index) => (
            <div
              key={`${word.tableName}-${word.id}`}
              className="bg-white rounded-xl border border-gray-200 p-3 flex gap-3 items-start hover:shadow-sm transition-shadow"
            >
              <span className="text-xs text-gray-400 font-mono pt-0.5 min-w-[24px]">
                {index + 1}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-800">
                  {word.word || word.sentence}
                </p>
                {word.translateEn && (
                  <p className="text-xs text-blue-500 mt-0.5">{word.translateEn}</p>
                )}
                {word.translateCh && (
                  <p className="text-xs text-gray-400">{word.translateCh}</p>
                )}
                {word.sentence && word.word && (
                  <p className="text-xs text-gray-500 italic mt-1 leading-relaxed">
                    {word.sentence}
                  </p>
                )}
              </div>
              <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-md font-mono self-start flex-shrink-0">
                {word.language?.toUpperCase()}
              </span>
            </div>
          ))}
        </div>
      </main>

      {/* FAB to open quiz settings */}
      <button
        onClick={() => setShowModal(true)}
        className="fixed bottom-20 right-4 z-30 w-14 h-14 bg-blue-500 hover:bg-blue-600 active:bg-blue-700 rounded-full shadow-lg flex items-center justify-center transition-colors"
        aria-label="Open quiz settings"
      >
        <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </button>

      {showModal && <QuizSettingModal onClose={() => setShowModal(false)} />}
    </div>
  );
};

export default VocabularyListPage;
