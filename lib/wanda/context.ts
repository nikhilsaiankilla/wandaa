import "server-only";

import profile from "@/data/profile.json";
import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  lt,
  lte,
  notInArray,
  sql,
} from "drizzle-orm";
import { getDb } from "@/db";
import {
  dailyLogs,
  drafts,
  goals,
  habitEntries,
  habits,
  jobApplications,
  metricSnapshots,
  reminders,
  tasks,
} from "@/db/schema";
import { addDays, clip, dayStartUtc, formatDateTime } from "./time";

export type SalesRow = {
  product: string;
  unit: string;
  count: number;
  sales: number;
  refunds: number;
  net: number;
};

export function productName(slug: string | null) {
  if (!slug) return "Unknown product";
  const all = [...profile.products, ...profile.otherProjects];
  return all.find((item) => item.slug === slug)?.name ?? slug;
}

export function money(unit: string, amount: number) {
  return `${unit} ${amount.toFixed(2)}`.trim();
}

export async function salesSummary(
  start: Date,
  end: Date,
): Promise<SalesRow[]> {
  const rows = await getDb()
    .select({
      product: metricSnapshots.product,
      name: metricSnapshots.name,
      unit: metricSnapshots.unit,
      total: sql<string>`coalesce(sum(${metricSnapshots.value}), 0)`,
      events: sql<number>`count(*)::int`,
    })
    .from(metricSnapshots)
    .where(
      and(
        eq(metricSnapshots.source, "sales"),
        inArray(metricSnapshots.name, ["sale", "refund"]),
        gte(metricSnapshots.capturedAt, start),
        lt(metricSnapshots.capturedAt, end),
      ),
    )
    .groupBy(
      metricSnapshots.product,
      metricSnapshots.name,
      metricSnapshots.unit,
    );

  const merged = new Map<string, SalesRow>();
  for (const row of rows) {
    const product = row.product ?? "unknown";
    const unit = row.unit ?? "";
    const key = `${product}|${unit}`;
    const entry = merged.get(key) ?? {
      product,
      unit,
      count: 0,
      sales: 0,
      refunds: 0,
      net: 0,
    };
    const total = Number(row.total);
    if (row.name === "sale") {
      entry.sales += total;
      entry.count += row.events;
    } else {
      entry.refunds += total;
    }
    entry.net = entry.sales - entry.refunds;
    merged.set(key, entry);
  }
  return [...merged.values()].sort((a, b) => b.net - a.net);
}

export function formatSales(rows: SalesRow[]) {
  return rows
    .map((row) => {
      const refunds = row.refunds
        ? ` (refunds ${money(row.unit, row.refunds)})`
        : "";
      return `${productName(row.product)}: ${row.count} ${row.count === 1 ? "sale" : "sales"}, net ${money(row.unit, row.net)}${refunds}`;
    })
    .join("\n");
}

export async function dayContext(day: string) {
  const db = getDb();
  const start = dayStartUtc(day);
  const end = dayStartUtc(addDays(day, 1));

  const [log] = await db
    .select({
      log: dailyLogs.log,
      sleepHours: dailyLogs.sleepHours,
      energy: dailyLogs.energy,
    })
    .from(dailyLogs)
    .where(eq(dailyLogs.day, day));

  const completedTasks = await db
    .select({ id: tasks.id, text: tasks.text })
    .from(tasks)
    .where(
      and(
        eq(tasks.status, "done"),
        gte(tasks.completedAt, start),
        lt(tasks.completedAt, end),
      ),
    )
    .limit(30);

  const dueTasks = await db
    .select({ id: tasks.id, text: tasks.text, dueDate: tasks.dueDate })
    .from(tasks)
    .where(and(eq(tasks.status, "open"), lte(tasks.dueDate, day)))
    .orderBy(asc(tasks.dueDate), asc(tasks.createdAt))
    .limit(20);

  const [openCount] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(tasks)
    .where(eq(tasks.status, "open"));

  const activeHabits = await db
    .select({ id: habits.id, name: habits.name })
    .from(habits)
    .where(eq(habits.active, true));
  const doneEntries = await db
    .select({ habitId: habitEntries.habitId })
    .from(habitEntries)
    .where(and(eq(habitEntries.day, day), eq(habitEntries.completed, true)));
  const doneIds = new Set(doneEntries.map((entry) => entry.habitId));

  const [pendingDrafts] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(drafts)
    .where(eq(drafts.status, "pending"));

  return {
    day,
    log: log?.log ? clip(log.log, 1500) : null,
    sleepHours: log?.sleepHours ?? null,
    energy: log?.energy ?? null,
    completedTasks,
    dueTasks,
    openTaskCount: openCount?.total ?? 0,
    habitsDone: activeHabits
      .filter((habit) => doneIds.has(habit.id))
      .map((habit) => habit.name),
    habitsPending: activeHabits
      .filter((habit) => !doneIds.has(habit.id))
      .map((habit) => habit.name),
    sales: await salesSummary(start, end),
    pendingDrafts: pendingDrafts?.total ?? 0,
  };
}

export type DayContext = Awaited<ReturnType<typeof dayContext>>;

