import { and, asc, desc, eq, isNull, lte, notInArray } from "drizzle-orm";
import { getDb } from "@/db";
import {
  applicationStatus,
  dailyLogs,
  drafts,
  goals,
  habitEntries,
  habits,
  inboxItems,
  integrationState,
  jobApplications,
  reminders,
  tasks,
  weeklyReviews,
} from "@/db/schema";
import {
  X_POST_LIMIT,
  answerQuestion,
  buildDailySummary,
  buildWeeklyReview,
  draftPost,
} from "@/lib/wanda/assistant";
import { formatSales, salesSummary } from "@/lib/wanda/context";
import { understandMessage, type Intent } from "@/lib/wanda/intent";
import { AiUnavailableError } from "@/lib/wanda/openai";
import {
  addDays,
  clip,
  dayStartUtc,
  formatDateTime,
  isRealDate,
  today,
  weekStartOf,
  zonedTimeToUtc,
} from "@/lib/wanda/time";
import { isXConfigured, postToX } from "@/lib/wanda/x";
import type { InlineKeyboardMarkup } from "./api";

type MessageResult = { text: string; replyMarkup?: InlineKeyboardMarkup };
type CallbackResult = {
  answer: string;
  message?: string;
  clearButtons?: boolean;
};

const TELEGRAM_TEXT_LIMIT = 4000;
const SLASH_COMMAND = /^\/(\w+)(?:@\w+)?(?:\s+([\s\S]*))?$/;

