import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Header from '../../components/Header';
import { useAuth } from '../../contexts/AuthContext';
import { useUI } from '../../contexts/UIContext';
import { QuizSetting, TYPE_TO_TABLE_MAP } from '../../models';
import { doPost } from '../../services/api.service';
import { useNotifications } from '../../contexts/NotificationContext';
import { useData } from '../../contexts/DataContext';

interface QuizGroup {
  date: Date;
  records: QuizSetting[];
  completed: number;
  total: number;
  latestFinishedTime?: Date;
}

const ReviewPage: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { isLoggedIn } = useAuth();
  const { showLoading, hideLoading } = useUI();

  const { dueWords, dueCount } = useNotifications();
  const { wordStore, sentenceStore } = useData();
  const [groups, setGroups] = useState<QuizGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAllDue, setShowAllDue] = useState(false);

  useEffect(() => {
    if (!isLoggedIn) return;
    fetchData();
  }, [isLoggedIn]);

  const fetchData = async () => {
    setLoading(true);
    showLoading();
    try {
      const response = await doPost('/frontend-api/api/fe/quiz/get-quiz-settings');
      if (response.code !== '0000' || !response.data) return;

      const data: Record<string, QuizSetting[]> = response.data;

      const parsed: QuizGroup[] = Object.entries(data).map(([key, settings]) => {
        const { completed, total } = settings.reduce(
          (acc, curr) => ({
            total: (curr.max ?? 0) - (curr.min ?? 1) + 1 + acc.total,
            completed: (curr.finishedCount ?? 0) + acc.completed,
          }),
          { completed: 0, total: 0 }
        );

        const latestFinishedTime = settings.find((s) => s.latestFinishedTime)?.latestFinishedTime;

        return {
          date: new Date(key),
          records: settings,
          completed,
          total,
          latestFinishedTime: latestFinishedTime ? new Date(latestFinishedTime) : undefined,
        };
      });

      parsed.sort((a, b) => {
        if (a.latestFinishedTime && b.latestFinishedTime) {
          return b.latestFinishedTime.getTime() - a.latestFinishedTime.getTime();
        }
        return b.date.getTime() - a.date.getTime();
      });

      setGroups(parsed);
    } finally {
      setLoading(false);
      hideLoading();
    }
  };

  const handleCardClick = async (group: QuizGroup) => {
    if (group.completed === group.total) return;

    const settingIds = group.records.map((s) => s.id).filter(Boolean);
    showLoading();
    try {
      const response = await doPost(
        '/frontend-api/api/fe/quiz/get-record-ids-by-setting-ids',
        settingIds
      );

      const quizSettings: Record<string, QuizSetting> = {};
      group.records.forEach((s) => {
        quizSettings[s.type] = {
          ...s,
          timestamp: new Date(),
          tableName: TYPE_TO_TABLE_MAP[s.type] || s.tableName,
        };
      });

      navigate('/vocabulary/quiz', {
        state: { quizSettings, finishedIdMap: response.data },
      });
    } finally {
      hideLoading();
    }
  };

  const lookupWord = (answerId: number, tableName: string): string => {
    const allLists = [
      ...wordStore.wordEnglishList,
      ...wordStore.wordGermanList,
      ...wordStore.wordJapaneseList,
      ...sentenceStore.sentenceEnglishList,
      ...sentenceStore.sentenceGermanList,
      ...sentenceStore.sentenceJapaneseList,
    ];
    const found = allLists.find((w) => w.id === answerId && w.tableName === tableName);
    return found ? (found.word || found.sentence || `#${answerId}`) : `#${answerId}`;
  };

  const formatDate = (d: Date) =>
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const formatTime = (d?: Date) => {
    if (!d) return '';
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header title="Review" />

      <main className="flex-1 pb-20 px-4 pt-4 max-w-2xl mx-auto w-full">
        {!isLoggedIn && (
          <div className="text-center py-16">
            <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-2xl mx-auto mb-4 flex items-center justify-center">
              <svg className="w-8 h-8 text-gray-400 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <p className="text-gray-500 dark:text-gray-400 font-medium">{t('review.loginRequired')}</p>
            <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">{t('review.loginHint')}</p>
            <button
              onClick={() => navigate('/login')}
              className="mt-4 bg-blue-500 text-white font-semibold text-sm px-6 py-2.5 rounded-xl hover:bg-blue-600 transition-colors"
            >
              {t('review.goLogin')}
            </button>
          </div>
        )}

        {isLoggedIn && dueCount > 0 && (
          <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-2xl p-4 mb-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 bg-orange-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
                  {dueCount > 99 ? '99+' : dueCount}
                </span>
                <h3 className="text-sm font-semibold text-orange-700 dark:text-orange-400">{t('review.dueForReview')}</h3>
              </div>
              <button
                onClick={() => setShowAllDue((v) => !v)}
                className="text-xs text-orange-500 font-medium"
              >
                {showAllDue ? t('review.hide') : t('review.showAll')}
              </button>
            </div>
            <p className="text-xs text-orange-500 dark:text-orange-500 mb-3">
              {t('review.dueDescription')}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {(showAllDue ? dueWords : dueWords.slice(0, 12)).map((w) => (
                <span
                  key={`${w.answerId}-${w.answerTableName}`}
                  className="text-xs bg-white dark:bg-gray-800 border border-orange-200 dark:border-orange-800 text-orange-600 dark:text-orange-400 px-2 py-0.5 rounded-lg font-medium"
                  title={`Reviewed ${w.reviewCount}× — ${w.correctCount} correct`}
                >
                  {lookupWord(w.answerId, w.answerTableName)}
                </span>
              ))}
              {!showAllDue && dueCount > 12 && (
                <span className="text-xs text-orange-400 px-2 py-0.5">{t('review.moreItems', { count: dueCount - 12 })}</span>
              )}
            </div>
          </div>
        )}

        {isLoggedIn && loading && (
          <div className="text-center py-12">
            <div className="w-8 h-8 border-4 border-blue-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-gray-400 dark:text-gray-500">{t('review.loading')}</p>
          </div>
        )}

        {isLoggedIn && !loading && groups.length === 0 && (
          <div className="text-center py-16">
            <p className="text-gray-400 dark:text-gray-500 text-sm">{t('review.empty')}</p>
          </div>
        )}

        {isLoggedIn && !loading && groups.length > 0 && (
          <div className="space-y-3">
            {groups.map((group, i) => {
              const isComplete = group.completed === group.total;
              const pct = group.total > 0 ? Math.round((group.completed / group.total) * 100) : 0;

              return (
                <div
                  key={i}
                  onClick={() => !isComplete && handleCardClick(group)}
                  className={`bg-white dark:bg-gray-800 rounded-2xl border-2 p-4 transition-all shadow-sm ${
                    isComplete
                      ? 'border-green-200 dark:border-green-900 opacity-70'
                      : 'border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600 cursor-pointer hover:shadow-md active:scale-[0.99]'
                  }`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="text-sm font-bold text-gray-800 dark:text-gray-100">{formatDate(group.date)}</p>
                      {group.latestFinishedTime && (
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                          {t('review.lastActivity', { time: formatTime(group.latestFinishedTime) })}
                        </p>
                      )}
                    </div>
                    <span
                      className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                        isComplete
                          ? 'bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400'
                          : 'bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-400'
                      }`}
                    >
                      {isComplete ? t('review.done') : `${pct}%`}
                    </span>
                  </div>

                  <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full mb-3">
                    <div
                      className={`h-1.5 rounded-full transition-all ${isComplete ? 'bg-green-400' : 'bg-blue-500'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>

                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                    {t('review.completionRatio', { completed: group.completed, total: group.total })}
                  </p>

                  <div className="flex flex-wrap gap-1.5">
                    {group.records.map((r) => (
                      <span key={r.type} className="text-xs bg-blue-50 dark:bg-blue-900/40 text-blue-500 dark:text-blue-400 px-2 py-0.5 rounded-md font-medium">
                        {t(`wordLists.${r.type}`, r.type)}
                        {r.min && r.max ? ` (${r.min}-${r.max})` : ''}
                      </span>
                    ))}
                  </div>

                  {!isComplete && (
                    <p className="text-xs text-blue-500 font-medium mt-2 text-right">
                      {t('review.resumePrompt')}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
};

export default ReviewPage;
