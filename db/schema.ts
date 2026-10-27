import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

export const taskStatus = pgEnum("task_status", ["open", "done", "dropped"]);
export const taskPriority = pgEnum("task_priority", ["low", "normal", "high"]);
export const reminderStatus = pgEnum("reminder_status", [
  "pending",
  "sent",
  "cancelled",
]);
export const draftStatus = pgEnum("draft_status", [
  "pending",
  "approved",
  "rejected",
  "posted",
  "failed",
]);
export const goalStatus = pgEnum("goal_status", [
  "active",
  "achieved",
  "abandoned",
]);
export const inboxKind = pgEnum("inbox_kind", ["idea", "link", "note"]);
export const jobRunStatus = pgEnum("job_run_status", [
  "running",
  "succeeded",
  "failed",
]);
export const applicationStatus = pgEnum("application_status", [
  "saved",
  "applied",
  "interviewing",
  "offer",
  "rejected",
  "withdrawn",
]);

const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

export const goals = pgTable(
  "goals",
  {
    id: serial().primaryKey(),
    title: text().notNull(),
    unit: text(),
    targetValue: numeric("target_value", { precision: 16, scale: 2 }),
    currentValue: numeric("current_value", { precision: 16, scale: 2 })
      .notNull()
      .default("0"),
    startsOn: date("starts_on"),
    endsOn: date("ends_on"),
    status: goalStatus().notNull().default("active"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("goals_status_ends_idx").on(table.status, table.endsOn)],
);

export const tasks = pgTable(
  "tasks",
  {
    id: serial().primaryKey(),
    text: text().notNull(),
    status: taskStatus().notNull().default("open"),
    priority: taskPriority().notNull().default("normal"),
    project: text(),
    goalId: integer("goal_id").references(() => goals.id, {
      onDelete: "set null",
    }),
    dueDate: date("due_date"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("tasks_status_due_idx").on(table.status, table.dueDate),
    index("tasks_completed_at_idx").on(table.completedAt),
    check(
      "tasks_text_length",
      sql`char_length(${table.text}) between 1 and 500`,
    ),
  ],
);

export const reminders = pgTable(
  "reminders",
  {
    id: serial().primaryKey(),
    text: text().notNull(),
    remindAt: timestamp("remind_at", { withTimezone: true }).notNull(),
    status: reminderStatus().notNull().default("pending"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    index("reminders_status_remind_idx").on(table.status, table.remindAt),
  ],
);

export const dailyLogs = pgTable(
  "daily_logs",
  {
    day: date().primaryKey(),
    log: text().notNull().default(""),
    sleepHours: numeric("sleep_hours", { precision: 4, scale: 1 }),
    energy: integer(),
    summary: text(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    check("daily_logs_sleep_range", sql`${table.sleepHours} between 0 and 24`),
    check("daily_logs_energy_range", sql`${table.energy} between 1 and 5`),
  ],
);

export const habits = pgTable(
  "habits",
  {
    id: serial().primaryKey(),
    name: text().notNull().unique(),
    targetPerWeek: integer("target_per_week").notNull().default(7),
    active: boolean().notNull().default(true),
    createdAt: createdAt(),
  },
  (table) => [
    check("habits_target_range", sql`${table.targetPerWeek} between 1 and 7`),
  ],
);

export const habitEntries = pgTable(
  "habit_entries",
  {
    id: serial().primaryKey(),
    habitId: integer("habit_id")
      .notNull()
      .references(() => habits.id, { onDelete: "cascade" }),
    day: date().notNull(),
    completed: boolean().notNull().default(true),
    createdAt: createdAt(),
  },
  (table) => [
    unique().on(table.habitId, table.day),
    index("habit_entries_day_idx").on(table.day),
  ],
);

export const inboxItems = pgTable(
  "inbox_items",
  {
    id: serial().primaryKey(),
    kind: inboxKind().notNull().default("note"),
    content: text().notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [index("inbox_items_processed_idx").on(table.processedAt)],
);

export const metricSnapshots = pgTable(
  "metric_snapshots",
  {
    id: serial().primaryKey(),
    source: text().notNull(),
    product: text(),
    name: text().notNull(),
    value: numeric({ precision: 16, scale: 4 }).notNull(),
    unit: text(),
    details: jsonb(),
    capturedAt: timestamp("captured_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index().on(table.source, table.name, table.capturedAt),
    index("metric_snapshots_product_idx").on(table.product, table.capturedAt),
  ],
);

export const drafts = pgTable(
  "drafts",
  {
    id: serial().primaryKey(),
    platform: text().notNull().default("x"),
    content: text().notNull(),
    status: draftStatus().notNull().default("pending"),
    sourceDay: date("source_day"),
    externalId: text("external_id"),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    error: text(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("drafts_status_created_idx").on(table.status, table.createdAt),
  ],
);

export const notificationHistory = pgTable(
  "notification_history",
  {
    id: serial().primaryKey(),
    source: text().notNull(),
    eventKey: text("event_key").notNull(),
    kind: text().notNull(),
    summary: text().notNull(),
    details: jsonb(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("notification_history_source_event_key").on(
      table.source,
      table.eventKey,
    ),
    index().on(table.sentAt),
  ],
);

export const integrationState = pgTable("integration_state", {
  id: serial().primaryKey(),
  source: text().notNull().unique(),
  cursor: text(),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
  lastErrorAt: timestamp("last_error_at", { withTimezone: true }),
  lastError: text("last_error"),
  failureCount: integer("failure_count").notNull().default(0),
  alertedAt: timestamp("alerted_at", { withTimezone: true }),
  updatedAt: updatedAt(),
});

export const jobRuns = pgTable(
  "job_runs",
  {
    id: serial().primaryKey(),
    job: text().notNull(),
    runKey: text("run_key").notNull(),
    status: jobRunStatus().notNull().default("running"),
    error: text(),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (table) => [
    unique("job_runs_job_run_key").on(table.job, table.runKey),
    index("job_runs_started_idx").on(table.startedAt),
  ],
);

export const weeklyReviews = pgTable("weekly_reviews", {
  weekStart: date("week_start").primaryKey(),
  summary: text().notNull(),
  stats: jsonb(),
  model: text(),
  createdAt: createdAt(),
});

export const jobApplications = pgTable(
  "job_applications",
  {
    id: serial().primaryKey(),
    company: text().notNull(),
    role: text().notNull(),
    status: applicationStatus().notNull().default("applied"),
    appliedOn: date("applied_on"),
    followUpOn: date("follow_up_on"),
    url: text(),
    notes: text(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("job_applications_status_followup_idx").on(
      table.status,
      table.followUpOn,
    ),
  ],
);

export const processedUpdates = pgTable(
  "processed_updates",
  {
    updateId: bigint("update_id", { mode: "number" }).primaryKey(),
    eventType: text("event_type").notNull().default("other"),
    userHandle: text("user_handle"),
    actionPreview: text("action_preview"),
    status: text().notNull().default("received"),
    receivedAt: timestamp("received_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("processed_updates_received_at_idx").on(table.receivedAt)],
);

export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
export type DailyLog = typeof dailyLogs.$inferSelect;
export type Habit = typeof habits.$inferSelect;
export type Draft = typeof drafts.$inferSelect;
export type Reminder = typeof reminders.$inferSelect;
