import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../../components/Header';
import { useAuth } from '../../contexts/AuthContext';
import { useUI } from '../../contexts/UIContext';
import { QuizSetting, TYPE_TO_TABLE_MAP, WORD_SENTENCE_TITLE_MAP } from '../../models';
import { doPost } from '../../services/api.service';

interface QuizGroup {
  date: Date;
  records: QuizSetting[];
  completed: number;
  total: number;
  latestFinishedTime?: Date;
}

const ReviewPage: React.FC = () => {
  const navigate = useNavigate();
  const { isLoggedIn } = useAuth();
  const { showLoading, hideLoading } = useUI();

  const [groups, setGroups] = useState<QuizGroup[]>([]);
  const [loading, setLoading] = useState(false);

  const emptyMsg = isLoggedIn ? 'Empty Records~' : 'Log-in required';

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

      // Sort by latestFinishedTime desc, then by date desc
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

  const formatDate = (d: Date) =>
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const formatTime = (d?: Date) => {
    if (!d) return '';
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <Header title="Review" />

      <main className="flex-1 pb-20 px-4 pt-4 max-w-2xl mx-auto w-full">
        {!isLoggedIn && (
          <div className="text-center py-16">
            <div className="w-16 h-16 bg-gray-100 rounded-2xl mx-auto mb-4 flex items-center justify-center">
              <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <p className="text-gray-500 font-medium">Login required</p>
            <p className="text-sm text-gray-400 mt-1">Sign in to see your quiz history</p>
            <button
              onClick={() => navigate('/login')}
              className="mt-4 bg-blue-500 text-white font-semibold text-sm px-6 py-2.5 rounded-xl hover:bg-blue-600 transition-colors"
            >
              Go to Login
            </button>
          </div>
        )}

        {isLoggedIn && loading && (
          <div className="text-center py-12">
            <div className="w-8 h-8 border-4 border-blue-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-gray-400">Loading quiz history...</p>
          </div>
        )}

        {isLoggedIn && !loading && groups.length === 0 && (
          <div className="text-center py-16">
            <p className="text-gray-400 text-sm">{emptyMsg}</p>
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
                  className={`bg-white rounded-2xl border-2 p-4 transition-all shadow-sm ${
                    isComplete
                      ? 'border-green-200 opacity-70'
                      : 'border-gray-200 hover:border-blue-300 cursor-pointer hover:shadow-md active:scale-[0.99]'
                  }`}
                >
                  {/* Header row */}
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="text-sm font-bold text-gray-800">{formatDate(group.date)}</p>
                      {group.latestFinishedTime && (
                        <p className="text-xs text-gray-400 mt-0.5">
                          Last activity: {formatTime(group.latestFinishedTime)}
                        </p>
                      )}
                    </div>
                    <span
                      className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                        isComplete
                          ? 'bg-green-100 text-green-600'
                          : 'bg-orange-100 text-orange-600'
                      }`}
                    >
                      {isComplete ? 'Done' : `${pct}%`}
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div className="h-1.5 bg-gray-100 rounded-full mb-3">
                    <div
                      className={`h-1.5 rounded-full transition-all ${isComplete ? 'bg-green-400' : 'bg-blue-500'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>

                  {/* Progress text */}
                  <p className="text-xs text-gray-500 mb-2">
                    {group.completed} / {group.total} completed
                  </p>

                  {/* Word types */}
                  <div className="flex flex-wrap gap-1.5">
                    {group.records.map((r) => (
                      <span key={r.type} className="text-xs bg-blue-50 text-blue-500 px-2 py-0.5 rounded-md font-medium">
                        {WORD_SENTENCE_TITLE_MAP[r.type] || r.type}
                        {r.min && r.max ? ` (${r.min}-${r.max})` : ''}
                      </span>
                    ))}
                  </div>

                  {!isComplete && (
                    <p className="text-xs text-blue-500 font-medium mt-2 text-right">
                      Tap to resume →
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
