export interface GoalLang {
  quizWords: number;
  scrambleSentences: number;
  spokenSentences: number;
  writtenSentences: number;
}

export interface DailyGoalConfig {
  japanese: GoalLang;
  english: GoalLang;
}

export interface ProgressLang {
  quizWords: number;
  scrambleSentences: number;
  spokenSentences: number;
  spokenScoreTotal: number;
  writtenSentences: number;
}

export interface DailyProgressRecord {
  date: string;
  japanese: ProgressLang;
  english: ProgressLang;
}

const GOAL_CONFIG_KEY = 'hw-daily-goal-config';
const GOAL_PROGRESS_KEY = 'hw-daily-progress';

const defaultGoalLang = (): GoalLang => ({
  quizWords: 0, scrambleSentences: 0, spokenSentences: 0, writtenSentences: 0,
});

export const defaultProgressLang = (): ProgressLang => ({
  quizWords: 0, scrambleSentences: 0, spokenSentences: 0, spokenScoreTotal: 0, writtenSentences: 0,
});

export function getTodayDate(): string {
  return new Date().toLocaleDateString('sv'); // YYYY-MM-DD in local time
}

export function getGoalConfig(): DailyGoalConfig {
  try {
    const raw = localStorage.getItem(GOAL_CONFIG_KEY);
    if (raw) return JSON.parse(raw) as DailyGoalConfig;
  } catch {}
  return { japanese: defaultGoalLang(), english: defaultGoalLang() };
}

export function saveGoalConfig(config: DailyGoalConfig): void {
  try { localStorage.setItem(GOAL_CONFIG_KEY, JSON.stringify(config)); } catch {}
}

export function getTodayProgress(): DailyProgressRecord {
  try {
    const raw = localStorage.getItem(GOAL_PROGRESS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DailyProgressRecord;
      if (parsed.date === getTodayDate()) return parsed;
    }
  } catch {}
  return {
    date: getTodayDate(),
    japanese: defaultProgressLang(),
    english: defaultProgressLang(),
  };
}

export function saveTodayProgress(record: DailyProgressRecord): void {
  try { localStorage.setItem(GOAL_PROGRESS_KEY, JSON.stringify(record)); } catch {}
}

export function countUnfinishedGoals(config: DailyGoalConfig, progress: DailyProgressRecord): number {
  let count = 0;
  const fields: Array<keyof GoalLang> = ['quizWords', 'scrambleSentences', 'spokenSentences', 'writtenSentences'];
  for (const lang of ['japanese', 'english'] as const) {
    for (const field of fields) {
      const goal = config[lang][field];
      if (goal > 0 && progress[lang][field] < goal) count++;
    }
  }
  return count;
}

export function hasAnyGoal(config: DailyGoalConfig): boolean {
  return [...Object.values(config.japanese), ...Object.values(config.english)].some(v => v > 0);
}
