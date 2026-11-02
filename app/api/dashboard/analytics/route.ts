// app/api/dashboard/analytics/route.ts
import { and, asc, eq, gte, lt, lte, ne, or } from "drizzle-orm";
import { getDb } from "@/db";
import { dailyLogs, goals, habitEntries, habits, tasks } from "@/db/schema";
import {
  SLEEP_GOOD,
  SLEEP_POOR,
  SLEEP_TARGET,
  type DashboardAnalytics,
  type DashboardRange,
  type GoalItem,
  type ScoreComponent,
  type SleepSection,
  type SleepStatus,
  type TaskItem,
  type Verdict,
} from "@/lib/types";
import {
  addDays,
  avg,
  clamp,
  createTimer,
  dateLabel,
  dayKey,
  dayStart,
  fmtHours,
  keysBetween,
  round,
  round2,
  weekdayLabel,
  type Win,
} from "@/lib/dashboard-utils";

// Everything except the 365-day habit grid (that lives in /api/dashboard/habits).
type AnalyticsPayload = Omit<DashboardAnalytics, "habits">;

// The weekly score only needs a couple of weeks of habit entries. 30 days also
// covers the streak insight (shown as "30+" if it hits the cap).
const HABIT_WINDOW = 30;

// ---------- main entry ----------

