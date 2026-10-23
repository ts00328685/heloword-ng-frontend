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
import DailyGoalDashboard from './DailyGoalDashboard';
import { useAuth } from '../../contexts/AuthContext';
import { useUI } from '../../contexts/UIContext';
import { useTheme } from '../../contexts/ThemeContext';
import { doPost } from '../../services/api.service';
import { DailyStat } from '../../models';
import { getStudyCoach } from '../../services/llm.service';
import WeeklyStoryCard from '../../components/WeeklyStoryCard';
import { computeGuestDailyStats } from '../../services/guestStorage.service';

type Range = 7 | 30 | 0;

function formatXLabel(date: string, range: Range, locale: string): string {
  if (range === 0) {
    // date is "yyyy-MM" — show "Jan 26"
    const [year, month] = date.split('-');
    const d = new Date(+year, +month - 1, 1);
    return d.toLocaleDateString(locale, { month: 'short', year: '2-digit' });
  }
  if (range === 30) {
    // date is "yyyy-MM-dd" — show "Mar 15"
    const d = new Date(date + 'T00:00:00');
    return d.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
  }
  // 7 days — show "Mon"
  const d = new Date(date + 'T00:00:00');
  return d.toLocaleDateString(locale, { weekday: 'short' });
}

const StatsPage: React.FC = () => {
  const { isLoggedIn } = useAuth();
  const { showLoading, hideLoading } = useUI();
  const { isDark } = useTheme();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [range, setRange] = useState<Range>(7);

  const [coachText, setCoachText]       = useState('');
  const [coachLoading, setCoachLoading] = useState(false);
  const [coachError, setCoachError]     = useState(false);

  const RANGES: { label: string; value: Range }[] = [
    { label: t('stats.range7d'),  value: 7  },
    { label: t('stats.range30d'), value: 30 },
    { label: t('stats.rangeAll'), value: 0  },
  ];
  const [stats, setStats] = useState<DailyStat[]>([]);
  const [error, setError] = useState(false);
  const fetchedFor = useRef<Range | null>(null);

  useEffect(() => {
    if (!isLoggedIn) {
      // Guests: quiz records saved on this device, aggregated like the server does.
      setStats(computeGuestDailyStats(range));
      return;
    }
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

  const gridColor   = isDark ? '#2E2C29' : '#E4E0D8';
  const textColor   = isDark ? '#9E9A92' : '#6B6862';
  const tooltipStyle = isDark
    ? { backgroundColor: '#1C1B19', border: '1px solid #2E2C29', color: '#E8E6E1' }
    : { backgroundColor: '#FFFFFF', border: '1px solid #E4E0D8', color: '#1F1E1C' };

  const chartData = stats.map((s) => ({
    ...s,
    label: formatXLabel(s.date, range, i18n.language === 'zh' ? 'zh-TW' : i18n.language),
    correctCount: Math.max(0, s.total - s.wrongCount),
    timeSpentMin: +(s.timeSpent / 60).toFixed(1),
  }));

  const totalReviewed = stats.reduce((sum, s) => sum + s.total, 0);
  const totalWrong    = stats.reduce((sum, s) => sum + s.wrongCount, 0);
  const totalTimeMin  = +(stats.reduce((sum, s) => sum + s.timeSpent, 0) / 60).toFixed(1);
  const accuracy      = totalReviewed > 0 ? Math.round(((totalReviewed - totalWrong) / totalReviewed) * 100) : 0;

  const handleStudyCoach = async () => {
    setCoachLoading(true);
    setCoachError(false);
    setCoachText('');
    try {
      const result = await getStudyCoach(accuracy, totalWrong, i18n.language);
      setCoachText(result);
    } catch {
      setCoachError(true);
    } finally {
      setCoachLoading(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-paper animate-page-enter">
      <Header title={t('nav.stats')} hideLogin />

      <main className="flex-1 pb-20 px-4 pt-4 max-w-2xl mx-auto w-full">

        {/* Daily Goal Dashboard — visible for all users */}
        <DailyGoalDashboard />

        {/* Guests see their own (on-device) stats; logging in syncs them */}
        {!isLoggedIn && (
          <button
            onClick={() => navigate('/login')}
            className="w-full flex items-center gap-3 rounded-md border border-line bg-surface px-3 py-2.5 mb-5 text-left hover:border-ink/30 transition-colors"
          >
            <svg className="w-4 h-4 text-ink-faint shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="flex-1 text-xs text-ink-muted">
              {t('review.guestBanner')} <span className="text-ink underline underline-offset-2">{t('common.login')}</span>
            </span>
          </button>
        )}

        {(
          <>
        {/* Section label */}
        <p className="text-xs font-semibold text-ink-faint uppercase tracking-wider mb-3">{t('stats.history')}</p>

        {/* Range toggle */}
        <div className="flex bg-ink/5 rounded-xl p-1 mb-5 gap-1">
          {RANGES.map(({ label, value }) => (
            <button
              key={value}
              onClick={() => handleRangeChange(value)}
              className={`flex-1 py-1.5 text-sm font-semibold rounded-lg transition-colors ${
                range === value
                  ? 'bg-surface text-ink shadow-sm'
                  : 'text-ink-muted hover:text-ink '
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <SummaryCard label={t('stats.reviews')} value={totalReviewed.toString()} color="blue" />
          <SummaryCard label={t('stats.accuracy')} value={`${accuracy}%`} color="green" />
          <SummaryCard label={t('stats.wrong')} value={totalWrong.toString()} color="red" />
          <SummaryCard label={t('stats.time')} value={`${totalTimeMin} min`} color="purple" />
        </div>

        {/* Study Tip */}
        {totalReviewed > 0 && (
          <div className="mb-5">
            <div className="flex justify-center">
              <button data-analytics="ai.study_coach"
                onClick={handleStudyCoach}
                disabled={coachLoading}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-medium tracking-wide ring-1 ring-inset ring-line text-ink-muted bg-surface hover:ring-ink/30 hover:text-ink disabled:opacity-40 disabled:pointer-events-none transition-all duration-150"
              >
                {coachLoading
                  ? <><span className="w-3 h-3 border-[1.5px] border-current border-t-transparent rounded-full animate-spin" />{t('llm.thinking')}</>
                  : <><svg className="w-2.5 h-2.5 flex-shrink-0" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true"><path d="M5 0L6 4L10 5L6 6L5 10L4 6L0 5L4 4Z"/></svg>{t('llm.studyCoach')}</>}
              </button>
            </div>
            {(coachText || coachError) && (
              <div className="mt-3 bg-paper rounded-2xl ring-1 ring-inset ring-line p-4">
                <p className="text-xs font-semibold text-ink-muted mb-1.5">{t('llm.studyCoach')}</p>
                {coachError ? (
                  <div className="flex items-center gap-2">
                    <p className="text-sm text-danger flex-1">{t('llm.error')}</p>
                    <button data-analytics="ai.study_coach" onClick={handleStudyCoach} className="text-xs text-accent underline">↺</button>
                  </div>
                ) : (
                  <p className="text-sm text-ink leading-relaxed whitespace-pre-wrap">{coachText}</p>
                )}
              </div>
            )}
          </div>
        )}

        {isLoggedIn && totalReviewed > 0 && <WeeklyStoryCard />}

        {error && (
          <p className="text-center text-sm text-danger mb-4">{t('stats.errorLoading')}</p>
        )}

        {!error && stats.every((s) => s.total === 0) && (
          <div className="text-center py-10">
            <p className="text-sm text-ink-faint">{t('stats.noData')}</p>
          </div>
        )}

        {chartData.some((d) => d.total > 0) && (
          <>
            {/* Reviews chart */}
            <div className="bg-surface rounded-2xl p-4 mb-4 shadow-sm border border-line">
              <h3 className="text-sm font-semibold text-ink mb-3">{t('stats.chartReviews')}</h3>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                  <XAxis dataKey="label" tick={{ fill: textColor, fontSize: 11 }} axisLine={false} tickLine={false} interval={range === 30 ? 4 : 0} />
                  <YAxis tick={{ fill: textColor, fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 11, color: textColor }} />
                  <Line type="monotone" dataKey="total"        name={t('stats.total')}   stroke={isDark ? '#8FA8C7' : '#2E4A6B'} strokeWidth={1.5} dot={false} activeDot={{ r: 3 }} />
                  <Line type="monotone" dataKey="correctCount" name={t('stats.correct')} stroke={isDark ? '#8CA880' : '#5A7451'} strokeWidth={1.5} dot={false} activeDot={{ r: 3 }} />
                  <Line type="monotone" dataKey="wrongCount"   name={t('stats.wrong')}   stroke={isDark ? '#C98073' : '#A8584B'} strokeWidth={1.5} dot={false} activeDot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Time spent chart */}
            <div className="bg-surface rounded-2xl p-4 shadow-sm border border-line">
              <h3 className="text-sm font-semibold text-ink mb-3">{t('stats.chartTime')}</h3>
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                  <XAxis dataKey="label" tick={{ fill: textColor, fontSize: 11 }} axisLine={false} tickLine={false} interval={range === 30 ? 4 : 0} />
                  <YAxis tick={{ fill: textColor, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`${v} min`, t('stats.time')]} />
                  <Line type="monotone" dataKey="timeSpentMin" name={t('stats.minutes')} stroke={isDark ? '#8FA8C7' : '#2E4A6B'} strokeWidth={1.5} dot={false} activeDot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
          </>
        )}
      </main>
    </div>
  );
};

const colorMap: Record<string, string> = {
  blue:   'bg-accent-soft text-accent',
  green:  'bg-success-soft text-success',
  red:    'bg-danger-soft text-danger',
  purple: 'bg-accent-soft text-accent',
};

const SummaryCard: React.FC<{ label: string; value: string; color: string }> = ({ label, value, color }) => (
  <div className={`rounded-2xl p-4 ${colorMap[color]}`}>
    <p className="text-xs font-medium opacity-70 mb-1">{label}</p>
    <p className="text-2xl font-semibold">{value}</p>
  </div>
);

export default StatsPage;
