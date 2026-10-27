import "server-only";

import { and, asc, eq, lte, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { integrationState, jobRuns, reminders } from "@/db/schema";
import { sendTelegramMessage } from "@/lib/telegram/api";
import { getTelegramConfig } from "@/lib/telegram/config";
import {
  buildEveningPrompt,
  buildMorningPlan,
  buildWeeklyReview,
} from "./assistant";
import { clip, today, weekStartOf } from "./time";

export type JobOutcome = "ran" | "skipped" | "failed";

export function notifyOwner(text: string, silent = false) {
  return sendTelegramMessage(getTelegramConfig().ownerId, text, undefined, {
    silent,
  });
}

function describeError(error: unknown) {
  return clip(
    error instanceof Error
      ? `${error.name}: ${error.message}`
      : "Unknown error",
    300,
  );
}

export async function markIntegrationOk(source: string) {
  const now = new Date();
  await getDb()
    .insert(integrationState)
    .values({ source, lastRunAt: now, lastSuccessAt: now })
    .onConflictDoUpdate({
      target: integrationState.source,
      set: {
        lastRunAt: now,
        lastSuccessAt: now,
        lastError: null,
        failureCount: 0,
        alertedAt: null,
        updatedAt: now,
      },
    });
}

// Returns true when this failure should be reported, so one outage alerts once.
export async function markIntegrationFailed(source: string, error: unknown) {
  const now = new Date();
  const message = describeError(error);
  const [row] = await getDb()
    .insert(integrationState)
    .values({
      source,
      lastRunAt: now,
      lastErrorAt: now,
      lastError: message,
      failureCount: 1,
    })
    .onConflictDoUpdate({
      target: integrationState.source,
      set: {
        lastRunAt: now,
        lastErrorAt: now,
        lastError: message,
        failureCount: sql`${integrationState.failureCount} + 1`,
        updatedAt: now,
      },
    })
    .returning({ alertedAt: integrationState.alertedAt });

  if (row?.alertedAt) return false;
  await getDb()
    .update(integrationState)
    .set({ alertedAt: now })
    .where(eq(integrationState.source, source));
  return true;
}

export async function runJob(
  job: string,
  runKey: string,
  task: () => Promise<void>,
): Promise<JobOutcome> {
  const db = getDb();
  const [claimed] = await db
    .insert(jobRuns)
    .values({ job, runKey })
    .onConflictDoNothing()
    .returning({ id: jobRuns.id });

  let runId = claimed?.id;
  if (!runId) {
    const [retry] = await db
      .update(jobRuns)
      .set({
        status: "running",
        error: null,
        startedAt: new Date(),
        finishedAt: null,
      })
      .where(
        and(
          eq(jobRuns.job, job),
          eq(jobRuns.runKey, runKey),
          eq(jobRuns.status, "failed"),
        ),
      )
      .returning({ id: jobRuns.id });
    if (!retry) return "skipped";
    runId = retry.id;
  }

  try {
    await task();
    await db
      .update(jobRuns)
      .set({ status: "succeeded", finishedAt: new Date() })
      .where(eq(jobRuns.id, runId));
    await markIntegrationOk(`job:${job}`);
    return "ran";
  } catch (error) {
    const reason = describeError(error);
    console.error("Wandaa job failed", { job, runKey, reason });
    await db
      .update(jobRuns)
      .set({ status: "failed", error: reason, finishedAt: new Date() })
      .where(eq(jobRuns.id, runId));
    const shouldAlert = await markIntegrationFailed(`job:${job}`, error);
    if (shouldAlert) {
      await notifyOwner(
        `The ${job} job failed (${reason}). It will retry if the schedule triggers it again.`,
      ).catch(() => undefined);
    }
    return "failed";
  }
}

export async function sendDueReminders() {
  const db = getDb();
  const due = await db
    .select({ id: reminders.id, text: reminders.text })
    .from(reminders)
    .where(
      and(eq(reminders.status, "pending"), lte(reminders.remindAt, new Date())),
    )
    .orderBy(asc(reminders.remindAt))
    .limit(20);

  let sent = 0;
  for (const item of due) {
    const [claimed] = await db
      .update(reminders)
      .set({ status: "sent", sentAt: new Date() })
      .where(and(eq(reminders.id, item.id), eq(reminders.status, "pending")))
      .returning({ id: reminders.id });
    if (!claimed) continue;

    try {
      await notifyOwner(`Reminder: ${item.text}`);
      sent += 1;
    } catch (error) {
      await db
        .update(reminders)
        .set({ status: "pending", sentAt: null })
        .where(eq(reminders.id, item.id));
      throw error;
    }
  }
  return sent;
}

export function sendMorningPlan() {
  return runJob("morning-plan", today(), async () => {
    await notifyOwner(await buildMorningPlan(today()));
  });
}

export function sendEveningCheckIn() {
  return runJob("evening-check-in", today(), async () => {
    await notifyOwner(await buildEveningPrompt(today()));
  });
}

export function sendWeeklyReview() {
  const weekStart = weekStartOf(today());
  return runJob("weekly-review", weekStart, async () => {
    const summary = await buildWeeklyReview(weekStart);
    await notifyOwner(`Week of ${weekStart}\n\n${summary}`);
  });
}