async function getAnalytics(
  range: DashboardRange,
  now = new Date(),
): Promise<AnalyticsPayload> {
  const timer = createTimer(`analytics:${range}`);
  const db = getDb();
  timer.mark("getDb()");
  const days = range === "30d" ? 30 : 7;

  const today = dayKey(now);
  const tomorrow = addDays(today, 1);
  const thisWeek: Win = { start: addDays(today, -6), end: today };
  const lastWeek: Win = { start: addDays(today, -13), end: addDays(today, -7) };

  const logsStart = addDays(today, -(2 * days - 1));
  const habitStart = addDays(today, -(HABIT_WINDOW - 1));

  const [logRows, taskRows, taskListRows, goalRows, habitRows, entryRows] =
    await timer.wrap("queries (total)", () =>
      Promise.all([
        timer.wrap("q1 dailyLogs", () =>
          db
            .select({
              day: dailyLogs.day,
              sleepHours: dailyLogs.sleepHours,
              energy: dailyLogs.energy,
            })
            .from(dailyLogs)
            .where(
              and(gte(dailyLogs.day, logsStart), lte(dailyLogs.day, today)),
            )
            .orderBy(asc(dailyLogs.day)),
        ),
        timer.wrap("q2 tasks (stats)", () =>
          db
            .select({
              status: tasks.status,
              dueDate: tasks.dueDate,
              completedAt: tasks.completedAt,
            })
            .from(tasks)
            .where(
              and(
                ne(tasks.status, "dropped"),
                or(
                  and(
                    gte(tasks.dueDate, lastWeek.start),
                    lte(tasks.dueDate, today),
                  ),
                  gte(tasks.completedAt, dayStart(lastWeek.start)),
                ),
              ),
            ),
        ),
        timer.wrap("q3 tasks (list)", () =>
          db
            .select()
            .from(tasks)
            .where(
              or(
                eq(tasks.status, "open"),
                and(
                  eq(tasks.status, "done"),
                  gte(tasks.completedAt, dayStart(today)),
                  lt(tasks.completedAt, dayStart(tomorrow)),
                ),
              ),
            )
            .limit(200),
        ),
        timer.wrap("q4 goals", () =>
          db
            .select({
              id: goals.id,
              title: goals.title,
              unit: goals.unit,
              targetValue: goals.targetValue,
              currentValue: goals.currentValue,
              endsOn: goals.endsOn,
              status: goals.status,
            })
            .from(goals)
            .orderBy(asc(goals.createdAt)),
        ),
        timer.wrap("q5 habits", () =>
          db
            .select()
            .from(habits)
            .where(eq(habits.active, true))
            .orderBy(asc(habits.id)),
        ),
        timer.wrap(`q6 habitEntries (${HABIT_WINDOW}d)`, () =>
          db
            .select({ habitId: habitEntries.habitId, day: habitEntries.day })
            .from(habitEntries)
            .where(
              and(
                gte(habitEntries.day, habitStart),
                lte(habitEntries.day, today),
                eq(habitEntries.completed, true),
              ),
            ),
        ),
      ]),
    );

  console.log("[timing] analytics row counts", {
    logs: logRows.length,
    taskStats: taskRows.length,
    taskList: taskListRows.length,
    goals: goalRows.length,
    habits: habitRows.length,
    entries: entryRows.length,
  });
  timer.mark("after DB (row counts)");

  // ----- today's tasks -----
  const rank = { high: 0, normal: 1, low: 2 } as const;
  const taskList: TaskItem[] = taskListRows
    .map((t) => ({
      id: t.id,
      text: t.text,
      status: t.status === "done" ? ("done" as const) : ("open" as const),
      priority: t.priority,
      project: t.project,
      dueDate: t.dueDate,
      overdue: t.status === "open" && !!t.dueDate && t.dueDate < today,
      completedAt: t.completedAt?.toISOString() ?? null,
    }))
    .sort(
      (a, b) =>
        Number(a.status === "done") - Number(b.status === "done") ||
        Number(b.overdue) - Number(a.overdue) ||
        rank[a.priority] - rank[b.priority] ||
        a.id - b.id,
    );
  const todayTasks = taskList.filter(
    (task) =>
      (task.status === "open" && !!task.dueDate && task.dueDate <= today) ||
      task.status === "done",
  );
  const goalList: GoalItem[] = goalRows.map((goal) => ({
    ...goal,
    targetValue: goal.targetValue === null ? null : Number(goal.targetValue),
    currentValue: Number(goal.currentValue),
  }));
  const doneToday = todayTasks.filter((t) => t.status === "done").length;
  timer.mark("compute: today's tasks");

  // ----- task stats per window -----
  const taskWindow = (w: Win) => {
    let total = 0;
    let done = 0;
    for (const t of taskRows) {
      const completedDay = t.completedAt ? dayKey(t.completedAt) : null;
      const due = t.dueDate && t.dueDate >= w.start && t.dueDate <= w.end;
      const finished =
        completedDay && completedDay >= w.start && completedDay <= w.end;
      if (!due && !finished) continue;
      total++;
      if (t.status === "done") done++;
    }
    return { done, total, rate: total ? done / total : null };
  };

  const taskTrend = keysBetween(addDays(today, -13), today).map((key) => ({
    label: dateLabel(key),
    done: taskRows.filter(
      (t) =>
        t.status === "done" && t.completedAt && dayKey(t.completedAt) === key,
    ).length,
  }));
  timer.mark("compute: task stats + trend");

  // ----- logs per window -----
  const logWindow = (w: Win) => {
    const rows = logRows.filter((l) => l.day >= w.start && l.day <= w.end);
    return {
      sleep: avg(
        rows
          .filter((l) => l.sleepHours !== null)
          .map((l) => Number(l.sleepHours)),
      ),
      energy: avg(
        rows.filter((l) => l.energy !== null).map((l) => Number(l.energy)),
      ),
    };
  };

  // ----- habits (lightweight: only what the score + insights need) -----
  const entryDays = new Map<number, Set<string>>();
  for (const e of entryRows) {
    const set = entryDays.get(e.habitId) ?? new Set<string>();
    set.add(e.day);
    entryDays.set(e.habitId, set);
  }
  const countIn = (set: Set<string>, w: Win) =>
    keysBetween(w.start, w.end).filter((k) => set.has(k)).length;

  const habitStats = habitRows.map((h) => {
    const set = entryDays.get(h.id) ?? new Set<string>();
    let streak = 0;
    let cursor = set.has(today) ? today : addDays(today, -1);
    while (set.has(cursor)) {
      streak++;
      cursor = addDays(cursor, -1);
    }
    return {
      name: h.name,
      targetPerWeek: h.targetPerWeek,
      doneLast7: countIn(set, thisWeek),
      streak,
    };
  });

  const habitAdherence = (w: Win) =>
    habitRows.length
      ? habitRows.reduce(
          (sum, h) =>
            sum +
            Math.min(
              1,
              countIn(entryDays.get(h.id) ?? new Set(), w) / h.targetPerWeek,
            ),
          0,
        ) / habitRows.length
      : null;
  timer.mark("compute: habit stats");

  // ----- sleep section (follows the selected range) -----
  const rangeKeys = keysBetween(addDays(today, -(days - 1)), today);
  const logByDay = new Map(logRows.map((l) => [l.day, l]));
  const points = rangeKeys.map((key) => {
    const l = logByDay.get(key);
    return {
      day: key,
      label: days === 7 ? weekdayLabel(key) : dateLabel(key),
      hours: l?.sleepHours != null ? Number(l.sleepHours) : null,
      energy: l?.energy ?? null,
    };
  });
  const logged = points.filter(
    (p) => p.hours !== null,
  ) as ((typeof points)[number] & {
    hours: number;
  })[];
  const sleepAvg = avg(logged.map((p) => p.hours));
  const prevRangeAvg = avg(
    logRows
      .filter(
        (l) =>
          l.day >= addDays(today, -(2 * days - 1)) &&
          l.day <= addDays(today, -days) &&
          l.sleepHours !== null,
      )
      .map((l) => Number(l.sleepHours)),
  );
  const sorted = [...logged].sort((a, b) => a.hours - b.hours);
  const variability =
    sleepAvg !== null && logged.length > 1
      ? Math.sqrt(
          logged.reduce((s, p) => s + (p.hours - sleepAvg) ** 2, 0) /
            logged.length,
        )
      : null;
  const energyFor = (pred: (h: number) => boolean) => {
    const values = logged
      .filter((p) => p.energy !== null && pred(p.hours))
      .map((p) => p.energy as number);
    return values.length >= 2 ? avg(values) : null;
  };
  const sleepStatus: SleepStatus =
    sleepAvg === null
      ? "none"
      : sleepAvg >= SLEEP_TARGET
        ? "great"
        : sleepAvg >= SLEEP_GOOD
          ? "good"
          : sleepAvg >= SLEEP_POOR
            ? "low"
            : "poor";
  const sleep: SleepSection = {
    target: SLEEP_TARGET,
    goodMin: SLEEP_GOOD,
    points,
    avg: sleepAvg === null ? null : round(sleepAvg, 2),
    prevAvg: prevRangeAvg === null ? null : round(prevRangeAvg, 2),
    status: sleepStatus,
    goodNights: logged.filter((p) => p.hours >= SLEEP_GOOD).length,
    loggedNights: logged.length,
    sleepDebt: round(
      logged.reduce((s, p) => s + Math.max(0, SLEEP_TARGET - p.hours), 0),
    ),
    best: sorted.length
      ? {
          label: sorted[sorted.length - 1].label,
          hours: sorted[sorted.length - 1].hours,
        }
      : null,
    worst: sorted.length
      ? { label: sorted[0].label, hours: sorted[0].hours }
      : null,
    variability: variability === null ? null : round(variability, 2),
    energyAfterGoodSleep: round2(energyFor((h) => h >= SLEEP_GOOD)),
    energyAfterShortSleep: round2(energyFor((h) => h < SLEEP_GOOD)),
  };
  timer.mark("compute: sleep section");

  // ----- weekly verdict -----
  const weekLogs = logWindow(thisWeek);
  const prevLogs = logWindow(lastWeek);
  const weekTasks = taskWindow(thisWeek);
  const prevTasks = taskWindow(lastWeek);
  const weekHabits = habitAdherence(thisWeek);
  const prevHabits = habitAdherence(lastWeek);

  const components = buildComponents({
    sleep: weekLogs.sleep,
    taskRate: weekTasks.rate,
    taskDone: weekTasks.done,
    taskTotal: weekTasks.total,
    habitAdherence: weekHabits,
    habitCount: habitRows.length,
    habitsOnPace: habitStats.filter((h) => h.doneLast7 >= h.targetPerWeek)
      .length,
    energy: weekLogs.energy,
  });
  const prevComponents = buildComponents({
    sleep: prevLogs.sleep,
    taskRate: prevTasks.rate,
    taskDone: prevTasks.done,
    taskTotal: prevTasks.total,
    habitAdherence: prevHabits,
    habitCount: habitRows.length,
    habitsOnPace: 0,
    energy: prevLogs.energy,
  });

  const score = composite(components);
  const prevScore = composite(prevComponents);

  const overdue = todayTasks.filter((t) => t.overdue).length;
  const insights: string[] = [];
  const weekSleepLogged = logRows.filter(
    (l) => l.day >= thisWeek.start && l.sleepHours !== null,
  );
  const weekDebt = weekSleepLogged.reduce(
    (s, l) => s + Math.max(0, SLEEP_TARGET - Number(l.sleepHours)),
    0,
  );
  if (weekDebt >= 2)
    insights.push(
      `You are ${round(weekDebt)}h short of ${SLEEP_TARGET}h across ${weekSleepLogged.length} logged nights this week.`,
    );
  if (overdue > 0)
    insights.push(
      `${overdue} overdue task${overdue > 1 ? "s" : ""} waiting. Clear those first.`,
    );
  const weakest = [...habitStats].sort(
    (a, b) => a.doneLast7 / a.targetPerWeek - b.doneLast7 / b.targetPerWeek,
  )[0];
  if (weakest && weakest.doneLast7 < weakest.targetPerWeek)
    insights.push(
      `${weakest.name}: ${weakest.doneLast7} of ${weakest.targetPerWeek} this week, the furthest from target.`,
    );
  const bestStreak = [...habitStats].sort((a, b) => b.streak - a.streak)[0];
  if (bestStreak && bestStreak.streak >= 3)
    insights.push(
      `${bestStreak.name} streak: ${
        bestStreak.streak >= HABIT_WINDOW - 1
          ? `${bestStreak.streak}+`
          : bestStreak.streak
      } days running.`,
    );
  if (
    sleep.energyAfterGoodSleep !== null &&
    sleep.energyAfterShortSleep !== null &&
    sleep.energyAfterGoodSleep - sleep.energyAfterShortSleep >= 0.5
  )
    insights.push(
      `Energy averages ${sleep.energyAfterGoodSleep}/5 after ${SLEEP_GOOD}h+ nights versus ${sleep.energyAfterShortSleep}/5 after shorter ones.`,
    );

  const verdict = buildVerdict(
    score,
    prevScore,
    components,
    insights.slice(0, 4),
  );

  timer.mark("compute: verdict + insights");
  console.log(
    `[timing] analytics:${range} TOTAL ${timer.total()}ms`,
    timer.steps(),
  );

  return {
    generatedAt: now.toISOString(),
    range,
    verdict,
    tasks: taskList,
    goals: goalList,
    today: {
      date: today,
      tasks: todayTasks,
      done: doneToday,
      open: todayTasks.length - doneToday,
      overdue,
      total: todayTasks.length,
    },
    sleep,
    taskTrend,
  };
}

