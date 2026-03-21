import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { useTranslation } from 'react-i18next';
import Header from '../../components/Header';
import { useAuth } from '../../contexts/AuthContext';
import { useUI } from '../../contexts/UIContext';
import { useTheme } from '../../contexts/ThemeContext';
import { doPost } from '../../services/api.service';
import { DailyStat } from '../../models';

type Range = 7 | 30 | 0;

function formatXLabel(date: string, range: Range): string {
  if (range === 0) {
    // date is "yyyy-MM" — show "Jan 26"
    const [year, month] = date.split('-');
    const d = new Date(+year, +month - 1, 1);
    return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
  }
  if (range === 30) {
    // date is "yyyy-MM-dd" — show "Mar 15"
    const d = new Date(date + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  // 7 days — show "Mon"
  const d = new Date(date + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short' });
}

const StatsPage: React.FC = () => {
  const { isLoggedIn } = useAuth();
  const { showLoading, hideLoading } = useUI();
  const { isDark } = useTheme();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [range, setRange] = useState<Range>(7);

  const RANGES: { label: string; value: Range }[] = [
    { label: t('stats.range7d'),  value: 7  },
    { label: t('stats.range30d'), value: 30 },
    { label: t('stats.rangeAll'), value: 0  },
  ];
  const [stats, setStats] = useState<DailyStat[]>([]);
  const [error, setError] = useState(false);
  const fetchedFor = useRef<Range | null>(null);

  useEffect(() => {
    if (!isLoggedIn) return;
    if (fetchedFor.current === range) return;
    fetchedFor.current = range;
    fetchStats(range);
  }, [isLoggedIn, range]);

  const fetchStats = async (days: Range) => {
    showLoading();
    setError(false);
    try {
      const response = await doPost('/frontend-api/api/fe/stats/daily-summary', { days });
      setStats(response.data || []);
    } catch {
      setError(true);
    } finally {
      hideLoading();
    }
  };

  const handleRangeChange = (r: Range) => {
    fetchedFor.current = null; // force re-fetch
    setRange(r);
  };

  const gridColor   = isDark ? '#374151' : '#e5e7eb';
  const textColor   = isDark ? '#9ca3af' : '#6b7280';
  const tooltipStyle = isDark
    ? { backgroundColor: '#1f2937', border: '1px solid #374151', color: '#f3f4f6' }
    : { backgroundColor: '#ffffff', border: '1px solid #e5e7eb', color: '#111827' };

  const chartData = stats.map((s) => ({
    ...s,
    label: formatXLabel(s.date, range),
    correctCount: Math.max(0, s.total - s.wrongCount),
    timeSpentMin: +(s.timeSpent / 60).toFixed(1),
  }));

  const totalReviewed = stats.reduce((sum, s) => sum + s.total, 0);
  const totalWrong    = stats.reduce((sum, s) => sum + s.wrongCount, 0);
  const totalTimeMin  = +(stats.reduce((sum, s) => sum + s.timeSpent, 0) / 60).toFixed(1);
  const accuracy      = totalReviewed > 0 ? Math.round(((totalReviewed - totalWrong) / totalReviewed) * 100) : 0;

  if (!isLoggedIn) {
    return (
      <div className="flex flex-col min-h-screen bg-gray-50 dark:bg-gray-900">
        <Header title="Statistics" />
        <main className="flex-1 pb-20 px-4 pt-8 max-w-2xl mx-auto w-full flex flex-col items-center justify-center">
          <div className="text-center">
            <div className="w-20 h-20 bg-gray-100 dark:bg-gray-800 rounded-3xl mx-auto mb-6 flex items-center justify-center">
              <svg className="w-10 h-10 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-2">Statistics</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">{t('stats.loginPrompt')}</p>
            <button
              onClick={() => navigate('/login')}
              className="bg-blue-500 text-white font-semibold text-sm px-6 py-2.5 rounded-xl hover:bg-blue-600 transition-colors"
            >
              Login
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header title="Statistics" />

      <main className="flex-1 pb-20 px-4 pt-4 max-w-2xl mx-auto w-full">

        {/* Range toggle */}
        <div className="flex bg-gray-100 dark:bg-gray-800 rounded-xl p-1 mb-5 gap-1">
          {RANGES.map(({ label, value }) => (
            <button
              key={value}
              onClick={() => handleRangeChange(value)}
              className={`flex-1 py-1.5 text-sm font-semibold rounded-lg transition-colors ${
                range === value
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 gap-3 mb-5">
          <SummaryCard label={t('stats.reviews')} value={totalReviewed.toString()} color="blue" />
          <SummaryCard label={t('stats.accuracy')} value={`${accuracy}%`} color="green" />
          <SummaryCard label={t('stats.wrong')} value={totalWrong.toString()} color="red" />
          <SummaryCard label={t('stats.time')} value={`${totalTimeMin} min`} color="purple" />
        </div>

        {error && (
          <p className="text-center text-sm text-red-400 mb-4">{t('stats.errorLoading')}</p>
        )}

        {!error && stats.every((s) => s.total === 0) && (
          <div className="text-center py-10">
            <p className="text-sm text-gray-400 dark:text-gray-500">{t('stats.noData')}</p>
          </div>
        )}

        {chartData.some((d) => d.total > 0) && (
          <>
            {/* Reviews chart */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 mb-4 shadow-sm border border-gray-100 dark:border-gray-700">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">{t('stats.chartReviews')}</h3>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                  <XAxis dataKey="label" tick={{ fill: textColor, fontSize: 11 }} axisLine={false} tickLine={false} interval={range === 30 ? 4 : 0} />
                  <YAxis tick={{ fill: textColor, fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 11, color: textColor }} />
                  <Line type="monotone" dataKey="total"        name={t('stats.total')}   stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                  <Line type="monotone" dataKey="correctCount" name={t('stats.correct')} stroke="#22c55e" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                  <Line type="monotone" dataKey="wrongCount"   name={t('stats.wrong')}   stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Time spent chart */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">{t('stats.chartTime')}</h3>
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                  <XAxis dataKey="label" tick={{ fill: textColor, fontSize: 11 }} axisLine={false} tickLine={false} interval={range === 30 ? 4 : 0} />
                  <YAxis tick={{ fill: textColor, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`${v} min`, t('stats.time')]} />
                  <Line type="monotone" dataKey="timeSpentMin" name={t('stats.minutes')} stroke="#a855f7" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </main>
    </div>
  );
};

const colorMap: Record<string, string> = {
  blue:   'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400',
  green:  'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400',
  red:    'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400',
  purple: 'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400',
};

const SummaryCard: React.FC<{ label: string; value: string; color: string }> = ({ label, value, color }) => (
  <div className={`rounded-2xl p-4 ${colorMap[color]}`}>
    <p className="text-xs font-medium opacity-70 mb-1">{label}</p>
    <p className="text-2xl font-bold">{value}</p>
  </div>
);

export default StatsPage;
