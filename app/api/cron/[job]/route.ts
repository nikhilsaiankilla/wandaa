import { timingSafeEqual } from "node:crypto";
import { getCronSecret } from "@/lib/telegram/config";
import {
  markIntegrationFailed,
  markIntegrationOk,
  notifyOwner,
  sendDueReminders,
  sendEveningCheckIn,
  sendMorningPlan,
  sendWeeklyReview,
} from "@/lib/wanda/jobs";

export const maxDuration = 60;

type Context = { params: Promise<{ job: string }> };

function isAuthorized(request: Request, secret: string) {
  const header = request.headers.get("authorization") ?? "";
  const received = Buffer.from(header);
  const expected = Buffer.from(`Bearer ${secret}`);
  return (
    received.length === expected.length && timingSafeEqual(received, expected)
  );
}

async function runReminders() {
  try {
    const sent = await sendDueReminders();
    await markIntegrationOk("job:reminders");
    return { outcome: "ran", sent };
  } catch (error) {
    console.error("Reminder job failed", {
      reason: error instanceof Error ? error.name : "UnknownError",
    });
    if (await markIntegrationFailed("job:reminders", error)) {
      await notifyOwner(
        "Reminder delivery is failing. I’ll keep retrying every run.",
      ).catch(() => undefined);
    }
    return { outcome: "failed" };
  }
}

const jobs: Record<string, () => Promise<unknown>> = {
  reminders: runReminders,
  morning: async () => ({ outcome: await sendMorningPlan() }),
  evening: async () => ({ outcome: await sendEveningCheckIn() }),
  weekly: async () => ({ outcome: await sendWeeklyReview() }),
};

async function handle(request: Request, context: Context) {
  const isProd = process.env.NODE_ENV === "production" ? true : false;

  const secret = getCronSecret();

  if (isProd) {
    if (!secret) {
      return Response.json(
        { ok: false, error: "CRON_SECRET is not set." },
        { status: 503 },
      );
    }
    if (!isAuthorized(request, secret)) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  const { job } = await context.params;
  const run = Object.hasOwn(jobs, job) ? jobs[job] : undefined;
  if (!run)
    return Response.json({ ok: false, error: "Unknown job." }, { status: 404 });

  const result = await run();
  return Response.json({ ok: true, job, result });
}

export const GET = handle;
export const POST = handle;
