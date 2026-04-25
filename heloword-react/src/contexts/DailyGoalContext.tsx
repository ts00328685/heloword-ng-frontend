import React, { createContext, useCallback, useContext, useState } from 'react';
import {
  DailyGoalConfig,
  DailyProgressRecord,
  GoalLang,
  countUnfinishedGoals,
  getGoalConfig,
  getTodayProgress,
  hasAnyGoal,
  saveGoalConfig,
  saveTodayProgress,
} from '../services/dailyGoal.service';
import { useAuth } from './AuthContext';
import { doPost } from '../services/api.service';

export type GoalProgressField = keyof GoalLang;

interface DailyGoalContextType {
  config: DailyGoalConfig;
  progress: DailyProgressRecord;
  updateConfig: (config: DailyGoalConfig) => void;
  incrementProgress: (lang: 'japanese' | 'english', field: GoalProgressField, score?: number) => void;
  unfinishedCount: number;
  hasGoals: boolean;
  refreshProgress: () => void;
}

const DailyGoalContext = createContext<DailyGoalContextType | null>(null);

export const DailyGoalProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isLoggedIn } = useAuth();
  const [config, setConfig] = useState<DailyGoalConfig>(() => getGoalConfig());
  const [progress, setProgress] = useState<DailyProgressRecord>(() => getTodayProgress());

  const syncToBackend = useCallback((record: DailyProgressRecord) => {
    if (!isLoggedIn) return;
    doPost('/frontend-api/api/fe/daily-goal/save', record).catch(() => {});
  }, [isLoggedIn]);

  const updateConfig = useCallback((newConfig: DailyGoalConfig) => {
    saveGoalConfig(newConfig);
    setConfig(newConfig);
  }, []);

  const incrementProgress = useCallback((
    lang: 'japanese' | 'english',
    field: GoalProgressField,
    score?: number,
  ) => {
    setProgress(prev => {
      const updated: DailyProgressRecord = {
        ...prev,
        [lang]: {
          ...prev[lang],
          [field]: prev[lang][field] + 1,
          ...(field === 'spokenSentences' && score != null
            ? { spokenScoreTotal: prev[lang].spokenScoreTotal + score }
            : {}),
        },
      };
      saveTodayProgress(updated);
      syncToBackend(updated);
      return updated;
    });
  }, [syncToBackend]);

  const refreshProgress = useCallback(() => {
    setProgress(getTodayProgress());
  }, []);

  const unfinishedCount = countUnfinishedGoals(config, progress);
  const hasGoals = hasAnyGoal(config);

  return (
    <DailyGoalContext.Provider value={{
      config, progress, updateConfig, incrementProgress,
      unfinishedCount, hasGoals, refreshProgress,
    }}>
      {children}
    </DailyGoalContext.Provider>
  );
};

export const useDailyGoal = (): DailyGoalContextType => {
  const ctx = useContext(DailyGoalContext);
  if (!ctx) throw new Error('useDailyGoal must be used within DailyGoalProvider');
  return ctx;
};
