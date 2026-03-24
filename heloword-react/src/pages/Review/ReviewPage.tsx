import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Header from '../../components/Header';
import { useAuth } from '../../contexts/AuthContext';
import { useUI } from '../../contexts/UIContext';
import { DueGroup, QuizSetting, TYPE_TO_TABLE_MAP } from '../../models';
import { doPost } from '../../services/api.service';
import { useNotifications } from '../../contexts/NotificationContext';
import {
  getGuestSettings,
  getGuestRecords,
  getFinishedIdsBySetting,
  GuestSetting,
  deleteGuestGroup,
  saveGuestGroupOverride,
  deleteGuestGroupOverride,
} from '../../services/guestStorage.service';
import {
  formatRelativeTime,
  formatInterval,
  getGroupKey,
  getIntervals,
} from '../../utils/ebbinghaus';

interface QuizGroup {
  date: Date;
  records: QuizSetting[];
  completed: number;
  total: number;
  latestFinishedTime?: Date;
}

type StatusFilter = 'ALL' | 'UNFINISHED' | 'DUE' | 'FRESH' | 'SCHEDULED';

const STATUS_CONFIG = {
  UNFINISHED: { color: 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400',    dot: 'bg-blue-400' },
  DUE:        { color: 'bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-400', dot: 'bg-orange-400' },
  FRESH:      { color: 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400',         dot: 'bg-red-400' },
  SCHEDULED:  { color: 'bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400', dot: 'bg-green-400' },
};

const ReviewPage: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { isLoggedIn } = useAuth();
  const { showLoading, hideLoading } = useUI();

  const { dueGroups, dueCount, groupStates, refresh, refreshGuest } = useNotifications();
  const [groups, setGroups] = useState<QuizGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAllDue, setShowAllDue] = useState(false);

  // Search + filter
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');

  // Selection mode
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [batchDeleting, setBatchDeleting] = useState(false);

  // Edit modal state
  const [editGroup, setEditGroup] = useState<QuizGroup | null>(null);
  const [editLevel, setEditLevel] = useState(0);
  const [editSaving, setEditSaving] = useState(false);

  const intervals = getIntervals();

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
          { completed: 0, total: 0 },
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
        if (a.latestFinishedTime && b.latestFinishedTime)
          return b.latestFinishedTime.getTime() - a.latestFinishedTime.getTime();
        return b.date.getTime() - a.date.getTime();
      });

      setGroups(parsed);
      refresh();
    } finally {
      setLoading(false);
      hideLoading();
    }
  };

  // ─── Guest (localStorage) ─────────────────────────────────────────────────

  const loadGuestData = () => {
    const settings = getGuestSettings();
    const records  = getGuestRecords();
    if (settings.length === 0) { setGroups([]); return; }

    const byDate: Record<string, GuestSetting[]> = {};
    for (const s of settings) {
      const dateKey = s.timestamp.slice(0, 10);
      (byDate[dateKey] ??= []).push(s);
    }

    const parsed: QuizGroup[] = Object.entries(byDate).map(([dateKey, daySettings]) => {
      let completed = 0; let total = 0; let latestFinishedMs = 0;
      for (const s of daySettings) {
        const settingRecords = records.filter((r) => r.settingId === s.id);
        const correctIds = new Set(settingRecords.filter((r) => r.wrongCount === 0).map((r) => r.answerId));
        total += s.max - s.min + 1;
        completed += correctIds.size;
        for (const r of settingRecords) {
          const ms = new Date(r.finishedTime).getTime();
          if (ms > latestFinishedMs) latestFinishedMs = ms;
        }
      }
      const records_qs: QuizSetting[] = daySettings.map((s) => ({
        id: undefined, _guestId: s.id, timestamp: new Date(s.timestamp),
        type: s.type, tableName: s.tableName, total: s.total,
        isSelected: true, min: s.min, max: s.max,
      } as any));
      return {
        date: new Date(dateKey), records: records_qs, completed, total,
        latestFinishedTime: latestFinishedMs > 0 ? new Date(latestFinishedMs) : undefined,
      };
    });

    parsed.sort((a, b) => b.date.getTime() - a.date.getTime());
    setGroups(parsed);
  };

  // ─── Group state helpers ───────────────────────────────────────────────────

  const resolveGroupState = (records: QuizSetting[]): DueGroup | undefined => {
    const keys = records.map((s) => getGroupKey(s.type, s.min ?? 1, s.max ?? s.total));
    const states = keys.map((k) => groupStates.get(k)).filter(Boolean) as DueGroup[];
    if (states.length === 0) return undefined;
    const order = { UNFINISHED: 0, FRESH: 1, DUE: 2, SCHEDULED: 3 };
    return states.sort((a, b) => order[a.status] - order[b.status])[0];
  };

  // ─── Formatting ───────────────────────────────────────────────────────────

  const formatDate = (d: Date) =>
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  // ─── Filtering ────────────────────────────────────────────────────────────

  const filteredGroups = groups.filter((g) => {
    const state = resolveGroupState(g.records);
    const status = state?.status ?? 'SCHEDULED';
    if (statusFilter !== 'ALL' && status !== statusFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchType = g.records.some((r) =>
        t(`wordLists.${r.type}`, r.type).toLowerCase().includes(q),
      );
      const matchDate = formatDate(g.date).toLowerCase().includes(q);
      if (!matchType && !matchDate) return false;
    }
    return true;
  });

  // ─── Navigation ───────────────────────────────────────────────────────────

  const handleCardClick = async (group: QuizGroup, forceNewSession = false) => {
    const state = resolveGroupState(group.records);
    const isDue = state && (state.status === 'DUE' || state.status === 'FRESH');

    if (isDue || forceNewSession) {
      const quizSettings: Record<string, QuizSetting> = {};
      group.records.forEach((s) => {
        quizSettings[s.type] = { ...s, timestamp: new Date(), tableName: TYPE_TO_TABLE_MAP[s.type] || s.tableName };
      });
      navigate('/vocabulary/quiz', { state: { quizSettings } });
      return;
    }

    if (group.completed === group.total) return;

    const settingIds = group.records.map((s) => s.id).filter(Boolean);
    showLoading();
    try {
      const response = await doPost('/frontend-api/api/fe/quiz/get-record-ids-by-setting-ids', settingIds);
      const quizSettings: Record<string, QuizSetting> = {};
      group.records.forEach((s) => {
        quizSettings[s.type] = { ...s, timestamp: new Date(), tableName: TYPE_TO_TABLE_MAP[s.type] || s.tableName };
      });
      navigate('/vocabulary/quiz', { state: { quizSettings, finishedIdMap: response.data } });
    } finally {
      hideLoading();
    }
  };

  const handleGuestCardClick = (group: QuizGroup, forceNewSession = false) => {
    const state = resolveGroupState(group.records);
    const isDue = state && (state.status === 'DUE' || state.status === 'FRESH');

    if (isDue || forceNewSession) {
      const quizSettings: Record<string, QuizSetting> = {};
      group.records.forEach((s: any) => {
        quizSettings[s.type] = { ...s, timestamp: new Date(), tableName: TYPE_TO_TABLE_MAP[s.type] || s.tableName };
      });
      navigate('/vocabulary/quiz', { state: { quizSettings } });
      return;
    }

    if (group.completed === group.total) return;

    const quizSettings: Record<string, QuizSetting> = {};
    const finishedIdMap: Record<string, number[]> = {};
    group.records.forEach((s: any) => {
      quizSettings[s.type] = { ...s, timestamp: new Date(), tableName: TYPE_TO_TABLE_MAP[s.type] || s.tableName };
      if (s._guestId) finishedIdMap[s._guestId] = getFinishedIdsBySetting(s._guestId);
    });
    navigate('/vocabulary/quiz', { state: { quizSettings, finishedIdMap } });
  };

  const handleDueReviewClick = async () => {
    if (dueGroups.length === 0) return;
    const allRecords = groups.flatMap((grp) => grp.records);
    const quizSettings: Record<string, QuizSetting> = {};

    dueGroups.forEach((g) => {
      // Match by type + range so we carry over the existing id — prevents a duplicate setting record
      const existing = allRecords.find(
        (r) => r.type === g.type && (r.min ?? 1) === g.min && (r.max ?? r.total) === g.max,
      );
      if (existing) {
        quizSettings[g.type] = { ...existing, timestamp: new Date(), tableName: TYPE_TO_TABLE_MAP[g.type] || existing.tableName };
      } else {
        quizSettings[g.type] = {
          timestamp: new Date(), type: g.type,
          tableName: TYPE_TO_TABLE_MAP[g.type] || g.type,
          total: g.max - g.min + 1, isSelected: true, min: g.min, max: g.max,
        };
      }
    });

    // For UNFINISHED groups, fetch already-completed word IDs so the quiz skips them
    const unfinishedSettingIds = dueGroups
      .filter((g) => g.status === 'UNFINISHED')
      .map((g) => allRecords.find((r) => r.type === g.type && (r.min ?? 1) === g.min && (r.max ?? r.total) === g.max)?.id)
      .filter(Boolean) as number[];

    if (!isLoggedIn) {
      const finishedIdMap: Record<string, number[]> = {};
      dueGroups
        .filter((g) => g.status === 'UNFINISHED')
        .forEach((g) => {
          const existing = allRecords.find(
            (r) => r.type === g.type && (r.min ?? 1) === g.min && (r.max ?? r.total) === g.max,
          ) as any;
          if (existing?._guestId) finishedIdMap[existing._guestId] = getFinishedIdsBySetting(existing._guestId);
        });
      navigate('/vocabulary/quiz', { state: { quizSettings, ...(Object.keys(finishedIdMap).length ? { finishedIdMap } : {}) } });
      return;
    }

    if (unfinishedSettingIds.length > 0) {
      showLoading();
      try {
        const response = await doPost('/frontend-api/api/fe/quiz/get-record-ids-by-setting-ids', unfinishedSettingIds);
        navigate('/vocabulary/quiz', { state: { quizSettings, finishedIdMap: response.data } });
      } finally {
        hideLoading();
      }
    } else {
      navigate('/vocabulary/quiz', { state: { quizSettings } });
    }
  };

  const onCardClick = (group: QuizGroup, forceNewSession?: boolean) =>
    isLoggedIn ? handleCardClick(group, forceNewSession) : handleGuestCardClick(group, forceNewSession);

  // ─── Delete group ─────────────────────────────────────────────────────────

  const handleDeleteGroup = async (group: QuizGroup) => {
    setEditSaving(true);
    try {
      if (isLoggedIn) {
        for (const r of group.records) {
          await doPost('/frontend-api/api/fe/quiz/delete-group', {
            type: r.type, min: r.min ?? 1, max: r.max ?? r.total,
          });
        }
        await fetchData();
      } else {
        for (const r of group.records) {
          deleteGuestGroup(r.type, r.min ?? 1, r.max ?? r.total);
        }
        loadGuestData();
        refreshGuest();
      }
      setEditGroup(null);
    } finally {
      setEditSaving(false);
    }
  };

  // ─── Stable group key (for selection) ────────────────────────────────────

  const groupKey = (g: QuizGroup) => g.date.toISOString() + ':' + g.records.map((r) => r.type).join(',');

  const toggleSelect = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedKeys.size === filteredGroups.length) {
      setSelectedKeys(new Set());
    } else {
      setSelectedKeys(new Set(filteredGroups.map(groupKey)));
    }
  };

  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedKeys(new Set());
  };

  const handleBatchDelete = async () => {
    const toDelete = filteredGroups.filter((g) => selectedKeys.has(groupKey(g)));
    if (toDelete.length === 0) return;
    setBatchDeleting(true);
    try {
      for (const group of toDelete) {
        for (const r of group.records) {
          if (isLoggedIn) {
            await doPost('/frontend-api/api/fe/quiz/delete-group', {
              type: r.type, min: r.min ?? 1, max: r.max ?? r.total,
            });
          } else {
            deleteGuestGroup(r.type, r.min ?? 1, r.max ?? r.total);
          }
        }
      }
      if (isLoggedIn) {
        await fetchData();
      } else {
        loadGuestData();
        refreshGuest();
      }
      exitSelectionMode();
    } finally {
      setBatchDeleting(false);
    }
  };

  // ─── Set level override ───────────────────────────────────────────────────

  const handleSaveLevel = async () => {
    if (!editGroup) return;
    setEditSaving(true);
    try {
      for (const r of editGroup.records) {
        const groupKey = getGroupKey(r.type, r.min ?? 1, r.max ?? r.total);
        if (isLoggedIn) {
          await doPost('/frontend-api/api/fe/quiz/save-group-override', {
            type: r.type, min: r.min ?? 1, max: r.max ?? r.total,
            levelOverride: editLevel, setAt: new Date().toISOString(),
          });
        } else {
          saveGuestGroupOverride(groupKey, editLevel);
        }
      }
      if (isLoggedIn) {
        await refresh();
      } else {
        refreshGuest();
      }
      setEditGroup(null);
    } finally {
      setEditSaving(false);
    }
  };

  const handleClearOverride = async () => {
    if (!editGroup) return;
    setEditSaving(true);
    try {
      for (const r of editGroup.records) {
        const groupKey = getGroupKey(r.type, r.min ?? 1, r.max ?? r.total);
        if (isLoggedIn) {
          await doPost(`/frontend-api/api/fe/quiz/delete-group-override?groupKey=${encodeURIComponent(groupKey)}`, {});
        } else {
          deleteGuestGroupOverride(groupKey);
        }
      }
      if (isLoggedIn) await refresh(); else refreshGuest();
      setEditGroup(null);
    } finally {
      setEditSaving(false);
    }
  };

  // ─── Open edit modal ──────────────────────────────────────────────────────

  const openEdit = (e: React.MouseEvent, group: QuizGroup) => {
    e.stopPropagation();
    const state = resolveGroupState(group.records);
    setEditLevel(state?.reviewLevel ?? 0);
    setEditGroup(group);
  };

  const formatTime = (d?: Date) => {
    if (!d) return '';
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  const statusLabel = (status: DueGroup['status']) => ({
    UNFINISHED: t('review.groupStatusUnfinished'),
    DUE:        t('review.groupStatusDue'),
    FRESH:      t('review.groupStatusFresh'),
    SCHEDULED:  t('review.groupStatusScheduled'),
  }[status]);

  // ─── Render ───────────────────────────────────────────────────────────────

  const filterButtons: { key: StatusFilter; label: string }[] = [
    { key: 'ALL',        label: t('review.filterAll') },
    { key: 'DUE',        label: t('review.groupStatusDue') },
    { key: 'FRESH',      label: t('review.groupStatusFresh') },
    { key: 'UNFINISHED', label: t('review.groupStatusUnfinished') },
    { key: 'SCHEDULED',  label: t('review.groupStatusScheduled') },
  ];

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header title={t('nav.review')} />

      <main className="flex-1 pb-20 px-4 pt-4 max-w-2xl mx-auto w-full">

        {/* Guest upsell banner */}
        {!isLoggedIn && (
          <div
            onClick={() => navigate('/login')}
            className="flex items-center gap-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-2xl p-3 mb-4 cursor-pointer hover:bg-blue-100 transition-colors"
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
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 bg-orange-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
                  {dueCount > 99 ? '99+' : dueCount}
                </span>
                <h3 className="text-sm font-semibold text-orange-700 dark:text-orange-400">{t('review.dueForReview')}</h3>
              </div>
              <button onClick={() => setShowAllDue((v) => !v)} className="text-xs text-orange-500 font-medium">
                {showAllDue ? t('review.hide') : t('review.showAll')}
              </button>
            </div>
            <p className="text-xs text-orange-500 mb-3">{t('review.dueDescription')}</p>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {(showAllDue ? dueGroups : dueGroups.slice(0, 6)).map((g) => {
                const cfg = STATUS_CONFIG[g.status];
                return (
                  <span key={g.groupKey} className={`text-xs px-2 py-0.5 rounded-lg font-medium flex items-center gap-1 ${cfg.color}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                    {t(`wordLists.${g.type}`, g.type)} {g.min}–{g.max}
                    {' '}<span className="opacity-60">L{g.reviewLevel}</span>
                  </span>
                );
              })}
              {!showAllDue && dueCount > 6 && (
                <span className="text-xs text-orange-400 px-2 py-0.5">{t('review.moreItems', { count: dueCount - 6 })}</span>
              )}
            </div>
            <button
              onClick={handleDueReviewClick}
              className="w-full py-2 bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-white text-sm font-semibold rounded-xl transition-colors"
            >
              {t('review.startDueReview')}
            </button>
          </div>
        )}

        {/* Search + filter bar */}
        {groups.length > 0 && (
          <div className="mb-4 space-y-2">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t('review.searchPlaceholder')}
                  className="w-full pl-9 pr-4 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 text-gray-800 dark:text-gray-200 placeholder-gray-400"
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">×</button>
                )}
              </div>
              {/* Select mode toggle */}
              {!selectionMode ? (
                <button
                  onClick={() => setSelectionMode(true)}
                  className="shrink-0 text-xs px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 font-medium transition-colors"
                >
                  {t('review.select')}
                </button>
              ) : (
                <button
                  onClick={exitSelectionMode}
                  className="shrink-0 text-xs px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 font-medium transition-colors"
                >
                  {t('review.cancel')}
                </button>
              )}
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
              {filterButtons.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setStatusFilter(key)}
                  className={`shrink-0 text-xs px-3 py-1 rounded-full font-medium transition-colors ${
                    statusFilter === key
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                  }`}
                >
                  {label}
                </button>
              ))}
              {/* Select all (shown only in selection mode) */}
              {selectionMode && filteredGroups.length > 0 && (
                <button
                  onClick={toggleSelectAll}
                  className="shrink-0 text-xs px-3 py-1 rounded-full font-medium transition-colors bg-gray-100 dark:bg-gray-800 text-blue-500 dark:text-blue-400 hover:bg-gray-200 dark:hover:bg-gray-700 ml-auto"
                >
                  {selectedKeys.size === filteredGroups.length ? t('review.deselectAll') : t('review.selectAll')}
                </button>
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
          <div className="text-center py-16 flex flex-col items-center gap-4">
            <p className="text-gray-400 dark:text-gray-500 text-sm">{t('review.empty')}</p>
            <button
              onClick={() => navigate('/vocabulary')}
              className="px-5 py-2.5 bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold rounded-2xl transition-colors"
            >
              {t('review.goConfigureGroups')}
            </button>
          </div>
        )}

        {!loading && filteredGroups.length === 0 && groups.length > 0 && (
          <div className="text-center py-10">
            <p className="text-gray-400 dark:text-gray-500 text-sm">{t('review.noResults')}</p>
          </div>
        )}

        {!loading && filteredGroups.length > 0 && (
          <div className="space-y-3" style={{ paddingBottom: selectionMode && selectedKeys.size > 0 ? '5rem' : undefined }}>
            {filteredGroups.map((group, i) => {
              const pct = group.total > 0 ? Math.round((group.completed / group.total) * 100) : 0;
              const groupState = resolveGroupState(group.records);
              const status = groupState?.status ?? 'SCHEDULED';
              const cfg = STATUS_CONFIG[status];
              const isDue = status === 'DUE' || status === 'FRESH';
              const isUnfinished = status === 'UNFINISHED';
              const isClickable = !selectionMode && (isDue || isUnfinished);
              const key = groupKey(group);
              const isSelected = selectedKeys.has(key);

              // Current interval tag for this group
              const currentIntervalMs = intervals[Math.min((groupState?.reviewLevel ?? 0), intervals.length - 1)];

              return (
                <div
                  key={i}
                  onClick={() => selectionMode ? toggleSelect(key) : isClickable && onCardClick(group)}
                  className={`bg-white dark:bg-gray-800 rounded-2xl border-2 p-4 transition-all shadow-sm cursor-pointer ${
                    isSelected
                      ? 'border-blue-500 dark:border-blue-500 bg-blue-50 dark:bg-blue-900/10'
                      : isDue && !selectionMode
                        ? 'border-orange-300 dark:border-orange-700 hover:border-orange-400 hover:shadow-md active:scale-[0.99]'
                        : isUnfinished && !selectionMode
                          ? 'border-blue-300 dark:border-blue-700 hover:border-blue-400 hover:shadow-md active:scale-[0.99]'
                          : selectionMode
                            ? 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                            : 'border-gray-200 dark:border-gray-700'
                  }`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-start gap-2.5 min-w-0">
                      {/* Checkbox (selection mode only) */}
                      {selectionMode && (
                        <div className={`mt-0.5 shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                          isSelected ? 'border-blue-500 bg-blue-500' : 'border-gray-300 dark:border-gray-600'
                        }`}>
                          {isSelected && (
                            <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-gray-800 dark:text-gray-100">{formatDate(group.date)}</p>
                        {group.latestFinishedTime && (
                          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                            {t('review.lastActivity', { time: formatTime(group.latestFinishedTime) })}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0 ml-2">
                      {/* Status badge */}
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full flex items-center gap-1 ${cfg.color}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                        {statusLabel(status)}
                      </span>
                      {/* Review level + interval tag */}
                      {groupState && (
                        <span className="text-xs text-gray-400 dark:text-gray-500">
                          {t('review.reviewLevel', { level: groupState.reviewLevel + 1 })} / {intervals.length}
                          {' · '}
                          <span className="text-blue-400 dark:text-blue-500 font-medium">{formatInterval(currentIntervalMs)}</span>
                        </span>
                      )}
                      {/* Edit button — hidden in selection mode */}
                      {!selectionMode && (
                        <button
                          onClick={(e) => openEdit(e, group)}
                          className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 mt-0.5 flex items-center gap-1 transition-colors"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                          {t('review.edit')}
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full mb-3">
                    <div
                      className={`h-1.5 rounded-full transition-all ${pct === 100 ? 'bg-green-400' : 'bg-blue-500'}`}
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
                        {r.min && r.max ? ` (${r.min}–${r.max})` : ''}
                      </span>
                    ))}
                  </div>

                  {status === 'SCHEDULED' && groupState?.nextReviewTime && (
                    <p className="text-xs text-green-500 dark:text-green-400 font-medium mt-2 text-right">
                      {t('review.nextReview', { time: formatRelativeTime(groupState.nextReviewTime) })}
                    </p>
                  )}
                  {isDue && (
                    <p className="text-xs text-orange-500 font-semibold mt-2 text-right">{t('review.reviewNow')}</p>
                  )}
                  {isUnfinished && (
                    <p className="text-xs text-blue-500 font-medium mt-2 text-right">{t('review.resumePrompt')}</p>
                  )}
                  {status === 'SCHEDULED' && pct === 100 && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onCardClick(group, true); }}
                      className="text-xs text-gray-400 dark:text-gray-500 font-medium mt-2 w-full text-right hover:text-blue-500 transition-colors"
                    >
                      {t('review.reviewEarly')} →
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Batch-delete action bar */}
      {selectionMode && selectedKeys.size > 0 && (
        <div className="fixed bottom-16 left-0 right-0 z-40 px-4 pb-2 pointer-events-none">
          <div className="max-w-2xl mx-auto pointer-events-auto">
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-xl px-4 py-3 flex items-center gap-3">
              <p className="flex-1 text-sm font-semibold text-gray-700 dark:text-gray-200">
                {t('review.selectedCount', { count: selectedKeys.size })}
              </p>
              <button
                onClick={exitSelectionMode}
                className="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 px-3 py-2 rounded-xl transition-colors"
              >
                {t('review.cancel')}
              </button>
              <button
                onClick={handleBatchDelete}
                disabled={batchDeleting}
                className="text-xs font-semibold px-4 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-white transition-colors disabled:opacity-50 flex items-center gap-1.5"
              >
                {batchDeleting
                  ? <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                }
                {t('review.deleteSelected')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Group Modal */}
      {editGroup && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setEditGroup(null)}>
          <div
            className="bg-white dark:bg-gray-900 rounded-t-3xl sm:rounded-3xl w-full max-w-md shadow-2xl animate-fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1 sm:hidden">
              <div className="w-10 h-1 bg-gray-200 dark:bg-gray-700 rounded-full" />
            </div>

            <div className="px-5 pt-3 pb-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">{t('review.editGroupTitle')}</h2>
                <button onClick={() => setEditGroup(null)} className="p-1.5 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Group info */}
              <div className="flex flex-wrap gap-1.5 mb-5">
                {editGroup.records.map((r) => (
                  <span key={r.type} className="text-xs bg-blue-50 dark:bg-blue-900/40 text-blue-500 dark:text-blue-400 px-2 py-0.5 rounded-md font-medium">
                    {t(`wordLists.${r.type}`, r.type)} ({r.min}–{r.max})
                  </span>
                ))}
              </div>

              {/* Level slider */}
              <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 block mb-2">
                {t('review.setLevel')} — {t('review.reviewLevel', { level: editLevel + 1 })} / {intervals.length}
                <span className="ml-2 font-normal text-blue-500">{formatInterval(intervals[Math.min(editLevel, intervals.length - 1)])}</span>
              </label>
              <input
                type="range"
                min={0}
                max={intervals.length - 1}
                value={editLevel}
                onChange={(e) => setEditLevel(Number(e.target.value))}
                className="w-full accent-blue-500 mb-1"
              />
              {/* Interval labels */}
              <div className="flex justify-between text-xs text-gray-400 mb-4">
                {intervals.map((ms, i) => (
                  <span key={i} className={i === editLevel ? 'text-blue-500 font-semibold' : ''}>{formatInterval(ms)}</span>
                ))}
              </div>

              <p className="text-xs text-gray-400 dark:text-gray-500 mb-5">
                {t('review.setLevelHint')}
              </p>

              {/* Action buttons */}
              <div className="space-y-2">
                <div className="flex gap-2">
                  <button
                    onClick={handleClearOverride}
                    disabled={editSaving}
                    className="flex-1 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
                  >
                    {t('review.clearOverride')}
                  </button>
                  <button
                    onClick={handleSaveLevel}
                    disabled={editSaving}
                    className="flex-1 py-2.5 text-sm rounded-xl bg-blue-500 hover:bg-blue-600 text-white font-semibold transition-colors disabled:opacity-50"
                  >
                    {editSaving ? '…' : t('review.saveLevel')}
                  </button>
                </div>
                <button
                  onClick={() => handleDeleteGroup(editGroup)}
                  disabled={editSaving}
                  className="w-full py-2.5 text-sm rounded-xl bg-red-50 dark:bg-red-900/20 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/40 font-medium transition-colors disabled:opacity-50"
                >
                  {editSaving ? '…' : t('review.deleteGroup')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReviewPage;