function parseId(input: string) {
  const trimmed = input.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const id = Number(trimmed);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function errorReason(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
}

async function withAi(
  task: () => Promise<MessageResult>,
): Promise<MessageResult> {
  try {
    return await task();
  } catch (error) {
    if (error instanceof AiUnavailableError) return { text: error.message };
    throw error;
  }
}

function help(): string {
  return [
    "Talk to me in plain language or send a voice note, for example:",
    "“done with the pricing page, slept 6h, remind me Friday 5pm to renew the domain”",
    "",
    "Or use commands.",
    "",
    "Tasks",
    "/add <task> [| YYYY-MM-DD] or add: <task>",
    "/tasks, /today",
    "/done <id>, /drop <id>",
    "",
    "Daily life",
    "/log <update> or /log to read today’s",
    "/sleep <hours> [energy 1-5]",
    "/habits, /habit add <name>, /habit done <id>, /habit archive <id>",
    "/summary for a recap of today",
    "",
    "Reminders and goals",
    "/remind <text> | in 30m   or   | YYYY-MM-DD HH:mm",
    "/reminders, /cancel <reminder id>",
    "/goals, /goal add <title> | <target> | <unit>",
    "/goal set <id> <value>, /goal done <id>, /goal drop <id>",
    "",
    "Capture",
    "/idea <text>, /link <url>, /note <text>",
    "/inbox, /inbox done <id>",
    "",
    "Job search",
    "/apply <company> | <role> | YYYY-MM-DD (optional follow-up)",
    "/apps, /app <id> <status>",
    "",
    "Posts, sales and reviews",
    "/tweet [topic] writes a draft, /draft <text> saves your own",
    "/drafts to review pending posts",
    "/sales [days]",
    "/week, /week new",
    "/ask <question> about your tasks, logs and numbers",
    "/status",
  ].join("\n");
}

function parseTaskInput(input: string) {
  const dueMatch = /^(.*?)\s*\|\s*(\d{4}-\d{2}-\d{2})$/.exec(input.trim());
  const text = (dueMatch ? dueMatch[1] : input).trim();
  const dueDate = dueMatch?.[2];

  if (!text || text.length > 500) return null;
  if (dueDate && !isRealDate(dueDate)) return null;
  return { text, dueDate };
}

async function addTask(input: string): Promise<MessageResult> {
  const task = parseTaskInput(input);
  if (!task)
    return {
      text: "Send a task up to 500 characters, optionally followed by | YYYY-MM-DD.",
    };

  const [created] = await getDb()
    .insert(tasks)
    .values(task)
    .returning({ id: tasks.id });
  return { text: `Added task #${created.id}: ${task.text}` };
}

async function listTasks(): Promise<MessageResult> {
  const openTasks = await getDb()
    .select({ id: tasks.id, text: tasks.text, dueDate: tasks.dueDate })
    .from(tasks)
    .where(eq(tasks.status, "open"))
    .orderBy(asc(tasks.dueDate), asc(tasks.createdAt))
    .limit(20);

  if (!openTasks.length) return { text: "You have no open tasks." };
  return {
    text: openTasks
      .map(
        (task) =>
          `#${task.id} ${task.text.slice(0, 120)}${task.dueDate ? ` (due ${task.dueDate})` : ""}`,
      )
      .join("\n"),
    replyMarkup: {
      inline_keyboard: openTasks.map((task) => [
        {
          text: `✓ #${task.id}`,
          callback_data: `task:done:${task.id}`,
        },
        {
          text: `Drop #${task.id}`,
          callback_data: `task:drop:${task.id}`,
        },
      ]),
    },
  };
}

async function showToday(): Promise<MessageResult> {
  const dueTasks = await getDb()
    .select({ id: tasks.id, text: tasks.text, dueDate: tasks.dueDate })
    .from(tasks)
    .where(and(eq(tasks.status, "open"), lte(tasks.dueDate, today())))
    .orderBy(asc(tasks.dueDate), asc(tasks.createdAt))
    .limit(10);

  const lines = dueTasks.length
    ? dueTasks.map(
        (task) =>
          `#${task.id} ${task.text.slice(0, 120)} (due ${task.dueDate})`,
      )
    : ["Nothing is due today or overdue."];
  return { text: [`Today (${today()})`, ...lines].join("\n") };
}

async function setTaskStatus(
  id: number,
  status: "done" | "dropped",
): Promise<CallbackResult> {
  const now = new Date();
  const [updated] = await getDb()
    .update(tasks)
    .set({
      status,
      completedAt: status === "done" ? now : null,
      updatedAt: now,
    })
    .where(and(eq(tasks.id, id), eq(tasks.status, "open")))
    .returning({ id: tasks.id });

  if (updated)
    return { answer: status === "done" ? "Task completed." : "Task dropped." };
  const [existing] = await getDb()
    .select({ status: tasks.status })
    .from(tasks)
    .where(eq(tasks.id, id));
  return {
    answer: existing
      ? `Task is already ${existing.status}.`
      : "Task not found.",
  };
}

async function saveLog(text: string): Promise<MessageResult> {
  const content = text.trim();
  if (!content) {
    const [entry] = await getDb()
      .select({ log: dailyLogs.log })
      .from(dailyLogs)
      .where(eq(dailyLogs.day, today()));
    return {
      text: entry?.log || "No daily log saved yet. Add one with /log <text>.",
    };
  }

  const day = today();
  await getDb()
    .insert(dailyLogs)
    .values({ day, log: content })
    .onConflictDoUpdate({
      target: dailyLogs.day,
      set: { log: content, updatedAt: new Date() },
    });
  return { text: `Saved today’s log (${day}).` };
}

async function saveSleep(input: string): Promise<MessageResult> {
  const match = /^(\d{1,2}(?:\.\d)?)(?:\s+([1-5]))?$/.exec(input.trim());
  if (!match || Number(match[1]) > 24) {
    return {
      text: "Use /sleep <hours 0-24> [energy 1-5], for example /sleep 7.5 4.",
    };
  }

  const day = today();
  const energy = match[2] ? Number(match[2]) : null;
  await getDb()
    .insert(dailyLogs)
    .values({ day, log: "", sleepHours: match[1], energy })
    .onConflictDoUpdate({
      target: dailyLogs.day,
      set: {
        sleepHours: match[1],
        ...(energy !== null ? { energy } : {}),
        updatedAt: new Date(),
      },
    });
  return {
    text: energy
      ? `Saved sleep and energy for ${day}.`
      : `Saved sleep for ${day}.`,
  };
}

async function listHabits(): Promise<MessageResult> {
  const db = getDb();
  const rows = await db
    .select({ id: habits.id, name: habits.name })
    .from(habits)
    .where(eq(habits.active, true))
    .orderBy(asc(habits.name));
  if (!rows.length)
    return { text: "No habits yet. Add one with /habit add <name>." };

  const doneToday = await db
    .select({ habitId: habitEntries.habitId })
    .from(habitEntries)
    .where(
      and(eq(habitEntries.day, today()), eq(habitEntries.completed, true)),
    );
  const doneIds = new Set(doneToday.map((entry) => entry.habitId));
  return {
    text: rows
      .map(
        (habit) =>
          `${doneIds.has(habit.id) ? "✓" : "·"} #${habit.id} ${habit.name}`,
      )
      .join("\n"),
  };
}

async function handleHabit(input: string): Promise<MessageResult> {
  const add = /^add\s+(.+)$/i.exec(input.trim());
  if (add) {
    const name = add[1].trim();
    if (name.length > 100)
      return { text: "Habit names must be 100 characters or fewer." };
    const [habit] = await getDb()
      .insert(habits)
      .values({ name })
      .onConflictDoNothing()
      .returning({ id: habits.id });
    return {
      text: habit
        ? `Added habit #${habit.id}: ${name}`
        : "That habit already exists.",
    };
  }

  const done = /^done\s+(\d+)$/i.exec(input.trim());
  if (done) {
    const habitId = parseId(done[1]);
    if (!habitId) return { text: "Use /habit done <habit id>." };
    const [habit] = await getDb()
      .select({ id: habits.id })
      .from(habits)
      .where(and(eq(habits.id, habitId), eq(habits.active, true)));
    if (!habit) return { text: "Active habit not found." };
    await getDb()
      .insert(habitEntries)
      .values({ habitId, day: today(), completed: true })
      .onConflictDoUpdate({
        target: [habitEntries.habitId, habitEntries.day],
        set: { completed: true },
      });
    return { text: `Logged habit #${habitId} for today.` };
  }

  const archive = /^archive\s+(\d+)$/i.exec(input.trim());
  if (archive) {
    const habitId = parseId(archive[1]);
    if (!habitId) return { text: "Use /habit archive <habit id>." };
    const [habit] = await getDb()
      .update(habits)
      .set({ active: false })
      .where(and(eq(habits.id, habitId), eq(habits.active, true)))
      .returning({ id: habits.id });
    return {
      text: habit ? `Archived habit #${habitId}.` : "Active habit not found.",
    };
  }

  return {
    text: "Use /habit add <name>, /habit done <id>, or /habit archive <id>.",
  };
}

function parseReminderTime(input: string): Date | null {
  const relative = /^in\s+(\d{1,3})\s*([mhd])$/i.exec(input);
  if (relative) {
    const amount = Number(relative[1]);
    if (amount <= 0) return null;
    const unit = relative[2].toLowerCase();
    const unitMs =
      unit === "m" ? 60_000 : unit === "h" ? 3_600_000 : 86_400_000;
    return new Date(Date.now() + amount * unitMs);
  }

  const absolute = /^(\d{4}-\d{2}-\d{2})\s+(\d{1,2}):(\d{2})$/.exec(input);
  if (!absolute) return null;
  const hour = Number(absolute[2]);
  const minute = Number(absolute[3]);
  if (hour > 23 || minute > 59 || !isRealDate(absolute[1])) return null;
  return zonedTimeToUtc(absolute[1], hour, minute);
}

async function addReminder(input: string): Promise<MessageResult> {
  const usage = {
    text: "Use /remind <text> | in 30m, or /remind <text> | YYYY-MM-DD HH:mm (your local time).",
  };
  const match = /^([\s\S]+)\|([^|]+)$/.exec(input.trim());
  if (!match) return usage;

  const text = match[1].trim();
  const remindAt = parseReminderTime(match[2].trim());
  if (!text || text.length > 500 || !remindAt) return usage;
  if (remindAt.getTime() <= Date.now())
    return { text: "That time is already in the past." };

  const [created] = await getDb()
    .insert(reminders)
    .values({ text, remindAt })
    .returning({ id: reminders.id });
  return {
    text: `Reminder #${created.id} set for ${formatDateTime(remindAt)}.`,
  };
}

async function listReminders(): Promise<MessageResult> {
  const pending = await getDb()
    .select({
      id: reminders.id,
      text: reminders.text,
      remindAt: reminders.remindAt,
    })
    .from(reminders)
    .where(eq(reminders.status, "pending"))
    .orderBy(asc(reminders.remindAt))
    .limit(10);

  if (!pending.length) return { text: "No pending reminders." };
  return {
    text: pending
      .map(
        (item) =>
          `#${item.id} ${formatDateTime(item.remindAt)} — ${item.text.slice(0, 120)}`,
      )
      .join("\n"),
    replyMarkup: {
      inline_keyboard: pending.map((item) => [
        {
          text: `Cancel #${item.id}`,
          callback_data: `reminder:cancel:${item.id}`,
        },
      ]),
    },
  };
}

async function cancelReminder(id: number): Promise<CallbackResult> {
  const [updated] = await getDb()
    .update(reminders)
    .set({ status: "cancelled" })
    .where(and(eq(reminders.id, id), eq(reminders.status, "pending")))
    .returning({ id: reminders.id });

  if (updated) return { answer: "Reminder cancelled." };
  const [existing] = await getDb()
    .select({ status: reminders.status })
    .from(reminders)
    .where(eq(reminders.id, id));
  return {
    answer: existing
      ? `Reminder is already ${existing.status}.`
      : "Reminder not found.",
  };
}

async function listGoals(): Promise<MessageResult> {
  const rows = await getDb()
    .select({
      id: goals.id,
      title: goals.title,
      unit: goals.unit,
      targetValue: goals.targetValue,
      currentValue: goals.currentValue,
    })
    .from(goals)
    .where(eq(goals.status, "active"))
    .orderBy(asc(goals.createdAt))
    .limit(15);

  if (!rows.length)
    return {
      text: "No active goals. Add one with /goal add <title> | <target> | <unit>.",
    };
  return {
    text: rows
      .map((goal) => {
        const progress = goal.targetValue
          ? `${goal.currentValue}/${goal.targetValue}`
          : goal.currentValue;
        return `#${goal.id} ${goal.title.slice(0, 100)} — ${progress}${goal.unit ? ` ${goal.unit}` : ""}`;
      })
      .join("\n"),
  };
}

async function handleGoal(input: string): Promise<MessageResult> {
  const trimmed = input.trim();

  const add =
    /^add\s+([^|]+)\|\s*(\d{1,12}(?:\.\d{1,2})?)\s*(?:\|\s*(.+))?$/i.exec(
      trimmed,
    );
  if (add) {
    const title = add[1].trim();
    const unit = add[3]?.trim() || null;
    if (!title || title.length > 200 || (unit && unit.length > 30)) {
      return {
        text: "Use /goal add <title up to 200 chars> | <target number> | <unit>.",
      };
    }
    const [created] = await getDb()
      .insert(goals)
      .values({ title, targetValue: add[2], unit })
      .returning({ id: goals.id });
    return { text: `Added goal #${created.id}: ${title}` };
  }

  const set = /^set\s+(\d+)\s+(\d{1,12}(?:\.\d{1,2})?)$/i.exec(trimmed);
  if (set) {
    const id = parseId(set[1]);
    if (!id) return { text: "Use /goal set <id> <value>." };
    const [updated] = await getDb()
      .update(goals)
      .set({ currentValue: set[2] })
      .where(and(eq(goals.id, id), eq(goals.status, "active")))
      .returning({ id: goals.id });
    return {
      text: updated
        ? `Updated goal #${id} to ${set[2]}.`
        : "Active goal not found.",
    };
  }

  const finish = /^(done|drop)\s+(\d+)$/i.exec(trimmed);
  if (finish) {
    const id = parseId(finish[2]);
    if (!id) return { text: "Use /goal done <id> or /goal drop <id>." };
    const status =
      finish[1].toLowerCase() === "done" ? "achieved" : "abandoned";
    const [updated] = await getDb()
      .update(goals)
      .set({ status })
      .where(and(eq(goals.id, id), eq(goals.status, "active")))
      .returning({ id: goals.id });
    return {
      text: updated
        ? `Goal #${id} marked ${status}.`
        : "Active goal not found.",
    };
  }

  return {
    text: "Use /goals, /goal add <title> | <target> | <unit>, /goal set <id> <value>, /goal done <id>, or /goal drop <id>.",
  };
}

async function addInboxItem(
  kind: "idea" | "link" | "note",
  input: string,
): Promise<MessageResult> {
  const content = input.trim();
  if (!content)
    return { text: `Use /${kind} <${kind === "link" ? "url" : "text"}>.` };
  if (content.length > 2000)
    return { text: "That’s too long. Keep it under 2000 characters." };
  if (kind === "link" && !/^https?:\/\/\S+$/i.test(content)) {
    return { text: "Send a link that starts with http:// or https://." };
  }

  const [created] = await getDb()
    .insert(inboxItems)
    .values({ kind, content })
    .returning({ id: inboxItems.id });
  return { text: `Saved ${kind} #${created.id} to your inbox.` };
}

async function handleInbox(input: string): Promise<MessageResult> {
  const done = /^done\s+(\d+)$/i.exec(input.trim());
  if (done) {
    const id = parseId(done[1]);
    if (!id) return { text: "Use /inbox done <id>." };
    const [updated] = await getDb()
      .update(inboxItems)
      .set({ processedAt: new Date() })
      .where(and(eq(inboxItems.id, id), isNull(inboxItems.processedAt)))
      .returning({ id: inboxItems.id });
    return {
      text: updated
        ? `Cleared inbox item #${id}.`
        : "Open inbox item not found.",
    };
  }

  if (input.trim()) return { text: "Use /inbox or /inbox done <id>." };

  const items = await getDb()
    .select({
      id: inboxItems.id,
      kind: inboxItems.kind,
      content: inboxItems.content,
    })
    .from(inboxItems)
    .where(isNull(inboxItems.processedAt))
    .orderBy(desc(inboxItems.createdAt))
    .limit(10);
  if (!items.length) return { text: "Your inbox is empty." };
  return {
    text: items
      .map((item) => `#${item.id} [${item.kind}] ${clip(item.content, 150)}`)
      .join("\n"),
  };
}

async function addApplication(input: string): Promise<MessageResult> {
  const usage = {
    text: "Use /apply <company> | <role> | YYYY-MM-DD (follow-up date is optional).",
  };
  const match = /^([^|]+)\|([^|]+)(?:\|\s*(\d{4}-\d{2}-\d{2}))?\s*$/.exec(
    input.trim(),
  );
  if (!match) return usage;

  const company = match[1].trim();
  const role = match[2].trim();
  const followUpOn = match[3];
  if (!company || !role || company.length > 150 || role.length > 150)
    return usage;
  if (followUpOn && !isRealDate(followUpOn)) return usage;

  const [created] = await getDb()
    .insert(jobApplications)
    .values({ company, role, appliedOn: today(), followUpOn })
    .returning({ id: jobApplications.id });
  return { text: `Logged application #${created.id}: ${role} at ${company}.` };
}

async function listApplications(): Promise<MessageResult> {
  const rows = await getDb()
    .select({
      id: jobApplications.id,
      company: jobApplications.company,
      role: jobApplications.role,
      status: jobApplications.status,
      followUpOn: jobApplications.followUpOn,
    })
    .from(jobApplications)
    .where(notInArray(jobApplications.status, ["rejected", "withdrawn"]))
    .orderBy(asc(jobApplications.followUpOn), desc(jobApplications.createdAt))
    .limit(15);

  if (!rows.length)
    return {
      text: "No active applications. Add one with /apply <company> | <role>.",
    };
  return {
    text: rows
      .map(
        (row) =>
          `#${row.id} ${row.role} at ${row.company} [${row.status}]${row.followUpOn ? ` follow up ${row.followUpOn}` : ""}`,
      )
      .join("\n"),
  };
}

async function updateApplication(input: string): Promise<MessageResult> {
  const statuses = applicationStatus.enumValues;
  const usage = {
    text: `Use /app <id> <status>. Statuses: ${statuses.join(", ")}.`,
  };
  const match = /^(\d+)\s+(\w+)$/.exec(input.trim());
  if (!match) return usage;

  const id = parseId(match[1]);
  const status = statuses.find((value) => value === match[2].toLowerCase());
  if (!id || !status) return usage;

  const [updated] = await getDb()
    .update(jobApplications)
    .set({ status })
    .where(eq(jobApplications.id, id))
    .returning({ id: jobApplications.id });
  return {
    text: updated
      ? `Application #${id} is now ${status}.`
      : "Application not found.",
  };
}

async function createDraft(input: string): Promise<MessageResult> {
  const content = input.trim();
  if (!content) return { text: "Use /draft <post text>." };
  if (content.length > X_POST_LIMIT) {
    return {
      text: `That draft is ${content.length} characters. The limit is ${X_POST_LIMIT}.`,
    };
  }

  const [created] = await getDb()
    .insert(drafts)
    .values({ content, sourceDay: today() })
    .returning({ id: drafts.id });
  return {
    text: `Draft #${created.id}\n\n${content}`,
    replyMarkup: {
      inline_keyboard: [
        [
          { text: "Approve", callback_data: `draft:approve:${created.id}` },
          { text: "Reject", callback_data: `draft:reject:${created.id}` },
        ],
      ],
    },
  };
}

async function createAiDraft(instruction: string): Promise<MessageResult> {
  let post: string;
  try {
    post = await draftPost(instruction.trim());
  } catch (error) {
    if (error instanceof AiUnavailableError) throw error;
    console.error("Draft generation failed", { reason: errorReason(error) });
    return {
      text: `I couldn’t write a post that fits in ${X_POST_LIMIT} characters. Try again, or save your own with /draft <text>.`,
    };
  }
  return createDraft(post);
}

async function listDrafts(): Promise<MessageResult> {
  const pending = await getDb()
    .select({ id: drafts.id, content: drafts.content })
    .from(drafts)
    .where(eq(drafts.status, "pending"))
    .orderBy(desc(drafts.createdAt))
    .limit(5);

  if (!pending.length)
    return {
      text: "No pending drafts. Create one with /tweet or /draft <post text>.",
    };
  return {
    text: pending
      .map((draft) => `#${draft.id} ${clip(draft.content, 200)}`)
      .join("\n\n"),
    replyMarkup: {
      inline_keyboard: pending.map((draft) => [
        {
          text: `Approve #${draft.id}`,
          callback_data: `draft:approve:${draft.id}`,
        },
        {
          text: `Reject #${draft.id}`,
          callback_data: `draft:reject:${draft.id}`,
        },
      ]),
    },
  };
}

async function setDraftStatus(
  id: number,
  status: "approved" | "rejected",
): Promise<CallbackResult> {
  const db = getDb();

  if (status === "approved" && !isXConfigured()) {
    return {
      answer: "X isn’t connected yet.",
      message:
        "Posting to X isn’t set up. Add X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN and X_ACCESS_TOKEN_SECRET to the environment. The draft stays pending until then.",
    };
  }

  const [claimed] = await db
    .update(drafts)
    .set({ status })
    .where(and(eq(drafts.id, id), eq(drafts.status, "pending")))
    .returning({ id: drafts.id, content: drafts.content });

  if (!claimed) {
    const [existing] = await db
      .select({ status: drafts.status })
      .from(drafts)
      .where(eq(drafts.id, id));
    return {
      answer: existing
        ? `Draft is already ${existing.status}.`
        : "Draft not found.",
    };
  }

  if (status === "rejected") {
    return { answer: "Draft rejected.", clearButtons: true };
  }

  let postId: string;
  try {
    postId = (await postToX(claimed.content)).id;
  } catch (error) {
    const reason = errorReason(error);
    await db
      .update(drafts)
      .set({ status: "pending", error: clip(reason, 300) })
      .where(eq(drafts.id, id));
    return {
      answer: "Posting failed.",
      message: `Couldn’t post draft #${id} (${reason}). It’s still pending, so tap Approve to retry.`,
    };
  }

  await db
    .update(drafts)
    .set({
      status: "posted",
      externalId: postId,
      postedAt: new Date(),
      error: null,
    })
    .where(eq(drafts.id, id));
  return {
    answer: "Posted to X.",
    message: `Posted draft #${id}: https://x.com/i/status/${postId}`,
    clearButtons: true,
  };
}

async function handleWeek(input: string): Promise<MessageResult> {
  if (input.trim().toLowerCase() === "new") {
    return withAi(async () => {
      const weekStart = weekStartOf(today());
      const summary = await buildWeeklyReview(weekStart);
      return { text: `Week of ${weekStart}\n\n${summary}` };
    });
  }

  const [latest] = await getDb()
    .select({
      weekStart: weeklyReviews.weekStart,
      summary: weeklyReviews.summary,
    })
    .from(weeklyReviews)
    .orderBy(desc(weeklyReviews.weekStart))
    .limit(1);

  if (!latest)
    return {
      text: "No weekly review saved yet. Send /week new to write one for this week.",
    };
  return { text: `Week of ${latest.weekStart}\n\n${latest.summary}` };
}

async function showSales(input: string): Promise<MessageResult> {
  const requested = input.trim() ? parseId(input) : 7;
  if (!requested) return { text: "Use /sales or /sales <days>." };

  const days = Math.min(requested, 90);
  const rows = await salesSummary(
    dayStartUtc(addDays(today(), -(days - 1))),
    dayStartUtc(addDays(today(), 1)),
  );
  if (!rows.length) {
    return {
      text: `No sales recorded in the last ${days} ${days === 1 ? "day" : "days"}. They appear here once your payment webhook is connected.`,
    };
  }
  return {
    text: `Last ${days} ${days === 1 ? "day" : "days"}\n${formatSales(rows)}`,
  };
}

async function showStatus(): Promise<MessageResult> {
  const rows = await getDb()
    .select({
      source: integrationState.source,
      lastSuccessAt: integrationState.lastSuccessAt,
      failureCount: integrationState.failureCount,
    })
    .from(integrationState)
    .orderBy(asc(integrationState.source));

  if (!rows.length)
    return {
      text: "Nothing has reported in yet. Jobs and webhooks show up here after their first run.",
    };
  return {
    text: rows
      .map((row) => {
        const last = row.lastSuccessAt
          ? formatDateTime(row.lastSuccessAt)
          : "never";
        return `${row.source}: last ok ${last}${row.failureCount ? `, ${row.failureCount} failures in a row` : ""}`;
      })
      .join("\n"),
  };
}

async function route(message: string): Promise<MessageResult> {
  const trimmed = message.trim();
  const shortcutAdd = /^add:\s*(.+)$/i.exec(trimmed);
  if (shortcutAdd) return addTask(shortcutAdd[1]);

  const shortcutLog = /^log:\s*(.+)$/i.exec(trimmed);
  if (shortcutLog) return saveLog(shortcutLog[1]);

  const match = SLASH_COMMAND.exec(trimmed);
  if (!match) return { text: help() };
  const command = match[1].toLowerCase();
  const argument = match[2] ?? "";

  switch (command) {
    case "start":
    case "help":
      return { text: help() };
    case "add":
      return addTask(argument);
    case "tasks":
      return listTasks();
    case "today":
    case "plan":
      return showToday();
    case "done":
    case "drop": {
      const id = parseId(argument);
      if (!id) return { text: `Use /${command} <task id>.` };
      const result = await setTaskStatus(
        id,
        command === "done" ? "done" : "dropped",
      );
      return { text: result.answer };
    }
    case "log":
      return saveLog(argument);
    case "sleep":
      return saveSleep(argument);
    case "habits":
      return listHabits();
    case "habit":
      return handleHabit(argument);
    case "remind":
      return addReminder(argument);
    case "reminders":
      return listReminders();
    case "cancel": {
      const id = parseId(argument);
      if (!id) return { text: "Use /cancel <reminder id>." };
      const result = await cancelReminder(id);
      return { text: result.answer };
    }
    case "goals":
      return listGoals();
    case "goal":
      return handleGoal(argument);
    case "idea":
    case "link":
    case "note":
      return addInboxItem(command, argument);
    case "inbox":
      return handleInbox(argument);
    case "apply":
      return addApplication(argument);
    case "apps":
      return listApplications();
    case "app":
      return updateApplication(argument);
    case "draft":
      return createDraft(argument);
    case "tweet":
      return withAi(() => createAiDraft(argument));
    case "drafts":
      return listDrafts();
    case "week":
    case "review":
      return handleWeek(argument);
    case "summary":
      return withAi(async () => ({ text: await buildDailySummary(today()) }));
    case "ask":
    case "chat": {
      if (!argument.trim()) return { text: "Use /ask <question>." };
      return withAi(async () => ({
        text: await answerQuestion(argument.trim()),
      }));
    }
    case "sales":
    case "metrics":
      return showSales(argument);
    case "status":
      return showStatus();
    default:
      return { text: `I don’t know /${command} yet.\n\n${help()}` };
  }
}

async function runIntent(intent: Intent): Promise<MessageResult> {
  if (intent.action === "unknown") {
    return {
      text: "I couldn’t tell what you want to do. Try asking to add a task, save a daily log, or show your tasks, or send /help.",
    };
  }

  try {
    return await route(
      `/${intent.action}${intent.argument ? ` ${intent.argument}` : ""}`,
    );
  } catch (error) {
    if (error instanceof AiUnavailableError) return { text: error.message };
    console.error("Intent action failed", {
      action: intent.action,
      reason: error instanceof Error ? error.name : "UnknownError",
    });
    return {
      text: `I couldn’t finish /${intent.action}. Please try it again.`,
    };
  }
}

async function handleNaturalLanguage(message: string): Promise<MessageResult> {
  let intents: Intent[];
  try {
    intents = await understandMessage(message);
  } catch (error) {
    if (error instanceof AiUnavailableError) return { text: error.message };
    console.error("Intent parsing failed", {
      reason: error instanceof Error ? error.name : "UnknownError",
    });
    return {
      text: "I couldn’t work out that message right now. Slash commands still work; send /help to see them.",
    };
  }

  const results: MessageResult[] = [];
  for (const intent of intents) {
    results.push(await runIntent(intent));
  }
  if (results.length === 1) return results[0];

  const markup = [...results]
    .reverse()
    .find((item) => item.replyMarkup)?.replyMarkup;
  return {
    text: results.map((item) => item.text).join("\n\n"),
    ...(markup ? { replyMarkup: markup } : {}),
  };
}

export async function handleTelegramMessage(
  message: string,
): Promise<MessageResult> {
  const trimmed = message.trim();
  const isCommand = SLASH_COMMAND.test(trimmed);
  const isShortcut = /^(?:add|log):\s*.+$/i.test(trimmed);
  const result =
    isCommand || isShortcut
      ? await route(trimmed)
      : await handleNaturalLanguage(trimmed);
  return { ...result, text: clip(result.text, TELEGRAM_TEXT_LIMIT) };
}

export async function handleTelegramCallback(
  data: string,
): Promise<CallbackResult> {
  const match =
    /^(task|draft|reminder):(done|drop|approve|reject|cancel):(\d+)$/.exec(
      data,
    );
  if (!match) return { answer: "This action isn’t available." };

  const [, kind, action] = match;
  const id = parseId(match[3]);
  if (!id) return { answer: "This action isn’t available." };

  if (kind === "task" && (action === "done" || action === "drop")) {
    return setTaskStatus(id, action === "done" ? "done" : "dropped");
  }
  if (kind === "draft" && (action === "approve" || action === "reject")) {
    return setDraftStatus(id, action === "approve" ? "approved" : "rejected");
  }
  if (kind === "reminder" && action === "cancel") {
    return cancelReminder(id);
  }
  return { answer: "This action isn’t available." };
}