// ---------- scoring ----------

function buildComponents(input: {
  sleep: number | null;
  taskRate: number | null;
  taskDone: number;
  taskTotal: number;
  habitAdherence: number | null;
  habitCount: number;
  habitsOnPace: number;
  energy: number | null;
}): ScoreComponent[] {
  return [
    {
      key: "sleep",
      label: "Sleep",
      weight: 30,
      score:
        input.sleep === null
          ? null
          : Math.round(clamp((input.sleep / SLEEP_TARGET) * 100)),
      detail:
        input.sleep === null
          ? "No sleep logged"
          : `${fmtHours(input.sleep)} avg (target ${SLEEP_TARGET}h)`,
    },
    {
      key: "tasks",
      label: "Tasks",
      weight: 30,
      score: input.taskRate === null ? null : Math.round(input.taskRate * 100),
      detail:
        input.taskRate === null
          ? "No tasks due or completed"
          : `${input.taskDone} of ${input.taskTotal} resolved`,
    },
    {
      key: "habits",
      label: "Habits",
      weight: 25,
      score:
        input.habitAdherence === null
          ? null
          : Math.round(input.habitAdherence * 100),
      detail:
        input.habitAdherence === null
          ? "No active habits"
          : `${input.habitsOnPace} of ${input.habitCount} on pace`,
    },
    {
      key: "energy",
      label: "Energy",
      weight: 15,
      score:
        input.energy === null
          ? null
          : Math.round(clamp((input.energy / 5) * 100)),
      detail:
        input.energy === null
          ? "No energy logged"
          : `${round(input.energy)} / 5 average`,
    },
  ];
}

function composite(components: ScoreComponent[]) {
  const live = components.filter((c) => c.score !== null);
  const weight = live.reduce((s, c) => s + c.weight, 0);
  if (!weight) return null;
  return Math.round(
    live.reduce((s, c) => s + (c.score as number) * c.weight, 0) / weight,
  );
}

function buildVerdict(
  score: number | null,
  prevScore: number | null,
  components: ScoreComponent[],
  insights: string[],
): Verdict {
  if (score === null) {
    return {
      score,
      label: "No verdict yet",
      tone: "empty",
      headline:
        "Log sleep, finish a task or tick a habit and I will score your week.",
      deltaVsLastWeek: null,
      components,
      insights,
    };
  }
  const [label, tone]: [string, Verdict["tone"]] =
    score >= 85
      ? ["Goated week", "great"]
      : score >= 70
        ? ["Solid week", "good"]
        : score >= 50
          ? ["Mixed week", "mixed"]
          : ["Rough week", "bad"];

  const live = components
    .filter((c) => c.score !== null)
    .sort((a, b) => (b.score as number) - (a.score as number));
  const best = live[0];
  const worst = live[live.length - 1];
  let headline = "";
  if (live.length === 1)
    headline = `Only ${best.label.toLowerCase()} data so far.`;
  else if ((worst.score as number) >= 70)
    headline = "Everything is running smoothly. Keep the rhythm.";
  else
    headline = `${best.label} is carrying you (${best.score}). ${worst.label} is the drag (${worst.score}).`;

  return {
    score,
    label,
    tone,
    headline,
    deltaVsLastWeek: prevScore === null ? null : score - prevScore,
    components,
    insights,
  };
}

// ---------- route handler ----------

const headers = { "Cache-Control": "private, no-store, max-age=0" };

export async function GET(request: Request) {
  const reqStart = performance.now();
  const value = new URL(request.url).searchParams.get("range");
  const range: DashboardRange = value === "30d" ? "30d" : "7d";
  console.log(`[timing] GET /api/dashboard/analytics range=${range} received`);

  try {
    const data = await getAnalytics(range);
    const t1 = performance.now();
    const body = JSON.stringify(data);
    const t2 = performance.now();

    const total = Math.round(t2 - reqStart);
    console.log(
      `[timing] GET /api/dashboard/analytics done: queries+compute ${Math.round(t1 - reqStart)}ms, ` +
        `serialize ${Math.round(t2 - t1)}ms (${(body.length / 1024).toFixed(1)} KB), total ${total}ms`,
    );

    return new Response(body, {
      headers: {
        ...headers,
        "Content-Type": "application/json",
        "Server-Timing": `total;dur=${total}`,
      },
    });
  } catch (error) {
    console.error("Dashboard analytics failed", {
      reason: error instanceof Error ? error.message : "UnknownError",
      afterMs: Math.round(performance.now() - reqStart),
    });
    return Response.json(
      { error: "Could not load dashboard data." },
      { status: 500, headers },
    );
  }
}
