import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Sheet } from '../../components/ui/practice';
import Header from '../../components/Header';
import OnboardingModal from '../../components/OnboardingModal';

const REVIEW_ONBOARDING_KEY = 'onboarding:review_card';
import { useAuth } from '../../contexts/AuthContext';
import { useUI } from '../../contexts/UIContext';
import { DueGroup, QuizMode, QuizSetting, Sentence, TYPE_TO_TABLE_MAP } from '../../models';
import QuizModeModal from '../../components/QuizModeModal';
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
  /** Correct answers in the most recent session — the progress of the cycle in flight. */
  currentCompleted: number;
  total: number;
  latestFinishedTime?: Date;
}

type StatusFilter = 'ALL' | 'UNFINISHED' | 'DUE' | 'FRESH' | 'SCHEDULED';
type SortKey = 'recent' | 'level-asc' | 'level-desc' | 'progress' | 'next-review';

const STATUS_CONFIG = {
  UNFINISHED: { color: 'bg-accent-soft text-accent',    dot: 'bg-ink' },
  DUE:        { color: 'bg-accent-soft text-accent', dot: 'bg-ink' },
  FRESH:      { color: 'bg-danger-soft text-danger',         dot: 'bg-danger' },
  SCHEDULED:  { color: 'bg-success-soft text-success', dot: 'bg-success' },
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

  const [modePicker, setModePicker] = useState<{ wordCount: number; run: (mode: QuizMode) => void } | null>(null);

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
          currentCompleted: Math.min(mostRecent.finishedCount ?? 0, total),
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
        currentCompleted: Math.min(mostRecentCorrectIds.size, rangeSize),
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
    const state = states.sort((a, b) => order[a.status] - order[b.status])[0];
    // A stored level can exceed the interval list if the user later shortened their
    // custom intervals — clamp so labels, filters and the edit slider stay in range.
    return { ...state, reviewLevel: Math.min(state.reviewLevel, intervals.length - 1) };
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
          const pctA = a.total > 0 ? a.currentCompleted / a.total : 0;
          const pctB = b.total > 0 ? b.currentCompleted / b.total : 0;
          return pctB - pctA;
        }
        case 'next-review': {
          // Use the engine's due time (it accounts for level overrides); groups that
          // need attention now sort first, groups that were never completed last.
          // (Was `!state?.reviewLevel` → every level-1 group, level index 0, sorted as "never".)
          const getNext = (g: QuizGroup) => {
            const state = resolveGroupState(g.records);
            if (!state) return Infinity;
            if (state.status !== 'SCHEDULED') return -Infinity;
            return state.nextReviewTime?.getTime() ?? Infinity;
          };
          const na = getNext(a), nb = getNext(b);
          return na === nb ? 0 : na < nb ? -1 : 1;
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

  const handleCardClick = async (group: QuizGroup, forceNewSession = false, quizMode: QuizMode = 'spelling') => {
    const state = resolveGroupState(group.records);
    const isDue = state && (state.status === 'DUE' || state.status === 'FRESH');
    const isCustomGroup = group.records.some(
      (r) => r.type.startsWith('userCustomGroup:') || r.type.startsWith('sharedVocabGroup:')
    );

    if (isDue || forceNewSession) {
      // A review always starts a NEW session. Drop the record's id: if the group's
      // latest session is an unfinished one that predates a level override, keeping
      // its id would make the quiz append answers to that superseded session and the
      // review would never register.
      const quizSettings: Record<string, QuizSetting> = {};
      group.records.forEach((s) => {
        quizSettings[s.type] = { ...s, id: undefined, timestamp: new Date(), tableName: TYPE_TO_TABLE_MAP[s.type] || s.tableName };
      });
      if (isCustomGroup) {
        showLoading();
        try {
          const customWordArrays = await Promise.all(group.records.map((r) => loadCustomGroupWords(r.type)));
          const preloadedWords = customWordArrays.flat();
          navigate('/vocabulary/quiz', { state: { quizSettings, preloadedWords, quizMode } });
        } finally {
          hideLoading();
        }
        return;
      }
      navigate('/vocabulary/quiz', { state: { quizSettings, quizMode } });
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
      navigate('/vocabulary/quiz', { state: { quizSettings, finishedIdMap: response.data, ...(preloadedWords ? { preloadedWords } : {}), quizMode } });
    } finally {
      hideLoading();
    }
  };

  const handleGuestCardClick = (group: QuizGroup, forceNewSession = false, quizMode: QuizMode = 'spelling') => {
    const state = resolveGroupState(group.records);
    const isDue = state && (state.status === 'DUE' || state.status === 'FRESH');

    if (isDue || forceNewSession) {
      // New session — never resume via _guestId (see handleCardClick).
      const quizSettings: Record<string, QuizSetting> = {};
      group.records.forEach((s: any) => {
        quizSettings[s.type] = { ...s, _guestId: undefined, timestamp: new Date(), tableName: TYPE_TO_TABLE_MAP[s.type] || s.tableName };
      });
      navigate('/vocabulary/quiz', { state: { quizSettings, quizMode } });
      return;
    }

    const quizSettings: Record<string, QuizSetting> = {};
    const finishedIdMap: Record<string, number[]> = {};
    group.records.forEach((s: any) => {
      quizSettings[s.type] = { ...s, timestamp: new Date(), tableName: TYPE_TO_TABLE_MAP[s.type] || s.tableName };
      if (s._guestId) finishedIdMap[s._guestId] = getFinishedIdsBySetting(s._guestId);
    });
    navigate('/vocabulary/quiz', { state: { quizSettings, finishedIdMap, quizMode } });
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

  // Every launch goes through the mode picker; the chosen mode is threaded into
  // the quiz page's navigation state.
  const onCardClick = (group: QuizGroup, forceNewSession?: boolean) =>
    setModePicker({
      wordCount: group.total,
      run: (mode) =>
        isLoggedIn
          ? handleCardClick(group, forceNewSession, mode)
          : handleGuestCardClick(group, forceNewSession, mode),
    });

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
    <div className="flex flex-col min-h-screen bg-paper animate-page-enter">
      <Header title={t('nav.review')} />

      <main className="flex-1 pb-20 px-4 pt-4 max-w-2xl mx-auto w-full">

        {/* Guest upsell banner */}
        {!isLoggedIn && (
          <div
            onClick={() => navigate('/login')}
            className="flex items-center gap-3 rounded-md border border-line bg-surface px-3 py-2.5 mb-4 cursor-pointer hover:border-ink/30 transition-colors"
          >
            <svg className="w-4 h-4 text-ink-faint shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-xs text-ink-muted flex-1">
              {t('review.guestBanner')} <span className="text-ink underline underline-offset-2">{t('common.login')}</span>
            </p>
          </div>
        )}

        {/* Due-for-review section */}
        {dueCount > 0 && (
          <div className="border-y border-line py-4 mb-5">
            <div className="flex items-baseline justify-between mb-1">
              <div className="flex items-baseline gap-3">
                <span className="font-serif text-3xl leading-none text-accent tabular-nums">{dueCount > 99 ? '99+' : dueCount}</span>
                <h3 className="text-sm text-ink">{t('review.dueForReview')}</h3>
              </div>
              {dueCount > 6 && (
                <button onClick={() => setShowAllDue((v) => !v)} className="text-xs text-ink-muted hover:text-ink">
                  {showAllDue ? t('review.hide') : t('review.showAll')}
                </button>
              )}
            </div>
            <p className="text-xs text-ink-muted mb-3">{t('review.dueDescription')}</p>
            <div className="flex flex-wrap gap-1.5">
              {(showAllDue ? dueGroups : dueGroups.slice(0, 6)).map((g) => {
                const cfg = STATUS_CONFIG[g.status];
                return (
                  <button
                    key={g.groupKey}
                    onClick={() => handleTagClick(g)}
                    className="text-xs px-2.5 py-1 rounded-md border border-line bg-surface text-ink flex items-center gap-1.5 hover:border-ink/30 transition-colors"
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                    {formatGroupType(g.type)} {g.min}–{g.max}
                    {' '}<span className="text-ink-faint">L{Math.min(g.reviewLevel, intervals.length - 1) + 1}</span>
                  </button>
                );
              })}
              {!showAllDue && dueCount > 6 && (
                <span className="text-xs text-ink-faint px-2 py-1">{t('review.moreItems', { count: dueCount - 6 })}</span>
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
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-faint" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={t('review.searchPlaceholder')}
                    className="w-full pl-9 pr-4 py-2 text-sm bg-surface border border-line rounded-xl focus:outline-none focus:ring-2 focus:ring-accent text-ink placeholder-ink-faint"
                  />
                  {searchQuery && (
                    <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink-muted">×</button>
                  )}
                </div>
                {/* Filter toggle button */}
                <button
                  onClick={() => setShowFilterPanel(true)}
                  className={`relative shrink-0 flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl border font-medium transition-colors ${
                    showFilterPanel || activeFilterCount > 0
                      ? 'border-ink/40 text-ink '
                      : 'border-line text-ink-muted hover:text-ink '
                  }`}
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h18M6 12h12M10 20h4" />
                  </svg>
                  {activeFilterCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-ink text-paper text-[10px] font-semibold rounded-full flex items-center justify-center">
                      {activeFilterCount}
                    </span>
                  )}
                </button>
                {/* Select mode toggle */}
                {!selectionMode ? (
                  <button
                    onClick={() => setSelectionMode(true)}
                    className="shrink-0 text-xs px-3 py-2 rounded-xl border border-line text-ink-muted hover:bg-ink/5 font-medium transition-colors"
                  >
                    {t('review.select')}
                  </button>
                ) : (
                  <button
                    onClick={exitSelectionMode}
                    className="shrink-0 text-xs px-3 py-2 rounded-xl border border-line text-ink-muted hover:bg-ink/5 font-medium transition-colors"
                  >
                    {t('review.cancel')}
                  </button>
                )}
              </div>

              {/* Filter sheet */}
              <Sheet title={t('common.filters')} open={showFilterPanel} onClose={() => setShowFilterPanel(false)}>
                <div className="space-y-5">
                  {/* Sort */}
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-label text-ink-faint mb-2">{t('review.sortLabel')}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {sortOptions.map(({ key, label }) => (
                        <button
                          key={key}
                          onClick={() => setSortKey(key)}
                          className={`text-xs px-3 py-1 rounded-md border transition-colors ${
                            sortKey === key
                              ? 'border-ink bg-ink/5 text-ink'
                              : 'border-line text-ink-faint hover:text-ink-muted'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* Status */}
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-label text-ink-faint mb-2">{t('review.statusLabel')}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {filterButtons.map(({ key, label }) => (
                        <button
                          key={key}
                          onClick={() => setStatusFilter(key)}
                          className={`text-xs px-3 py-1 rounded-md border transition-colors ${
                            statusFilter === key
                              ? 'border-ink bg-ink/5 text-ink'
                              : 'border-line text-ink-faint hover:text-ink-muted'
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
                      <p className="text-[10px] font-medium uppercase tracking-label text-ink-faint mb-2">{t('review.levelLabel')}</p>
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          onClick={() => setLevelFilter('ALL')}
                          className={`text-xs px-3 py-1 rounded-md border transition-colors ${
                            levelFilter === 'ALL'
                              ? 'border-ink bg-ink/5 text-ink'
                              : 'border-line text-ink-faint hover:text-ink-muted'
                          }`}
                        >
                          {t('review.allLevels')}
                        </button>
                        {uniqueLevels.map((level) => (
                          <button
                            key={level}
                            onClick={() => setLevelFilter(level)}
                            className={`text-xs px-3 py-1 rounded-md border transition-colors ${
                              levelFilter === level
                                ? 'border-ink bg-ink/5 text-ink'
                                : 'border-line text-ink-faint hover:text-ink-muted'
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
                      className="text-xs text-ink-faint hover:text-ink-muted underline underline-offset-2"
                    >
                      {t('review.resetFilters')}
                    </button>
                  )}
                </div>
              </Sheet>

              {/* Active filter summary chips (collapsed state) */}
              {(statusFilter !== 'ALL' || levelFilter !== 'ALL' || selectionMode) && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  {statusFilter !== 'ALL' && (
                    <span className="inline-flex items-center gap-1 text-xs bg-accent-soft text-accent px-2 py-0.5 rounded-full border border-line">
                      {filterButtons.find((b) => b.key === statusFilter)?.label}
                      <button onClick={() => setStatusFilter('ALL')} className="opacity-60 hover:opacity-100 leading-none">×</button>
                    </span>
                  )}
                  {levelFilter !== 'ALL' && (
                    <span className="inline-flex items-center gap-1 text-xs bg-accent-soft text-accent px-2 py-0.5 rounded-full border border-line">
                      {t('review.reviewLevel', { level: (levelFilter as number) + 1 })}
                      <button onClick={() => setLevelFilter('ALL')} className="opacity-60 hover:opacity-100 leading-none">×</button>
                    </span>
                  )}
                  {selectionMode && filteredGroups.length > 0 && (
                    <button
                      onClick={toggleSelectAll}
                      className="text-xs text-accent font-medium ml-auto"
                    >
                      {selectedKeys.size === filteredGroups.length ? t('review.deselectAll') : t('review.selectAll')}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })()}

        {loading && (
          <div className="text-center py-12">
            <div className="w-8 h-8 border-4 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-ink-faint">{t('review.loading')}</p>
          </div>
        )}

        {!loading && groups.length === 0 && (
          <div className="text-center py-16 flex flex-col items-center gap-4">
            <p className="text-ink-faint text-sm">{t('review.empty')}</p>
            <button
              onClick={() => navigate('/vocabulary')}
              className="px-5 py-2.5 bg-ink hover:bg-ink/85 text-paper text-sm font-semibold rounded-2xl transition-colors"
            >
              {t('review.goConfigureGroups')}
            </button>
          </div>
        )}

        {!loading && filteredGroups.length === 0 && groups.length > 0 && (
          <div className="text-center py-10">
            <p className="text-ink-faint text-sm">{t('review.noResults')}</p>
          </div>
        )}

        {!loading && filteredGroups.length > 0 && (
          <div className="space-y-2.5" style={{ paddingBottom: selectionMode && selectedKeys.size > 0 ? '5rem' : undefined }}>
            {filteredGroups.map((group, i) => {
              const groupState = resolveGroupState(group.records);
              const status = groupState?.status ?? 'SCHEDULED';
              // Progress of the current cycle: a just-finished cycle (SCHEDULED) is full,
              // a due/forgotten group starts a fresh cycle at 0, and an in-flight cycle
              // shows the most recent session's own count. (Summing every session and
              // taking `% total` broke as soon as any earlier session was abandoned.)
              const displayCompleted = status === 'SCHEDULED' ? group.total
                : status === 'UNFINISHED' ? group.currentCompleted
                : 0;
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
                  className={`bg-surface rounded-md border p-4 transition-colors animate-fade-in-up ${
                    selectionMode ? 'cursor-pointer' : 'cursor-default'
                  } ${
                    isSelected
                      ? 'border-accent bg-accent-soft '
                      : isDue && !selectionMode
                        ? 'border-accent/30 '
                        : isUnfinished && !selectionMode
                          ? 'border-line '
                          : selectionMode
                            ? 'border-line hover:border-line '
                            : 'border-line '
                  }`}
                  style={{ animationDelay: `${Math.min(i, 8) * 50}ms` }}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-start gap-2.5 min-w-0">
                      {/* Checkbox (selection mode only) */}
                      {selectionMode && (
                        <div className={`mt-0.5 shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                          isSelected ? 'border-accent bg-ink' : 'border-line '
                        }`}>
                          {isSelected && (
                            <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-ink">{formatDate(group.date)}</p>
                        {group.latestFinishedTime && (
                          <p className="text-xs text-ink-faint mt-0.5">
                            {t('review.lastActivity', { time: formatTime(group.latestFinishedTime) })}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0 ml-2">
                      {/* Status badge */}
                      <span className="text-xs text-ink-muted flex items-center gap-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                        {statusLabel(status)}
                      </span>
                      {/* Review level + interval tag */}
                      {groupState && (
                        <span className="text-xs text-ink-faint">
                          {t('review.reviewLevel', { level: groupState.reviewLevel + 1 })} / {intervals.length}
                          {' · '}
                          <span className="text-accent font-medium">{formatInterval(currentIntervalMs)}</span>
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="h-[3px] bg-ink/10 rounded-full mb-2">
                    <div
                      className={`h-[3px] rounded-full transition-all ${pct === 100 ? 'bg-success' : 'bg-ink'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>

                  <p className="text-xs text-ink-muted mb-2">
                    {t('review.completionRatio', { completed: displayCompleted, total: group.total })}
                  </p>

                  <p className="text-xs text-ink-faint leading-relaxed">
                    {group.records.map((r) => (
                      formatGroupType(r.type)
                      + (r.min && r.max && !r.type.startsWith('userCustomGroup:') && !r.type.startsWith('sharedVocabGroup:') ? ` ${r.min}–${r.max}` : '')
                    )).join(' · ')}
                  </p>

                  {!selectionMode && (
                    <div className="mt-3 pt-3 border-t border-line flex items-center gap-4">
                      <button
                        onClick={(e) => handlePreview(e, group, key)}
                        disabled={previewLoadingKey === key}
                        className="text-xs text-ink-muted hover:text-ink disabled:opacity-40 transition-colors"
                      >
                        {previewLoadingKey === key ? <span className="animate-pulse">…</span> : t('review.preview', '先預習')}
                      </button>
                      <button
                        onClick={(e) => openEdit(e, group)}
                        className="text-xs text-ink-muted hover:text-ink transition-colors"
                      >
                        {t('review.edit')}
                      </button>

                      <div className="ml-auto flex items-center gap-3">
                        {status === 'SCHEDULED' && groupState?.nextReviewTime && (
                          <span className="text-xs text-ink-faint">
                            {t('review.nextReview', { time: formatRelativeTime(groupState.nextReviewTime) })}
                          </span>
                        )}
                        {(isDue || isUnfinished) && (
                          <button
                            onClick={(e) => { e.stopPropagation(); onCardClick(group); }}
                            className="h-8 px-3.5 rounded-md bg-ink hover:bg-ink/85 text-paper text-xs font-medium transition-colors"
                          >
                            {isDue ? t('review.reviewNow') : t('review.resumePrompt')}
                          </button>
                        )}
                        {status === 'SCHEDULED' && pct === 100 && (
                          <button
                            onClick={(e) => { e.stopPropagation(); onCardClick(group, true); }}
                            className="h-8 px-3 rounded-md border border-line text-xs text-ink-muted hover:text-ink hover:border-ink/30 transition-colors"
                          >
                            {t('review.reviewEarly')}
                          </button>
                        )}
                      </div>
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
            <div className="bg-surface border border-line rounded-2xl shadow-xl px-4 py-3 flex items-center gap-3">
              <p className="flex-1 text-sm font-semibold text-ink">
                {t('review.selectedCount', { count: selectedKeys.size })}
              </p>
              <button
                onClick={exitSelectionMode}
                className="text-xs text-ink-faint hover:text-ink-muted px-3 py-2 rounded-xl transition-colors"
              >
                {t('review.cancel')}
              </button>
              <button
                onClick={handleBatchDelete}
                disabled={batchDeleting}
                className="text-xs font-semibold px-4 py-2 rounded-xl bg-danger hover:bg-danger/90 text-white transition-colors disabled:opacity-50 flex items-center gap-1.5"
              >
                {batchDeleting
                  ? <span className="w-3.5 h-3.5 border-2 border-line border-t-transparent rounded-full animate-spin" />
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
            className="bg-surface rounded-t-3xl sm:rounded-3xl w-full max-w-md shadow-2xl animate-fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1 sm:hidden">
              <div className="w-10 h-1 bg-ink/10 rounded-full" />
            </div>

            <div className="px-5 pt-3 pb-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-semibold text-ink">{t('review.editGroupTitle')}</h2>
                <button onClick={() => setEditGroup(null)} className="p-1.5 rounded-xl hover:bg-ink/5 transition-colors">
                  <svg className="w-5 h-5 text-ink-faint" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Group info */}
              <div className="flex flex-wrap gap-1.5 mb-5">
                {editGroup.records.map((r) => (
                  <span key={r.type} className="text-xs bg-accent-soft text-accent px-2 py-0.5 rounded-md font-medium">
                    {formatGroupType(r.type)}{!r.type.startsWith('userCustomGroup:') && !r.type.startsWith('sharedVocabGroup:') ? ` (${r.min}–${r.max})` : ''}
                  </span>
                ))}
              </div>

              {/* Level slider */}
              <label className="text-xs font-semibold text-ink block mb-2">
                {t('review.setLevel')} — {t('review.reviewLevel', { level: editLevel + 1 })} / {intervals.length}
                <span className="ml-2 font-normal text-accent">{formatInterval(intervals[Math.min(editLevel, intervals.length - 1)])}</span>
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
              <div className="flex justify-between text-xs text-ink-faint mb-4">
                {intervals.map((ms, i) => (
                  <span key={i} className={i === editLevel ? 'text-accent font-semibold' : ''}>{formatInterval(ms)}</span>
                ))}
              </div>

              <p className="text-xs text-ink-faint mb-5">
                {t('review.setLevelHint')}
              </p>

              {/* Action buttons */}
              <div className="space-y-2">
                <div className="flex gap-2">
                  <button
                    onClick={handleClearOverride}
                    disabled={editSaving}
                    className="flex-1 py-2.5 text-sm rounded-xl border border-line text-ink-muted hover:bg-paper transition-colors disabled:opacity-50"
                  >
                    {t('review.clearOverride')}
                  </button>
                  <button
                    onClick={handleSaveLevel}
                    disabled={editSaving}
                    className="flex-1 py-2.5 text-sm rounded-xl bg-ink hover:bg-ink/85 text-paper font-semibold transition-colors disabled:opacity-50"
                  >
                    {editSaving ? '…' : t('review.saveLevel')}
                  </button>
                </div>
                <button
                  onClick={() => handleDeleteGroup(editGroup)}
                  disabled={editSaving}
                  className="w-full py-2.5 text-sm rounded-xl bg-danger-soft text-danger hover:bg-danger-soft font-medium transition-colors disabled:opacity-50"
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
          iconBg: 'bg-success-soft',
          title: s.title,
          body: s.body,
        }));
        const dismiss = () => {
          localStorage.setItem(REVIEW_ONBOARDING_KEY, '1');
          setShowReviewOnboarding(false);
        };
        return <OnboardingModal steps={steps} onDone={dismiss} onSkip={dismiss} />;
      })()}

      {modePicker && (
        <QuizModeModal
          wordCount={modePicker.wordCount}
          onSelect={(mode) => {
            const { run } = modePicker;
            setModePicker(null);
            run(mode);
          }}
          onClose={() => setModePicker(null)}
        />
      )}
    </div>
  );
};

export default ReviewPage;
