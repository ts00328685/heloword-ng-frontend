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
import {
  getGuestSettings,
  getGuestRecords,
  getFinishedIdsBySetting,
  GuestSetting,
} from '../../services/guestStorage.service';

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
    if (isLoggedIn) {
      fetchData();
    } else {
      loadGuestData();
    }
  }, [isLoggedIn]);

  // ─── Server-side (logged in) ───────────────────────────────────────────────

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

  // ─── Guest (localStorage) ─────────────────────────────────────────────────

  const loadGuestData = () => {
    const settings = getGuestSettings();
    const records  = getGuestRecords();

    if (settings.length === 0) {
      setGroups([]);
      return;
    }

    // Group settings by their timestamp date (ISO date prefix)
    const byDate: Record<string, GuestSetting[]> = {};
    for (const s of settings) {
      const dateKey = s.timestamp.slice(0, 10); // "YYYY-MM-DD"
      if (!byDate[dateKey]) byDate[dateKey] = [];
      byDate[dateKey].push(s);
    }

    const parsed: QuizGroup[] = Object.entries(byDate).map(([dateKey, daySettings]) => {
      let completed = 0;
      let total = 0;
      let latestFinishedMs = 0;

      for (const s of daySettings) {
        const settingRecords = records.filter((r) => r.settingId === s.id);
        const correctIds = new Set(
          settingRecords.filter((r) => r.wrongCount === 0).map((r) => r.answerId)
        );
        total += s.max - s.min + 1;
        completed += correctIds.size;

        for (const r of settingRecords) {
          const ms = new Date(r.finishedTime).getTime();
          if (ms > latestFinishedMs) latestFinishedMs = ms;
        }
      }

      // Convert GuestSettings to QuizSetting shape for reuse in render
      const records_qs: QuizSetting[] = daySettings.map((s) => ({
        id: undefined,
        _guestId: s.id,
        timestamp: new Date(s.timestamp),
        type: s.type,
        tableName: s.tableName,
        total: s.total,
        isSelected: true,
        min: s.min,
        max: s.max,
      } as any));

      return {
        date: new Date(dateKey),
        records: records_qs,
        completed,
        total,
        latestFinishedTime: latestFinishedMs > 0 ? new Date(latestFinishedMs) : undefined,
      };
    });

    parsed.sort((a, b) => b.date.getTime() - a.date.getTime());
    setGroups(parsed);
  };

  const handleGuestCardClick = (group: QuizGroup) => {
    if (group.completed === group.total) return;

    const quizSettings: Record<string, QuizSetting> = {};
    const finishedIdMap: Record<string, number[]> = {};

    group.records.forEach((s: any) => {
      quizSettings[s.type] = {
        ...s,
        timestamp: new Date(),
        tableName: TYPE_TO_TABLE_MAP[s.type] || s.tableName,
      };
      if (s._guestId) {
        finishedIdMap[s._guestId] = getFinishedIdsBySetting(s._guestId);
      }
    });

    navigate('/vocabulary/quiz', { state: { quizSettings, finishedIdMap } });
  };

  // ─── Shared helpers ───────────────────────────────────────────────────────

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

  const onCardClick = (group: QuizGroup) =>
    isLoggedIn ? handleCardClick(group) : handleGuestCardClick(group);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header title={t('nav.review')} />

      <main className="flex-1 pb-20 px-4 pt-4 max-w-2xl mx-auto w-full">

        {/* Guest upsell banner */}
        {!isLoggedIn && (
          <div
            onClick={() => navigate('/login')}
            className="flex items-center gap-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-2xl p-3 mb-4 cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
          >
            <svg className="w-5 h-5 text-blue-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-xs text-blue-600 dark:text-blue-400 flex-1">
              {t('review.guestBanner')} <span className="font-semibold underline">{t('common.login')}</span>
            </p>
          </div>
        )}

        {/* Due-for-review section */}
        {dueCount > 0 && (
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

        {loading && (
          <div className="text-center py-12">
            <div className="w-8 h-8 border-4 border-blue-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-gray-400 dark:text-gray-500">{t('review.loading')}</p>
          </div>
        )}

        {!loading && groups.length === 0 && (
          <div className="text-center py-16">
            <p className="text-gray-400 dark:text-gray-500 text-sm">{t('review.empty')}</p>
          </div>
        )}

        {!loading && groups.length > 0 && (
          <div className="space-y-3">
            {groups.map((group, i) => {
              const isComplete = group.completed === group.total;
              const pct = group.total > 0 ? Math.round((group.completed / group.total) * 100) : 0;

              return (
                <div
                  key={i}
                  onClick={() => !isComplete && onCardClick(group)}
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
