export type DashboardRange = "7d" | "30d";

export const SLEEP_TARGET = 8;
export const SLEEP_GOOD = 7;
export const SLEEP_POOR = 6;

export type VerdictTone = "great" | "good" | "mixed" | "bad" | "empty";

export type ScoreComponent = {
  key: "sleep" | "tasks" | "habits" | "energy";
  label: string;
  /** 0-100, null when there is no data for this area. */
  score: number | null;
  detail: string;
  /** Share of the final score, before re-normalising for missing data. */
  weight: number;
};

export type Verdict = {
  score: number | null;
  label: string;
  tone: VerdictTone;
  headline: string;
  /** Score points vs the previous 7 days. */
  deltaVsLastWeek: number | null;
  components: ScoreComponent[];
  insights: string[];
};

export type TodayTask = {
  id: number;
  text: string;
  status: "open" | "done";
  priority: "low" | "normal" | "high";
  project: string | null;
  dueDate: string | null;
  overdue: boolean;
  completedAt: string | null;
};

export type TodaySection = {
  date: string;
  tasks: TodayTask[];
  done: number;
  open: number;
  overdue: number;
  total: number;
};

export type SleepStatus = "great" | "good" | "low" | "poor" | "none";

export type SleepPoint = {
  day: string;
  label: string;
  hours: number | null;
  energy: number | null;
};

export type SleepSection = {
  target: number;
  goodMin: number;
  points: SleepPoint[];
  avg: number | null;
  prevAvg: number | null;
  status: SleepStatus;
  goodNights: number;
  loggedNights: number;
  /** Hours short of the target, summed over logged nights in the range. */
  sleepDebt: number;
  best: { label: string; hours: number } | null;
  worst: { label: string; hours: number } | null;
  /** Standard deviation of nightly hours. Lower is steadier. */
  variability: number | null;
  energyAfterGoodSleep: number | null;
  energyAfterShortSleep: number | null;
};

/** 0 = missed, 1 = done, 2 = in the future. */
export type CellState = 0 | 1 | 2;

export type HabitGrid = {
  id: number;
  name: string;
  targetPerWeek: number;
  doneLast7: number;
  streak: number;
  /** Complete calendar weeks (in the grid) where the weekly target was met. */
  weeksHit: number;
  weeksTotal: number;
  /** 12 columns (weeks, Monday first) of 7 rows (Mon-Sun). */
  weeks: CellState[][];
};

export type HabitsSection = {
  gridStart: string;
  today: string;
  habits: HabitGrid[];
};

export type TaskTrendPoint = { label: string; done: number };

export type DashboardAnalytics = {
  generatedAt: string;
  range: DashboardRange;
  verdict: Verdict;
  today: TodaySection;
  sleep: SleepSection;
  habits: HabitsSection;
  taskTrend: TaskTrendPoint[];
};
