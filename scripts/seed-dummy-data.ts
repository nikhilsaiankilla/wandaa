/**
 * Seeds 30 days of dummy data so you can test the dashboard.
 *
 *   npx tsx scripts/seed-dummy-data.ts                  # this week = goated, last week = bad
 *   npx tsx scripts/seed-dummy-data.ts --current=bad    # this week = bad, last week = goated
 *   npx tsx scripts/seed-dummy-data.ts --current=mixed  # this week = mixed, last week = good
 *   npx tsx scripts/seed-dummy-data.ts --clean          # only remove seeded data
 *
 * Safe to re-run: it removes its own earlier rows first. Seeded rows are tagged:
 *   tasks       text starts with "[seed] "
 *   habits      name ends with " (demo)"   (entries are removed by cascade)
 *   daily_logs  summary = "[seed]"
 * Existing real daily logs for the same days are left untouched (not overwritten).
 */
import { eq, inArray, like } from "drizzle-orm";
import { getDb } from "@/db";
import { dailyLogs, habitEntries, habits, tasks } from "@/db/schema";

try {
  process.loadEnvFile(".env.local");
} catch {
  // env may already be loaded, or the file may not exist
}

const TZ = "Asia/Kolkata";
const TZ_OFFSET = "+05:30";
const DAYS = 30;
const TAG = "[seed]";

type Quality = "goated" | "good" | "mixed" | "bad";

const profile: Record<
  Quality,
  {
    sleep: [number, number];
    energy: [number, number];
    taskDone: number;
    habit: number;
  }
> = {
  goated: { sleep: [7.6, 8.7], energy: [4, 5], taskDone: 0.95, habit: 0.95 },
  good: { sleep: [7.0, 8.0], energy: [3, 4], taskDone: 0.8, habit: 0.75 },
  mixed: { sleep: [6.0, 7.5], energy: [2, 4], taskDone: 0.6, habit: 0.5 },
  bad: { sleep: [4.5, 6.0], energy: [1, 2], taskDone: 0.25, habit: 0.15 },
};

const demoHabits = [
  { name: "Workout (demo)", targetPerWeek: 4 },
  { name: "Reading (demo)", targetPerWeek: 5 },
  { name: "Meditation (demo)", targetPerWeek: 7 },
  { name: "Side project (demo)", targetPerWeek: 5 },
];

const taskPool: [string, string][] = [
  ["Reply to client emails", "Work"],
  ["Review pull requests", "Work"],
  ["Write weekly update", "Work"],
  ["Fix dashboard bug", "Work"],
  ["Plan next sprint", "Work"],
  ["Book dentist appointment", "Personal"],
  ["Pay electricity bill", "Personal"],
  ["Groceries", "Personal"],
  ["Call family", "Personal"],
  ["Meal prep", "Health"],
  ["Stretch for 15 minutes", "Health"],
  ["Update resume", "Career"],
  ["Apply to two jobs", "Career"],
];

// ---------- helpers ----------

// Deterministic so every run produces the same shape of data.
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(2026);
const between = (min: number, max: number) => min + rand() * (max - min);
const pick = <T>(items: T[]) => items[Math.floor(rand() * items.length)];

const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ });
const dayKey = (d: Date) => dayFmt.format(d);
function addDays(key: string, n: number) {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const at = (key: string, hour: number, minute: number) =>
  new Date(
    `${key}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00${TZ_OFFSET}`,
  );

function qualityFor(daysAgo: number, current: Quality): Quality {
  if (daysAgo <= 6) return current;
  if (daysAgo <= 13) {
    return current === "goated" ? "bad" : current === "bad" ? "goated" : "good";
  }
  // older days: alternate so the history is not flat
  return daysAgo % 3 === 0 ? "good" : daysAgo % 3 === 1 ? "mixed" : "good";
}

// ---------- cleanup ----------

async function clean() {
  const db = getDb();
  await db.delete(tasks).where(like(tasks.text, `${TAG}%`));
  await db.delete(dailyLogs).where(eq(dailyLogs.summary, TAG));
  await db.delete(habits).where(
    inArray(
      habits.name,
      demoHabits.map((h) => h.name),
    ),
  );
}

// ---------- seed ----------

async function seed(current: Quality) {
  const db = getDb();
  const now = new Date();
  const today = dayKey(now);

  await clean();

  const habitRows = await db
    .insert(habits)
    .values(demoHabits)
    .returning({ id: habits.id, name: habits.name });

  const logs: (typeof dailyLogs.$inferInsert)[] = [];
  const taskRows: (typeof tasks.$inferInsert)[] = [];
  const entries: (typeof habitEntries.$inferInsert)[] = [];

  for (let daysAgo = DAYS - 1; daysAgo >= 0; daysAgo--) {
    const day = addDays(today, -daysAgo);
    const q = qualityFor(daysAgo, current);
    const p = profile[q];

    // sleep + energy (skip a night now and then on mixed days so gaps show up)
    if (!(q === "mixed" && rand() < 0.15)) {
      logs.push({
        day,
        log: `Demo ${q} day.`,
        sleepHours: between(...p.sleep).toFixed(1),
        energy: Math.round(between(...p.energy)),
        summary: TAG,
      });
    }

    // tasks due that day
    const count = 3 + Math.floor(rand() * 3);
    for (let i = 0; i < count; i++) {
      const [label, project] = pick(taskPool);
      const done = rand() < p.taskDone;
      let status: "open" | "done" | "dropped" = "open";
      let completedAt: Date | null = null;

      if (done) {
        status = "done";
        completedAt = at(
          day,
          9 + Math.floor(rand() * 11),
          Math.floor(rand() * 60),
        );
        if (completedAt > now) completedAt = new Date(now.getTime() - 60_000);
      } else if (daysAgo >= 3 && rand() < 0.3) {
        status = "dropped";
      }

      taskRows.push({
        text: `${TAG} ${label}`,
        project,
        status,
        priority: rand() < 0.2 ? "high" : rand() < 0.3 ? "low" : "normal",
        dueDate: day,
        completedAt,
        createdAt: new Date(at(day, 0, 0).getTime() - 12 * 3_600_000),
      });
    }

    // habits
    for (const h of habitRows) {
      if (rand() < p.habit) {
        entries.push({ habitId: h.id, day, completed: true });
      }
    }
  }

  if (logs.length)
    await db.insert(dailyLogs).values(logs).onConflictDoNothing();
  if (taskRows.length) await db.insert(tasks).values(taskRows);
  if (entries.length)
    await db.insert(habitEntries).values(entries).onConflictDoNothing();

  console.log(
    `Seeded ${logs.length} daily logs, ${taskRows.length} tasks, ${entries.length} habit entries.`,
  );
  console.log(
    `Last 7 days: ${current}. Days 8-14 ago: ${qualityFor(10, current)}. Older: mixed/good.`,
  );
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--clean")) {
    await clean();
    console.log("Removed seeded data.");
    return;
  }
  const value = args.find((a) => a.startsWith("--current="))?.split("=")[1];
  const current: Quality =
    value === "bad" || value === "mixed" || value === "good" ? value : "goated";
  await seed(current);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });