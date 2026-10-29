import { and, asc, eq, gte, lt, lte, ne, or } from "drizzle-orm";
import { getDb } from "@/db";
import { dailyLogs, habitEntries, habits, tasks } from "@/db/schema";
import {
  SLEEP_GOOD,
  SLEEP_POOR,
  SLEEP_TARGET,
  type CellState,
  type DashboardAnalytics,
  type DashboardRange,
  type HabitGrid,
  type ScoreComponent,
  type SleepSection,
  type SleepStatus,
  type TodayTask,
  type Verdict,
} from "@/lib/types";

// date helpers (everything is bucketed in the owner's timezone)
const TZ = "Asia/Kolkata";
const TZ_OFFSET = "+05:30"; // India has no DST
const dayFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const dayKey = (d: Date) => dayFmt.format(d);

function addDays(key: string, n: number) {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const dayStart = (key: string) => new Date(`${key}T00:00:00${TZ_OFFSET}`);

function keysBetween(start: string, end: string) {
  const keys: string[] = [];
  for (let k = start; k <= end; k = addDays(k, 1)) keys.push(k);
  return keys;
}

const weekdayLabel = (key: string) =>
  new Date(`${key}T00:00:00Z`).toLocaleDateString("en", {
    weekday: "short",
    timeZone: "UTC",
  });

const dateLabel = (key: string) =>
  new Date(`${key}T00:00:00Z`).toLocaleDateString("en", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });

const avg = (values: number[]) =>
  values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;

const round = (n: number, digits = 1) => {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
};

const clamp = (n: number) => Math.max(0, Math.min(100, n));

const fmtHours = (h: number) => {
  const minutes = Math.round(h * 60);
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
};

type Win = { start: string; end: string };

// ---------- main entry ----------

export async function getDashboardAnalytics(
  range: DashboardRange,
  now = new Date(),
): Promise<DashboardAnalytics> {
  const db = getDb();
  const days = range === "30d" ? 30 : 7;

  const today = dayKey(now);
  const tomorrow = addDays(today, 1);
  const thisWeek: Win = { start: addDays(today, -6), end: today };
  const lastWeek: Win = { start: addDays(today, -13), end: addDays(today, -7) };

  const dow = new Date(`${today}T00:00:00Z`).getUTCDay();
  const monday = addDays(today, -((dow + 6) % 7));
  const gridStart = addDays(monday, -364); // 53 week columns, current week last

  const logsStart = addDays(today, -(2 * days - 1));

  const [logRows, taskRows, todayRows, habitRows, entryRows] =
    await Promise.all([
      db
        .select({
          day: dailyLogs.day,
          sleepHours: dailyLogs.sleepHours,
          energy: dailyLogs.energy,
        })
        .from(dailyLogs)
        .where(and(gte(dailyLogs.day, logsStart), lte(dailyLogs.day, today)))
        .orderBy(asc(dailyLogs.day)),
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
      db
        .select()
        .from(tasks)
        .where(
          or(
            and(eq(tasks.status, "open"), lte(tasks.dueDate, today)),
            and(
              eq(tasks.status, "done"),
              gte(tasks.completedAt, dayStart(today)),
              lt(tasks.completedAt, dayStart(tomorrow)),
            ),
          ),
        )
        .limit(100),
      db
        .select()
        .from(habits)
        .where(eq(habits.active, true))
        .orderBy(asc(habits.id)),
      db
        .select({ habitId: habitEntries.habitId, day: habitEntries.day })
        .from(habitEntries)
        .where(
          and(
            gte(habitEntries.day, gridStart),
            lte(habitEntries.day, today),
            eq(habitEntries.completed, true),
          ),
        ),
    ]);

  // ----- today's tasks -----
  const rank = { high: 0, normal: 1, low: 2 } as const;
  const todayTasks: TodayTask[] = todayRows
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
  const doneToday = todayTasks.filter((t) => t.status === "done").length;

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

  // ----- habits -----
  const entryDays = new Map<number, Set<string>>();
  for (const e of entryRows) {
    const set = entryDays.get(e.habitId) ?? new Set<string>();
    set.add(e.day);
    entryDays.set(e.habitId, set);
  }
  const countIn = (set: Set<string>, w: Win) =>
    keysBetween(w.start, w.end).filter((k) => set.has(k)).length;

  const habitGrids: HabitGrid[] = habitRows.map((h) => {
    const set = entryDays.get(h.id) ?? new Set<string>();

    const weeks: CellState[][] = [];
    let weeksHit = 0;
    for (let w = 0; w < 53; w++) {
      const col: CellState[] = [];
      let done = 0;
      for (let d = 0; d < 7; d++) {
        const key = addDays(gridStart, w * 7 + d);
        if (key > today) col.push(2);
        else if (set.has(key)) {
          col.push(1);
          done++;
        } else col.push(0);
      }
      weeks.push(col);
      if (w < 52 && done >= h.targetPerWeek) weeksHit++;
    }

    let streak = 0;
    let cursor = set.has(today) ? today : addDays(today, -1);
    while (set.has(cursor)) {
      streak++;
      cursor = addDays(cursor, -1);
    }

    return {
      id: h.id,
      name: h.name,
      targetPerWeek: h.targetPerWeek,
      doneLast7: countIn(set, thisWeek),
      streak,
      weeksHit,
      weeksTotal: 52,
      weeks,
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
    habitsOnPace: habitGrids.filter((h) => h.doneLast7 >= h.targetPerWeek)
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
  const weakest = [...habitGrids].sort(
    (a, b) => a.doneLast7 / a.targetPerWeek - b.doneLast7 / b.targetPerWeek,
  )[0];
  if (weakest && weakest.doneLast7 < weakest.targetPerWeek)
    insights.push(
      `${weakest.name}: ${weakest.doneLast7} of ${weakest.targetPerWeek} this week, the furthest from target.`,
    );
  const bestStreak = [...habitGrids].sort((a, b) => b.streak - a.streak)[0];
  if (bestStreak && bestStreak.streak >= 3)
    insights.push(
      `${bestStreak.name} streak: ${bestStreak.streak} days running.`,
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

  return {
    generatedAt: now.toISOString(),
    range,
    verdict,
    today: {
      date: today,
      tasks: todayTasks,
      done: doneToday,
      open: todayTasks.length - doneToday,
      overdue,
      total: todayTasks.length,
    },
    sleep,
    habits: { gridStart, today, habits: habitGrids },
    taskTrend,
  };
}

function round2(n: number | null) {
  return n === null ? null : round(n, 1);
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

const headers = { "Cache-Control": "private, no-store, max-age=0" };

export async function GET(request: Request) {
  const value = new URL(request.url).searchParams.get("range");
  const range: DashboardRange = value === "30d" ? "30d" : "7d";
  try {
    return Response.json(await getDashboardAnalytics(range), { headers });
  } catch (error) {
    console.error("Dashboard analytics failed", {
      reason: error instanceof Error ? error.name : "UnknownError",
    });
    return Response.json(
      { error: "Could not load dashboard data." },
      { status: 500, headers },
    );
  }
}
