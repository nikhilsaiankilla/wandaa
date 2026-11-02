// app/api/dashboard/habits/route.ts
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { getDb } from "@/db";
import { habitEntries, habits } from "@/db/schema";
import type { CellState, DashboardAnalytics, HabitGrid } from "@/lib/types";
import {
  addDays,
  createTimer,
  dayKey,
  keysBetween,
  type Win,
} from "@/lib/dashboard-utils";

type HabitsPayload = DashboardAnalytics["habits"];

async function getHabitGrids(now = new Date()): Promise<HabitsPayload> {
  const timer = createTimer("habits");
  const db = getDb();
  timer.mark("getDb()");

  const today = dayKey(now);
  const thisWeek: Win = { start: addDays(today, -6), end: today };

  const dow = new Date(`${today}T00:00:00Z`).getUTCDay();
  const monday = addDays(today, -((dow + 6) % 7));
  const gridStart = addDays(monday, -364); // 53 week columns, current week last

  const [habitRows, entryRows] = await timer.wrap("queries (total)", () =>
    Promise.all([
      timer.wrap("h1 habits", () =>
        db
          .select()
          .from(habits)
          .where(eq(habits.active, true))
          .orderBy(asc(habits.id)),
      ),
      timer.wrap("h2 habitEntries (365d)", () =>
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
      ),
    ]),
  );

  console.log("[timing] habits row counts", {
    habits: habitRows.length,
    entries: entryRows.length,
  });
  timer.mark("after DB (row counts)");

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
  timer.mark("compute: habit grids");

  console.log(`[timing] habits TOTAL ${timer.total()}ms`, timer.steps());
  return { gridStart, today, habits: habitGrids };
}

// ---------- route handler ----------

const headers = { "Cache-Control": "private, no-store, max-age=0" };

export async function GET() {
  const reqStart = performance.now();
  console.log("[timing] GET /api/dashboard/habits received");

  try {
    const data = await getHabitGrids();
    const t1 = performance.now();
    const body = JSON.stringify(data);
    const t2 = performance.now();

    const total = Math.round(t2 - reqStart);
    console.log(
      `[timing] GET /api/dashboard/habits done: queries+compute ${Math.round(t1 - reqStart)}ms, ` +
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
    console.error("Dashboard habits failed", {
      reason: error instanceof Error ? error.message : "UnknownError",
      afterMs: Math.round(performance.now() - reqStart),
    });
    return Response.json(
      { error: "Could not load habit data." },
      { status: 500, headers },
    );
  }
}