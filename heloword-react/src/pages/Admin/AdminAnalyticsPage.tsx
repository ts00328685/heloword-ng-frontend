import React, { useEffect, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { useTranslation } from 'react-i18next';
import Header from '../../components/Header';
import { useAuth } from '../../contexts/AuthContext';
import { useUI } from '../../contexts/UIContext';
import { useTheme } from '../../contexts/ThemeContext';
import { doGet } from '../../services/api.service';

type Range = 7 | 30 | 90;

interface CountItem {
  name: string;
  count: number;
}
interface Point {
  date: string;
  events: number;
  users: number;
}
interface Dashboard {
  days: number;
  totalEvents: number;
  uniqueUsers: number;
  pageViews: number;
  activeToday: number;
  daily: Point[];
  topPages: CountItem[];
  topEvents: CountItem[];
  topContent: CountItem[];
  devices: CountItem[];
  userTypes: CountItem[];
}

function formatXLabel(date: string, range: Range): string {
  const d = new Date(date + 'T00:00:00');
  if (range === 7) return d.toLocaleDateString('en-US', { weekday: 'short' });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const PIE_COLORS: Record<string, string> = {
  desktop: '#3b82f6',
  mobile: '#22c55e',
  member: '#3b82f6',
  guest: '#f59e0b',
  unknown: '#9ca3af',
};
const FALLBACK_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#ef4444', '#9ca3af'];

const AdminAnalyticsPage: React.FC = () => {
  const { hasAnyRole, hasCheckedLoginStatus } = useAuth();
  const { showLoading, hideLoading } = useUI();
  const { isDark } = useTheme();
  const { t } = useTranslation();

  const isAdmin = hasAnyRole(['ADMIN']);
  const [range, setRange] = useState<Range>(30);
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState(false);
  const fetchedFor = useRef<Range | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    if (fetchedFor.current === range) return;
    fetchedFor.current = range;
    fetchDashboard(range);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, range]);

  const fetchDashboard = async (days: Range) => {
    showLoading();
    setError(false);
    try {
      const response = await doGet<Dashboard>('/frontend-api/api/fe/analytics/dashboard', { days });
      if (response?.data) setData(response.data);
      else setError(true);
    } catch {
      setError(true);
    } finally {
      hideLoading();
    }
  };

  // Defense-in-depth: real enforcement is the ADMIN-only backend endpoint.
  if (hasCheckedLoginStatus && !isAdmin) {
    return <Navigate to="/home" replace />;
  }

  const gridColor = isDark ? '#374151' : '#e5e7eb';
  const textColor = isDark ? '#9ca3af' : '#6b7280';
  const tooltipStyle = isDark
    ? { backgroundColor: '#1f2937', border: '1px solid #374151', color: '#f3f4f6' }
    : { backgroundColor: '#ffffff', border: '1px solid #e5e7eb', color: '#111827' };

  const RANGES: { label: string; value: Range }[] = [
    { label: t('analytics.range7d', '7 days'), value: 7 },
    { label: t('analytics.range30d', '30 days'), value: 30 },
    { label: t('analytics.range90d', '90 days'), value: 90 },
  ];

  const chartData = (data?.daily || []).map((p) => ({ ...p, label: formatXLabel(p.date, range) }));

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 dark:bg-gray-900 animate-page-enter">
      <Header title={t('analytics.title', 'Analytics')} />

      <main className="flex-1 pb-20 px-4 pt-4 max-w-3xl mx-auto w-full">
        {/* Range toggle */}
        <div className="flex bg-gray-100 dark:bg-gray-800 rounded-xl p-1 mb-5 gap-1">
          {RANGES.map(({ label, value }) => (
            <button
              key={value}
              onClick={() => setRange(value)}
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
        <div className="grid grid-cols-2 gap-3 mb-4">
          <SummaryCard label={t('analytics.uniqueVisitors', 'Unique visitors')} value={fmt(data?.uniqueUsers)} color="blue" />
          <SummaryCard label={t('analytics.activeToday', 'Active today')} value={fmt(data?.activeToday)} color="green" />
          <SummaryCard label={t('analytics.pageViews', 'Page views')} value={fmt(data?.pageViews)} color="purple" />
          <SummaryCard label={t('analytics.totalEvents', 'Total events')} value={fmt(data?.totalEvents)} color="amber" />
        </div>

        {error && (
          <p className="text-center text-sm text-red-400 mb-4">{t('analytics.errorLoading', 'Could not load analytics.')}</p>
        )}

        {/* Traffic over time */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 mb-4 shadow-sm border border-gray-100 dark:border-gray-700">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">{t('analytics.traffic', 'Traffic over time')}</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
              <XAxis dataKey="label" tick={{ fill: textColor, fontSize: 11 }} axisLine={false} tickLine={false} interval={range === 7 ? 0 : Math.floor(range / 7)} />
              <YAxis tick={{ fill: textColor, fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 11, color: textColor }} />
              <Line type="monotone" dataKey="events" name={t('analytics.events', 'Events')} stroke="#3b82f6" strokeWidth={2} dot={false} activeDot={{ r: 5 }} />
              <Line type="monotone" dataKey="users" name={t('analytics.visitors', 'Visitors')} stroke="#22c55e" strokeWidth={2} dot={false} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Top pages & top actions */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <RankList title={t('analytics.topPages', 'Top pages')} items={data?.topPages} barColor="bg-blue-400" />
          <RankList title={t('analytics.topActions', 'Top clicks & actions')} items={data?.topEvents} barColor="bg-purple-400" />
        </div>

        {/* Top content viewed (articles / words) */}
        <div className="mb-4">
          <RankList title={t('analytics.topContent', 'Top content viewed')} items={data?.topContent} barColor="bg-emerald-400" />
        </div>

        {/* Device & audience splits */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <SplitPie title={t('analytics.devices', 'Devices')} items={data?.devices} tooltipStyle={tooltipStyle} />
          <SplitPie title={t('analytics.audience', 'Audience')} items={data?.userTypes} tooltipStyle={tooltipStyle} />
        </div>
      </main>
    </div>
  );
};

function fmt(n?: number): string {
  return typeof n === 'number' ? n.toLocaleString() : '—';
}

const colorMap: Record<string, string> = {
  blue: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400',
  green: 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400',
  purple: 'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400',
  amber: 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400',
};

const SummaryCard: React.FC<{ label: string; value: string; color: string }> = ({ label, value, color }) => (
  <div className={`rounded-2xl p-4 ${colorMap[color]}`}>
    <p className="text-xs font-medium opacity-70 mb-1">{label}</p>
    <p className="text-2xl font-bold">{value}</p>
  </div>
);

const RankList: React.FC<{ title: string; items?: CountItem[]; barColor: string }> = ({ title, items, barColor }) => {
  const list = items || [];
  const max = list.reduce((m, i) => Math.max(m, i.count), 0) || 1;
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">{title}</h3>
      {list.length === 0 ? (
        <p className="text-xs text-gray-400 dark:text-gray-500 py-4 text-center">—</p>
      ) : (
        <div className="space-y-2">
          {list.map((i) => (
            <div key={i.name}>
              <div className="flex items-center justify-between text-xs mb-0.5">
                <span className="text-gray-600 dark:text-gray-300 truncate mr-2" title={i.name}>{i.name}</span>
                <span className="text-gray-400 dark:text-gray-500 font-medium tabular-nums shrink-0">{i.count.toLocaleString()}</span>
              </div>
              <div className="h-1.5 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                <div className={`h-full rounded-full ${barColor}`} style={{ width: `${Math.max(4, (i.count / max) * 100)}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const SplitPie: React.FC<{ title: string; items?: CountItem[]; tooltipStyle: React.CSSProperties }> = ({ title, items, tooltipStyle }) => {
  const list = (items || []).filter((i) => i.count > 0);
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">{title}</h3>
      {list.length === 0 ? (
        <p className="text-xs text-gray-400 dark:text-gray-500 py-8 text-center">—</p>
      ) : (
        <ResponsiveContainer width="100%" height={180}>
          <PieChart>
            <Pie data={list} dataKey="count" nameKey="name" cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={2}>
              {list.map((entry, idx) => (
                <Cell key={entry.name} fill={PIE_COLORS[entry.name] || FALLBACK_COLORS[idx % FALLBACK_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip contentStyle={tooltipStyle} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
          </PieChart>
        </ResponsiveContainer>
      )}
    </div>
  );
};

export default AdminAnalyticsPage;