export async function weekContext(weekStart: string) {
  const db = getDb();
  const weekEnd = addDays(weekStart, 6);
  const start = dayStartUtc(weekStart);
  const end = dayStartUtc(addDays(weekStart, 7));

  const logs = await db
    .select({
      day: dailyLogs.day,
      log: dailyLogs.log,
      sleepHours: dailyLogs.sleepHours,
      energy: dailyLogs.energy,
    })
    .from(dailyLogs)
    .where(and(gte(dailyLogs.day, weekStart), lte(dailyLogs.day, weekEnd)))
    .orderBy(asc(dailyLogs.day));

  const completedTasks = await db
    .select({ id: tasks.id, text: tasks.text })
    .from(tasks)
    .where(
      and(
        eq(tasks.status, "done"),
        gte(tasks.completedAt, start),
        lt(tasks.completedAt, end),
      ),
    )
    .limit(60);

  const [created] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(tasks)
    .where(and(gte(tasks.createdAt, start), lt(tasks.createdAt, end)));

  const overdue = await db
    .select({ id: tasks.id, text: tasks.text, dueDate: tasks.dueDate })
    .from(tasks)
    .where(and(eq(tasks.status, "open"), lte(tasks.dueDate, weekEnd)))
    .orderBy(asc(tasks.dueDate))
    .limit(15);

  const activeHabits = await db
    .select({ id: habits.id, name: habits.name, target: habits.targetPerWeek })
    .from(habits)
    .where(eq(habits.active, true));
  const habitCounts = await db
    .select({ habitId: habitEntries.habitId, done: sql<number>`count(*)::int` })
    .from(habitEntries)
    .where(
      and(
        gte(habitEntries.day, weekStart),
        lte(habitEntries.day, weekEnd),
        eq(habitEntries.completed, true),
      ),
    )
    .groupBy(habitEntries.habitId);
  const doneByHabit = new Map(
    habitCounts.map((row) => [row.habitId, row.done]),
  );

  const activeGoals = await db
    .select({
      title: goals.title,
      unit: goals.unit,
      target: goals.targetValue,
      current: goals.currentValue,
    })
    .from(goals)
    .where(eq(goals.status, "active"))
    .limit(10);

  const [posted] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(drafts)
    .where(
      and(
        eq(drafts.status, "posted"),
        gte(drafts.postedAt, start),
        lt(drafts.postedAt, end),
      ),
    );

  const sleepValues = logs
    .filter((row) => row.sleepHours !== null)
    .map((row) => Number(row.sleepHours));
  const energyValues = logs
    .filter((row) => row.energy !== null)
    .map((row) => Number(row.energy));
  const average = (values: number[]) =>
    values.length
      ? Math.round(
          (values.reduce((sum, value) => sum + value, 0) / values.length) * 10,
        ) / 10
      : null;

  return {
    weekStart,
    weekEnd,
    days: logs.map((row) => ({ ...row, log: clip(row.log, 600) })),
    averages: {
      sleepHours: average(sleepValues),
      energy: average(energyValues),
      daysLogged: logs.filter((row) => row.log).length,
    },
    completedTasks,
    createdTaskCount: created?.total ?? 0,
    overdueOpenTasks: overdue,
    habits: activeHabits.map((habit) => ({
      name: habit.name,
      done: doneByHabit.get(habit.id) ?? 0,
      target: habit.target,
    })),
    goals: activeGoals,
    sales: await salesSummary(start, end),
    postsPublished: posted?.total ?? 0,
  };
}

export type WeekContext = Awaited<ReturnType<typeof weekContext>>;

export async function intentSnapshot() {
  const db = getDb();
  const [openTasks, activeHabits, activeGoals, pendingReminders, applications] =
    await Promise.all([
      db
        .select({ id: tasks.id, text: tasks.text, dueDate: tasks.dueDate })
        .from(tasks)
        .where(eq(tasks.status, "open"))
        .orderBy(asc(tasks.dueDate), asc(tasks.createdAt))
        .limit(25),
      db
        .select({ id: habits.id, name: habits.name })
        .from(habits)
        .where(eq(habits.active, true)),
      db
        .select({ id: goals.id, title: goals.title })
        .from(goals)
        .where(eq(goals.status, "active"))
        .limit(15),
      db
        .select({
          id: reminders.id,
          text: reminders.text,
          remindAt: reminders.remindAt,
        })
        .from(reminders)
        .where(eq(reminders.status, "pending"))
        .orderBy(asc(reminders.remindAt))
        .limit(10),
      db
        .select({
          id: jobApplications.id,
          company: jobApplications.company,
          role: jobApplications.role,
        })
        .from(jobApplications)
        .where(notInArray(jobApplications.status, ["rejected", "withdrawn"]))
        .orderBy(desc(jobApplications.createdAt))
        .limit(10),
    ]);

  return {
    openTasks: openTasks.map((task) => ({
      ...task,
      text: clip(task.text, 120),
    })),
    habits: activeHabits,
    goals: activeGoals,
    reminders: pendingReminders.map((item) => ({
      id: item.id,
      text: clip(item.text, 120),
      at: formatDateTime(item.remindAt),
    })),
    applications,
  };
}

export async function askContext(day: string) {
  const db = getDb();
  const recentLogs = await db
    .select({
      day: dailyLogs.day,
      log: dailyLogs.log,
      sleepHours: dailyLogs.sleepHours,
      energy: dailyLogs.energy,
    })
    .from(dailyLogs)
    .where(gte(dailyLogs.day, addDays(day, -6)))
    .orderBy(asc(dailyLogs.day));

  return {
    today: await dayContext(day),
    snapshot: await intentSnapshot(),
    recentLogs: recentLogs.map((row) => ({ ...row, log: clip(row.log, 400) })),
    salesLast7Days: await salesSummary(
      dayStartUtc(addDays(day, -6)),
      dayStartUtc(addDays(day, 1)),
    ),
  };
}
