export type DashboardRange = "24h" | "7d" | "30d";
export type RecentLog = { id: string; time: string; category: "Sleep" | "Task" | "Hobby"; title: string; badge: string };
export type DashboardAnalytics = {
  metrics: Record<"avgSleep" | "taskCompletionRate" | "hobbyTimeSpent" | "bestProductivityWeek", { value: string; delta: number; subtitle: string }>;
  sleepTrend: { day: string; sleepHours: number; quality: number; productivityScore: number }[];
  hobbiesBreakdown: { name: string; hours: number; fill: string }[];
  weeklyComparison: { week: string; tasksDone: number; score: number }[];
  recentLogs: RecentLog[];
  dataSource: "database" | "sample";
};

export function getLifestyleAnalytics(): DashboardAnalytics {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return {
    dataSource: "sample",
    metrics: {
      avgSleep: { value: "7h 42m", delta: 6.5, subtitle: "vs last week (target: 8h)" },
      taskCompletionRate: { value: "84%", delta: 12.3, subtitle: "38 of 45 tasks resolved" },
      hobbyTimeSpent: { value: "14.5 hrs", delta: -3.2, subtitle: "Reading, Guitar & Gym" },
      bestProductivityWeek: { value: "Week 42", delta: 8.4, subtitle: "94/100 peak productivity score" },
    },
    sleepTrend: days.map((day, i) => ({ day, sleepHours: [7.2, 8.1, 6.8, 7.7, 8.3, 7.4, 8.1][i], quality: [72, 88, 68, 82, 91, 78, 89][i], productivityScore: [76, 84, 68, 82, 91, 79, 94][i] })),
    hobbiesBreakdown: [
      { name: "Reading", hours: 4.5, fill: "#FBCFE8" }, { name: "Gym", hours: 3.5, fill: "#FED7AA" },
      { name: "Side Projects", hours: 3, fill: "#C4B5FD" }, { name: "Guitar", hours: 2, fill: "#A7F3D0" }, { name: "Journaling", hours: 1.5, fill: "#BAE6FD" },
    ],
    weeklyComparison: [
      { week: "Wk 39", tasksDone: 31, score: 76 }, { week: "Wk 40", tasksDone: 35, score: 82 },
      { week: "Wk 41", tasksDone: 34, score: 79 }, { week: "Wk 42", tasksDone: 42, score: 94 },
    ],
    recentLogs: [
      { id: "1", time: "Today, 8:10 AM", category: "Sleep", title: "Slept 8h 10m · quality 89", badge: "Rested" },
      { id: "2", time: "Today, 10:25 AM", category: "Task", title: "Finished weekly planning", badge: "Completed" },
      { id: "3", time: "Yesterday, 7:30 PM", category: "Hobby", title: "Guitar practice · 45 min", badge: "Guitar" },
      { id: "4", time: "Yesterday, 6:15 PM", category: "Task", title: "Reviewed project milestones", badge: "Completed" },
      { id: "5", time: "Mon, 9:00 PM", category: "Hobby", title: "Reading · 1 hour", badge: "Reading" },
    ],
  };
}
