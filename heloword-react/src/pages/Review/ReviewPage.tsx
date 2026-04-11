import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Header from '../../components/Header';
import OnboardingModal from '../../components/OnboardingModal';

const REVIEW_ONBOARDING_KEY = 'onboarding:review_card';
import { useAuth } from '../../contexts/AuthContext';
import { useUI } from '../../contexts/UIContext';
import { DueGroup, QuizSetting, Sentence, TYPE_TO_TABLE_MAP } from '../../models';
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
import { fetchCustomWords, fetchCustomGroups, fetchSharedGroups } from '../../services/customVocab.service';
import { useData } from '../../contexts/DataContext';

interface QuizGroup {
  date: Date;
  records: QuizSetting[];
  completed: number;
  total: number;
  latestFinishedTime?: Date;
}

type StatusFilter = 'ALL' | 'UNFINISHED' | 'DUE' | 'FRESH' | 'SCHEDULED';
type SortKey = 'recent' | 'level-asc' | 'level-desc' | 'progress' | 'next-review';

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

  const { dueGroups, dueCount, groupStates, refresh, refreshGuest, recompute } = useNotifications();
  const { wordStore, sentenceStore, loadFullDashboard } = useData();
  const [groups, setGroups] = useState<QuizGroup[]>([]);
  const [customGroupMap, setCustomGroupMap] = useState<Map<number, { name: string; language: string }>>(new Map());
  const [sharedGroupMap, setSharedGroupMap] = useState<Map<number, { name: string; language: string }>>(new Map());
  const [loading, setLoading] = useState(false);
  const [showAllDue, setShowAllDue] = useState(false);
  const [showReviewOnboarding, setShowReviewOnboarding] = useState(false);

  // Search + filter
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [levelFilter, setLevelFilter] = useState<number | 'ALL'>('ALL');
  const [sortKey, setSortKey] = useState<SortKey>('recent');
  const [showFilterPanel, setShowFilterPanel] = useState(false);

  // Selection mode
  const [previewLoadingKey, setPreviewLoadingKey] = useState<string | null>(null);
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
      // Sync groupStates from localStorage before rendering cards.
      // NotificationContext.refreshGuest() was last called on app mount or quiz
      // completion; if the user dropped mid-quiz, the new GuestSetting is in
      // localStorage but not yet in groupStates. Without this call the card would
      // resolve to status=undefined → default SCHEDULED → wrongly show 100%.
      refreshGuest();
      loadGuestData();
    }
  }, [isLoggedIn]); // eslint-disable-line react-hooks/exhaustive-deps

  // Recompute due statuses every minute while the page is open so that
  // cards flip from SCHEDULED → DUE without requiring a manual refresh.
  useEffect(() => {
    const id = setInterval(recompute, 60_000);
    return () => clearInterval(id);
  }, [recompute]);

  // ─── Server-side (logged in) ───────────────────────────────────────────────

  const fetchData = async () => {
    setLoading(true);
    showLoading();
    try {
      const [response, customGroupsRaw, sharedGroupsRaw] = await Promise.all([
        doPost('/frontend-api/api/fe/quiz/get-quiz-settings'),
        isLoggedIn ? fetchCustomGroups().catch(() => []) : Promise.resolve([]),
        fetchSharedGroups().catch(() => []),
      ]);
      if (response.code !== '0000' || !response.data) return;

      setCustomGroupMap(new Map(customGroupsRaw.map((g: { id: number; name: string; language: string }) => [g.id, { name: g.name, language: g.language }])));
      setSharedGroupMap(new Map(sharedGroupsRaw.map((g: { id: number; name: string; language: string }) => [g.id, { name: g.name, language: g.language }])));

      const data: Record<string, QuizSetting[]> = response.data;

      // Re-bucket all sessions by group key (type:min:max) so different ranges of
      // the same word type never get merged into one card.
      const byGroupKey: Record<string, QuizSetting[]> = {};
      for (const sessions of Object.values(data)) {
        for (const s of sessions) {
          const key = getGroupKey(s.type, s.min ?? 1, s.max ?? s.total);
          (byGroupKey[key] ??= []).push(s);
        }
      }

      const parsed: QuizGroup[] = Object.values(byGroupKey).map((sessions) => {
        // Most recent session carries the current id and finishedCount for resume.
        const sorted = [...sessions].sort(
          (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
        );
        const mostRecent = sorted[0];
        const total = (mostRecent.max ?? mostRecent.total) - (mostRecent.min ?? 1) + 1;
        const completed = sessions.reduce((acc, s) => acc + (s.finishedCount ?? 0), 0);
        const latestFinished = sessions
          .filter((s) => s.latestFinishedTime)
          .sort((a, b) => new Date(b.latestFinishedTime!).getTime() - new Date(a.latestFinishedTime!).getTime())[0]
          ?.latestFinishedTime;
        // Only pass the session id (resume marker) when the most recent session is
        // genuinely unfinished. For FRESH/DUE groups the most recent session was
        // fully completed — passing its id causes VocabularyQuizPage to reuse it,
        // which appends new records to the old session, updates latestFinishedTime
        // to now, and falsely flips the group to SCHEDULED (showing 10/10 after
        // completing just 1 word).
        const mostRecentIsUnfinished = (mostRecent.finishedCount ?? 0) < total;
        const recordForQuiz = mostRecentIsUnfinished ? mostRecent : { ...mostRecent, id: undefined };
        return {
          date: new Date(mostRecent.timestamp),
          records: [recordForQuiz],
          completed,
          total,
          latestFinishedTime: latestFinished ? new Date(latestFinished) : undefined,
        };
      });

      parsed.sort((a, b) => {
        if (a.latestFinishedTime && b.latestFinishedTime)
          return b.latestFinishedTime.getTime() - a.latestFinishedTime.getTime();
        return b.date.getTime() - a.date.getTime();
      });

      setGroups(parsed);
      if (parsed.length > 0 && !localStorage.getItem(REVIEW_ONBOARDING_KEY)) {
        setShowReviewOnboarding(true);
      }
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

    // Group by type:min:max so different ranges never merge into one card.
    const byGroupKey: Record<string, GuestSetting[]> = {};
    for (const s of settings) {
      const key = `${s.type}:${s.min}:${s.max}`;
      (byGroupKey[key] ??= []).push(s);
    }

    const parsed: QuizGroup[] = Object.values(byGroupKey).map((groupSettings) => {
      // Most recent session carries the _guestId needed for UNFINISHED resume.
      const sorted = [...groupSettings].sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
      );
      const mostRecent = sorted[0];
      let completed = 0; let latestFinishedMs = 0;
      for (const s of groupSettings) {
        const settingRecords = records.filter((r) => r.settingId === s.id);
        const correctIds = new Set(settingRecords.filter((r) => r.wrongCount === 0).map((r) => r.answerId));
        completed += correctIds.size;
        for (const r of settingRecords) {
          const ms = new Date(r.finishedTime).getTime();
          if (ms > latestFinishedMs) latestFinishedMs = ms;
        }
      }
      // Only pass _guestId (resume marker) when the most recent session is genuinely
      // unfinished. For FRESH/DUE groups the most recent session was fully completed —
      // passing its ID would cause VocabularyQuizPage to append new records to the old
      // session, which inflates finishedCount to >= rangeSize and falsely flips the
      // group to SCHEDULED (showing 10/10 after completing just 1 word).
      const rangeSize = mostRecent.max - mostRecent.min + 1;
      const mostRecentCorrectIds = new Set(
        records.filter((r) => r.settingId === mostRecent.id && r.wrongCount === 0).map((r) => r.answerId),
      );
      const mostRecentIsUnfinished = mostRecentCorrectIds.size < rangeSize;
      const record_qs: QuizSetting = {
        id: undefined,
        _guestId: mostRecentIsUnfinished ? mostRecent.id : undefined,
        timestamp: new Date(mostRecent.timestamp),
        type: mostRecent.type, tableName: mostRecent.tableName, total: mostRecent.total,
        isSelected: true, min: mostRecent.min, max: mostRecent.max,
      } as any;
      return {
        date: new Date(mostRecent.timestamp),
        records: [record_qs],
        completed,
        total: mostRecent.max - mostRecent.min + 1,
        latestFinishedTime: latestFinishedMs > 0 ? new Date(latestFinishedMs) : undefined,
      };
    });

    parsed.sort((a, b) => {
      if (a.latestFinishedTime && b.latestFinishedTime)
        return b.latestFinishedTime.getTime() - a.latestFinishedTime.getTime();
      return b.date.getTime() - a.date.getTime();
    });
    setGroups(parsed);
    if (parsed.length > 0 && !localStorage.getItem(REVIEW_ONBOARDING_KEY)) {
      setShowReviewOnboarding(true);
    }
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

  const uniqueLevels: number[] = Array.from(
    new Set(
      groups
        .map((g) => resolveGroupState(g.records)?.reviewLevel)
        .filter((l): l is number => l !== undefined),
    ),
  ).sort((a, b) => a - b);

  const filteredGroups = (() => {
    const filtered = groups.filter((g) => {
      const state = resolveGroupState(g.records);
      const status = state?.status ?? 'SCHEDULED';
      if (statusFilter !== 'ALL' && status !== statusFilter) return false;
      if (levelFilter !== 'ALL' && (state?.reviewLevel ?? 0) !== levelFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchType = g.records.some((r) =>
          formatGroupType(r.type).toLowerCase().includes(q),
        );
        const matchDate = formatDate(g.date).toLowerCase().includes(q);
        if (!matchType && !matchDate) return false;
      }
      return true;
    });

    filtered.sort((a, b) => {
      const stateA = resolveGroupState(a.records);
      const stateB = resolveGroupState(b.records);
      switch (sortKey) {
        case 'level-asc':
          return (stateA?.reviewLevel ?? 0) - (stateB?.reviewLevel ?? 0);
        case 'level-desc':
          return (stateB?.reviewLevel ?? 0) - (stateA?.reviewLevel ?? 0);
        case 'progress': {
          const pctA = a.total > 0 ? (a.completed % a.total) / a.total : 0;
          const pctB = b.total > 0 ? (b.completed % b.total) / b.total : 0;
          return pctB - pctA;
        }
        case 'next-review': {
          const getNext = (g: QuizGroup) => {
            const state = resolveGroupState(g.records);
            if (!state?.reviewLevel || !g.latestFinishedTime) return Infinity;
            const iv = intervals[Math.min(state.reviewLevel, intervals.length - 1)];
            return g.latestFinishedTime.getTime() + iv;
          };
          return getNext(a) - getNext(b);
        }
        case 'recent':
        default: {
          if (a.latestFinishedTime && b.latestFinishedTime)
            return b.latestFinishedTime.getTime() - a.latestFinishedTime.getTime();
          return b.date.getTime() - a.date.getTime();
        }
      }
    });

    return filtered;
  })();

  // ─── Navigation ───────────────────────────────────────────────────────────

  const loadCustomGroupWords = async (type: string): Promise<Sentence[]> => {
    const customMatch = type.match(/^userCustomGroup:(\d+)$/);
    if (customMatch) {
      const groupId = Number(customMatch[1]);
      const words = await fetchCustomWords(groupId);
      return words.map((w) => ({
        id: w.id,
        word: w.word,
        sentence: w.sentence || '',
        translateEn: w.translateEn,
        translateCh: w.translateCh || '',
        tableName: 'USER_CUSTOM_WORD',
        language: (customGroupMap.get(groupId)?.language === 'JA' ? 'jp' : 'en') as any,
        status: 1,
        _quizType: type,
      }));
    }
    const sharedMatch = type.match(/^sharedVocabGroup:(\d+)$/);
    if (sharedMatch) {
      const shareId = Number(sharedMatch[1]);
      const { fetchSharedGroupWords } = await import('../../services/customVocab.service');
      const words = await fetchSharedGroupWords(shareId);
      return words.map((w) => ({
        id: w.id,
        word: w.word,
        sentence: w.sentence || '',
        translateEn: w.translateEn,
        translateCh: w.translateCh || '',
        tableName: 'USER_CUSTOM_WORD',
        language: (sharedGroupMap.get(shareId)?.language === 'JA' ? 'jp' : 'en') as any,
        status: 1,
        _quizType: type,
      }));
    }
    return [];
  };

  const formatGroupType = (type: string): string => {
    if (type.startsWith('userCustomGroup:')) {
      const id = Number(type.split(':')[1]);
      return customGroupMap.get(id)?.name ?? t('userVocab.myVocabGroup', 'My Vocab');
    }
    if (type.startsWith('sharedVocabGroup:')) {
      const id = Number(type.split(':')[1]);
      return sharedGroupMap.get(id)?.name ?? t('sharedVocab.title', 'Shared Vocab');
    }
    return t(`wordLists.${type}`, type);
  };

  const handlePreview = async (e: React.MouseEvent, group: QuizGroup, key: string) => {
    e.stopPropagation();
    setPreviewLoadingKey(key);
    try {
      const isCustomGroup = group.records.some(
        (r) => r.type.startsWith('userCustomGroup:') || r.type.startsWith('sharedVocabGroup:')
      );
      let words: Sentence[] = [];
      if (isCustomGroup) {
        const arrays = await Promise.all(group.records.map((r) => loadCustomGroupWords(r.type)));
        words = arrays.flat();
      } else {
        const { words: ws, sentences: ss } = await loadFullDashboard();
        const combined: Record<string, Sentence[]> = { ...ws, ...ss } as any;
        group.records.forEach((r) => {
          const list = combined[r.type];
          if (!list) return;
          const min = (r.min ?? 1) - 1;
          const max = r.max ?? list.length;
          words = [...words, ...list.slice(min, max)];
        });
      }
      const isGroupType = (type: string) => type.startsWith('userCustomGroup:') || type.startsWith('sharedVocabGroup:');
      const groupName = group.records.map((r) => formatGroupType(r.type) + (r.min && r.max && !isGroupType(r.type) ? ` (${r.min}–${r.max})` : '')).join(', ');
      navigate('/review/preview', { state: { words, groupName } });
    } finally {
      setPreviewLoadingKey(null);
    }
  };

  const handleCardClick = async (group: QuizGroup, forceNewSession = false) => {
    const state = resolveGroupState(group.records);
    const isDue = state && (state.status === 'DUE' || state.status === 'FRESH');
    const isCustomGroup = group.records.some(
      (r) => r.type.startsWith('userCustomGroup:') || r.type.startsWith('sharedVocabGroup:')
    );

    if (isDue || forceNewSession) {
      const quizSettings: Record<string, QuizSetting> = {};
      group.records.forEach((s) => {
        quizSettings[s.type] = { ...s, timestamp: new Date(), tableName: TYPE_TO_TABLE_MAP[s.type] || s.tableName };
      });
      if (isCustomGroup) {
        showLoading();
        try {
          const customWordArrays = await Promise.all(group.records.map((r) => loadCustomGroupWords(r.type)));
          const preloadedWords = customWordArrays.flat();
          navigate('/vocabulary/quiz', { state: { quizSettings, preloadedWords } });
        } finally {
          hideLoading();
        }
        return;
      }
      navigate('/vocabulary/quiz', { state: { quizSettings } });
      return;
    }

    const settingIds = group.records.map((s) => s.id).filter(Boolean);
    showLoading();
    try {
      const [response, ...customWordArrays] = await Promise.all([
        doPost('/frontend-api/api/fe/quiz/get-record-ids-by-setting-ids', settingIds),
        ...(isCustomGroup ? group.records.map((r) => loadCustomGroupWords(r.type)) : []),
      ]);
      const quizSettings: Record<string, QuizSetting> = {};
      group.records.forEach((s) => {
        quizSettings[s.type] = { ...s, timestamp: new Date(), tableName: TYPE_TO_TABLE_MAP[s.type] || s.tableName };
      });
      const preloadedWords = isCustomGroup ? customWordArrays.flat() : undefined;
      navigate('/vocabulary/quiz', { state: { quizSettings, finishedIdMap: response.data, ...(preloadedWords ? { preloadedWords } : {}) } });
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

    const customGroupTypes = dueGroups.filter((g) => g.type.startsWith('userCustomGroup:'));
    showLoading();
    try {
      const [finishedRes, ...customWordArrays] = await Promise.all([
        unfinishedSettingIds.length > 0
          ? doPost('/frontend-api/api/fe/quiz/get-record-ids-by-setting-ids', unfinishedSettingIds)
          : Promise.resolve({ data: {} }),
        ...customGroupTypes.map((g) => loadCustomGroupWords(g.type)),
      ]);
      const preloadedWords = customWordArrays.flat();
      navigate('/vocabulary/quiz', {
        state: {
          quizSettings,
          ...(unfinishedSettingIds.length > 0 ? { finishedIdMap: finishedRes.data } : {}),
          ...(preloadedWords.length > 0 ? { preloadedWords } : {}),
        },
      });
    } finally {
      hideLoading();
    }
  };

  const onCardClick = (group: QuizGroup, forceNewSession?: boolean) =>
    isLoggedIn ? handleCardClick(group, forceNewSession) : handleGuestCardClick(group, forceNewSession);

  const handleTagClick = (g: DueGroup) => {
    const match = groups.find((grp) =>
      grp.records.some(
        (r) => r.type === g.type && (r.min ?? 1) === g.min && (r.max ?? r.total) === g.max,
      ),
    );
    if (match) onCardClick(match);
  };

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

  const groupKey = (g: QuizGroup) => {
    const r = g.records[0];
    return getGroupKey(r.type, r.min ?? 1, r.max ?? r.total);
  };

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

  const sortOptions: { key: SortKey; label: string }[] = [
    { key: 'recent',      label: t('review.sortRecent') },
    { key: 'level-asc',   label: t('review.sortLevelAsc') },
    { key: 'level-desc',  label: t('review.sortLevelDesc') },
    { key: 'progress',    label: t('review.sortProgress') },
    { key: 'next-review', label: t('review.sortNextReview') },
  ];

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 dark:bg-gray-900 animate-page-enter">
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
            <div className="flex flex-wrap gap-1.5">
              {(showAllDue ? dueGroups : dueGroups.slice(0, 6)).map((g) => {
                const cfg = STATUS_CONFIG[g.status];
                return (
                  <button
                    key={g.groupKey}
                    onClick={() => handleTagClick(g)}
                    className={`text-xs px-2 py-0.5 rounded-lg font-medium flex items-center gap-1 cursor-pointer transition-opacity hover:opacity-75 active:scale-95 ${cfg.color}`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                    {formatGroupType(g.type)} {g.min}–{g.max}
                    {' '}<span className="opacity-60">L{g.reviewLevel}</span>
                  </button>
                );
              })}
              {!showAllDue && dueCount > 6 && (
                <span className="text-xs text-orange-400 px-2 py-0.5">{t('review.moreItems', { count: dueCount - 6 })}</span>
              )}
            </div>
          </div>
        )}

        {/* Search + filter bar */}
        {groups.length > 0 && (() => {
          const activeFilterCount = (statusFilter !== 'ALL' ? 1 : 0) + (levelFilter !== 'ALL' ? 1 : 0) + (sortKey !== 'recent' ? 1 : 0);
          return (
            <div className="mb-4 space-y-2">
              {/* Top row: search + filter toggle + select */}
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
                {/* Filter toggle button */}
                <button
                  onClick={() => setShowFilterPanel((v) => !v)}
                  className={`relative shrink-0 flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl border font-medium transition-colors ${
                    showFilterPanel || activeFilterCount > 0
                      ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                      : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                  }`}
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h18M6 12h12M10 20h4" />
                  </svg>
                  {activeFilterCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-blue-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                      {activeFilterCount}
                    </span>
                  )}
                </button>
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

              {/* Expandable filter panel */}
              {showFilterPanel && (
                <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-3 space-y-3 animate-slide-down">
                  {/* Sort */}
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1.5">{t('review.sortLabel')}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {sortOptions.map(({ key, label }) => (
                        <button
                          key={key}
                          onClick={() => setSortKey(key)}
                          className={`text-xs px-3 py-1 rounded-full font-medium transition-colors ${
                            sortKey === key
                              ? 'bg-gray-800 dark:bg-gray-100 text-white dark:text-gray-900'
                              : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* Status */}
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1.5">{t('review.statusLabel')}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {filterButtons.map(({ key, label }) => (
                        <button
                          key={key}
                          onClick={() => setStatusFilter(key)}
                          className={`text-xs px-3 py-1 rounded-full font-medium transition-colors ${
                            statusFilter === key
                              ? 'bg-blue-500 text-white'
                              : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* Level (only when multiple levels exist) */}
                  {uniqueLevels.length > 1 && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1.5">{t('review.levelLabel')}</p>
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          onClick={() => setLevelFilter('ALL')}
                          className={`text-xs px-3 py-1 rounded-full font-medium transition-colors ${
                            levelFilter === 'ALL'
                              ? 'bg-purple-500 text-white'
                              : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                          }`}
                        >
                          {t('review.allLevels')}
                        </button>
                        {uniqueLevels.map((level) => (
                          <button
                            key={level}
                            onClick={() => setLevelFilter(level)}
                            className={`text-xs px-3 py-1 rounded-full font-medium transition-colors ${
                              levelFilter === level
                                ? 'bg-purple-500 text-white'
                                : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                            }`}
                          >
                            {t('review.reviewLevel', { level: level + 1 })}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* Reset link */}
                  {activeFilterCount > 0 && (
                    <button
                      onClick={() => { setStatusFilter('ALL'); setLevelFilter('ALL'); setSortKey('recent'); }}
                      className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 underline underline-offset-2"
                    >
                      {t('review.resetFilters')}
                    </button>
                  )}
                </div>
              )}

              {/* Active filter summary chips (collapsed state) */}
              {!showFilterPanel && (statusFilter !== 'ALL' || levelFilter !== 'ALL' || selectionMode) && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  {statusFilter !== 'ALL' && (
                    <span className="inline-flex items-center gap-1 text-xs bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded-full border border-blue-200 dark:border-blue-700">
                      {filterButtons.find((b) => b.key === statusFilter)?.label}
                      <button onClick={() => setStatusFilter('ALL')} className="opacity-60 hover:opacity-100 leading-none">×</button>
                    </span>
                  )}
                  {levelFilter !== 'ALL' && (
                    <span className="inline-flex items-center gap-1 text-xs bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 px-2 py-0.5 rounded-full border border-purple-200 dark:border-purple-700">
                      {t('review.reviewLevel', { level: (levelFilter as number) + 1 })}
                      <button onClick={() => setLevelFilter('ALL')} className="opacity-60 hover:opacity-100 leading-none">×</button>
                    </span>
                  )}
                  {selectionMode && filteredGroups.length > 0 && (
                    <button
                      onClick={toggleSelectAll}
                      className="text-xs text-blue-500 dark:text-blue-400 font-medium ml-auto"
                    >
                      {selectedKeys.size === filteredGroups.length ? t('review.deselectAll') : t('review.selectAll')}
                    </button>
                  )}
                </div>
              )}
              {/* Select all when filter panel is open */}
              {showFilterPanel && selectionMode && filteredGroups.length > 0 && (
                <button
                  onClick={toggleSelectAll}
                  className="text-xs text-blue-500 dark:text-blue-400 font-medium"
                >
                  {selectedKeys.size === filteredGroups.length ? t('review.deselectAll') : t('review.selectAll')}
                </button>
              )}
            </div>
          );
        })()}

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
              const groupState = resolveGroupState(group.records);
              const status = groupState?.status ?? 'SCHEDULED';
              // finishedCount accumulates across all review cycles, so use modulo to get
              // the current cycle's progress. SCHEDULED means just completed → show full.
              // FRESH means the grace window was missed; by definition the most recent session
              // is fully complete, so any non-zero cycleCompleted is stale data — always 0.
              const cycleCompleted = group.total > 0 ? group.completed % group.total : 0;
              const displayCompleted = status === 'SCHEDULED' ? group.total
                : status === 'FRESH' ? 0
                : cycleCompleted;
              const pct = group.total > 0 ? Math.round((displayCompleted / group.total) * 100) : 0;
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
                  onClick={() => selectionMode && toggleSelect(key)}
                  className={`bg-white dark:bg-gray-800 rounded-2xl border-2 p-4 transition-all shadow-md hover:shadow-lg hover:-translate-y-0.5 animate-fade-in-up ${
                    selectionMode ? 'cursor-pointer' : 'cursor-default'
                  } ${
                    isSelected
                      ? 'border-blue-500 dark:border-blue-500 bg-blue-50 dark:bg-blue-900/10'
                      : isDue && !selectionMode
                        ? 'border-orange-300 dark:border-orange-700'
                        : isUnfinished && !selectionMode
                          ? 'border-blue-300 dark:border-blue-700'
                          : selectionMode
                            ? 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                            : 'border-gray-200 dark:border-gray-700'
                  }`}
                  style={{ animationDelay: `${Math.min(i, 8) * 50}ms` }}
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
                    {t('review.completionRatio', { completed: displayCompleted, total: group.total })}
                  </p>

                  <div className="flex flex-wrap gap-1.5">
                    {group.records.map((r) => (
                      <span key={r.type} className="text-xs bg-blue-50 dark:bg-blue-900/40 text-blue-500 dark:text-blue-400 px-2 py-0.5 rounded-md font-medium">
                        {formatGroupType(r.type)}
                        {r.min && r.max && !r.type.startsWith('userCustomGroup:') && !r.type.startsWith('sharedVocabGroup:') ? ` (${r.min}–${r.max})` : ''}
                      </span>
                    ))}
                  </div>

                  {!selectionMode && (
                    <div className="mt-2 flex items-center justify-between">
                      {/* Preview — always on the left */}
                      <button
                        onClick={(e) => handlePreview(e, group, key)}
                        disabled={previewLoadingKey === key}
                        className="text-xs font-semibold text-indigo-600 dark:text-indigo-300 bg-indigo-100 dark:bg-indigo-800/60 hover:bg-indigo-200 dark:hover:bg-indigo-700/70 border border-indigo-200 dark:border-indigo-700 disabled:opacity-40 transition-colors flex items-center gap-1 px-2.5 py-1 rounded-full"
                      >
                        {previewLoadingKey === key ? (
                          <span className="animate-pulse">…</span>
                        ) : (
                          <>
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                            {t('review.preview', '先預習')}
                          </>
                        )}
                      </button>

                      {/* Right-side status action */}
                      {status === 'SCHEDULED' && groupState?.nextReviewTime && (
                        <p className="text-xs text-green-500 dark:text-green-400 font-medium">
                          {t('review.nextReview', { time: formatRelativeTime(groupState.nextReviewTime) })}
                        </p>
                      )}
                      {isDue && (
                        <button
                          onClick={(e) => { e.stopPropagation(); onCardClick(group); }}
                          className="text-xs font-semibold text-orange-600 dark:text-orange-300 bg-orange-100 dark:bg-orange-800/60 hover:bg-orange-200 dark:hover:bg-orange-700/70 border border-orange-200 dark:border-orange-700 transition-colors px-2.5 py-1 rounded-full"
                        >
                          {t('review.reviewNow')}
                        </button>
                      )}
                      {isUnfinished && (
                        <button
                          onClick={(e) => { e.stopPropagation(); onCardClick(group); }}
                          className="text-xs font-semibold text-blue-600 dark:text-blue-300 bg-blue-100 dark:bg-blue-800/60 hover:bg-blue-200 dark:hover:bg-blue-700/70 border border-blue-200 dark:border-blue-700 transition-colors px-2.5 py-1 rounded-full"
                        >
                          {t('review.resumePrompt')}
                        </button>
                      )}
                      {status === 'SCHEDULED' && pct === 100 && (
                        <button
                          onClick={(e) => { e.stopPropagation(); onCardClick(group, true); }}
                          className="text-xs font-semibold text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 border border-gray-200 dark:border-gray-600 hover:text-blue-500 transition-colors px-2.5 py-1 rounded-full"
                        >
                          {t('review.reviewEarly')}
                        </button>
                      )}
                    </div>
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
      {editGroup && ReactDOM.createPortal(
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
                    {formatGroupType(r.type)}{!r.type.startsWith('userCustomGroup:') && !r.type.startsWith('sharedVocabGroup:') ? ` (${r.min}–${r.max})` : ''}
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
        </div>,
        document.body
      )}

      {showReviewOnboarding && (() => {
        const raw = t('onboarding.reviewCard', { returnObjects: true });
        if (!Array.isArray(raw)) return null;
        const steps = (raw as any[]).map((s: any) => ({
          icon: s.icon,
          iconBg: 'bg-green-50 dark:bg-green-900/20',
          title: s.title,
          body: s.body,
        }));
        const dismiss = () => {
          localStorage.setItem(REVIEW_ONBOARDING_KEY, '1');
          setShowReviewOnboarding(false);
        };
        return <OnboardingModal steps={steps} onDone={dismiss} onSkip={dismiss} />;
      })()}
    </div>
  );
};

export default ReviewPage;
