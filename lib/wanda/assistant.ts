import "server-only";

import profile from "@/data/profile.json";
import { getDb } from "@/db";
import { weeklyReviews } from "@/db/schema";
import {
  askContext,
  dayContext,
  formatSales,
  weekContext,
  type DayContext,
  type WeekContext,
} from "./context";
import { generateText } from "./openai";
import { addDays, clip, today } from "./time";

export const X_POST_LIMIT = 280;

const owner = profile.owner;
const voiceNotes = profile.assistant.xVoice.notes as string[];

const BASE = `You are Wandaa, ${owner.name}'s private assistant inside Telegram. ${owner.name} is a ${owner.role.toLowerCase()} based in ${owner.location}. Write short, direct plain text. Do not use markdown, asterisks, pound-sign headings or emojis. Use only the data provided: never invent tasks, numbers, sales or events, and say so briefly when something is missing. Refer to tasks by their id like #12 when you mention them.`;

function json(value: unknown) {
  return JSON.stringify(value);
}

export async function answerQuestion(question: string) {
  return generateText({
    purpose: "ask",
    system: `${BASE} Answer the question using only the data. Keep it under 900 characters.`,
    input: `Question: ${question}\n\nData: ${json(await askContext(today()))}`,
    maxOutputTokens: 700,
  });
}

export async function buildDailySummary(day: string) {
  const context = await dayContext(day);
  return generateText({
    purpose: "daily-summary",
    system: `${BASE} Write a recap of the day: what got done, how sleep and energy looked if logged, habits, sales if any, and what is still open. Keep it under 900 characters.`,
    input: json(context),
    maxOutputTokens: 700,
  });
}

export async function draftPost(instruction: string) {
  const context = await dayContext(today());
  const voice = voiceNotes.length
    ? ` Voice notes from ${owner.name}: ${voiceNotes.join("; ")}.`
    : "";
  const system = `Write one post for X in first person as ${owner.name}, who builds products in public. Stay under ${X_POST_LIMIT} characters. Sound like a builder sharing real progress, not marketing. No hashtags and no emojis unless asked. Do not wrap the post in quotation marks. Use only facts from the data. Reply with the post text only.${voice}`;
  const input = `Instruction: ${instruction || "Write about what I got done today."}\n\nProducts: ${json(profile.products.map((item) => item.name))}\n\nToday: ${json(
    {
      log: context.log,
      completedTasks: context.completedTasks,
      sales: context.sales,
    },
  )}`;

  let post = stripQuotes(
    await generateText({
      purpose: "draft-post",
      system,
      input,
      smart: true,
      maxOutputTokens: 400,
    }),
  );
  if (post.length > X_POST_LIMIT) {
    post = stripQuotes(
      await generateText({
        purpose: "draft-post-shorten",
        system,
        input: `Shorten this to under ${X_POST_LIMIT} characters and keep the meaning:\n\n${post}`,
        smart: true,
        maxOutputTokens: 400,
      }),
    );
  }
  if (post.length > X_POST_LIMIT) {
    throw new Error("Draft stayed over the post limit.");
  }
  return post;
}

function stripQuotes(text: string) {
  return text
    .trim()
    .replace(/^["“”]+|["“”]+$/g, "")
    .trim();
}

function plainMorning(day: string, today: DayContext) {
  const lines = [`Good morning. Today is ${day}.`];
  if (today.dueTasks.length) {
    lines.push(
      "Due or overdue:",
      ...today.dueTasks
        .slice(0, 5)
        .map(
          (task) => `#${task.id} ${clip(task.text, 100)} (due ${task.dueDate})`,
        ),
    );
  } else {
    lines.push(`Nothing is due. You have ${today.openTaskCount} open tasks.`);
  }
  if (today.habitsPending.length) {
    lines.push(`Habits to do: ${today.habitsPending.join(", ")}.`);
  }
  return lines.join("\n");
}

export async function buildMorningPlan(day: string) {
  const [todayContext, yesterday] = await Promise.all([
    dayContext(day),
    dayContext(addDays(day, -1)),
  ]);
  try {
    return await generateText({
      purpose: "morning-plan",
      system: `${BASE} Write this morning's plan. Start with one line on yesterday if there is data (what got done, sleep). Then give up to 3 top priorities picked from the due and open tasks, then habits still to do and any sales from yesterday. Keep it under 900 characters. If there are no tasks, say so and suggest adding some with /add.`,
      input: json({ today: todayContext, yesterday }),
      maxOutputTokens: 700,
    });
  } catch (error) {
    console.error("Morning plan AI failed, using plain version", {
      reason: error instanceof Error ? error.name : "UnknownError",
    });
    return plainMorning(day, todayContext);
  }
}

export async function buildEveningPrompt(day: string) {
  const context = await dayContext(day);
  const lines = ["Evening check-in. What did you get done today?"];
  if (context.completedTasks.length) {
    lines.push(
      "",
      "Tasks you completed:",
      ...context.completedTasks
        .slice(0, 8)
        .map((task) => `#${task.id} ${clip(task.text, 100)}`),
    );
  }
  if (context.dueTasks.length) {
    lines.push(
      "",
      "Still open and due:",
      ...context.dueTasks
        .slice(0, 5)
        .map((task) => `#${task.id} ${clip(task.text, 100)}`),
    );
  }
  if (context.habitsPending.length) {
    lines.push(
      "",
      `Habits not logged yet: ${context.habitsPending.join(", ")}.`,
    );
  }
  if (context.sales.length) {
    lines.push("", `Sales today:\n${formatSales(context.sales)}`);
  }
  lines.push(
    "",
    "Just reply in your own words or send a voice note. Mention sleep and energy if you like.",
  );
  return lines.join("\n");
}

function plainWeekly(context: WeekContext) {
  const lines = [
    `Tasks completed: ${context.completedTasks.length}. Tasks created: ${context.createdTaskCount}.`,
    `Days logged: ${context.averages.daysLogged}.`,
  ];
  if (context.averages.sleepHours !== null) {
    lines.push(`Average sleep: ${context.averages.sleepHours} hours.`);
  }
  if (context.habits.length) {
    lines.push(
      `Habits: ${context.habits.map((habit) => `${habit.name} ${habit.done}/${habit.target}`).join(", ")}.`,
    );
  }
  if (context.sales.length) lines.push(formatSales(context.sales));
  if (context.overdueOpenTasks.length) {
    lines.push(`${context.overdueOpenTasks.length} tasks are overdue.`);
  }
  return lines.join("\n");
}

export async function buildWeeklyReview(weekStart: string) {
  const context = await weekContext(weekStart);
  let summary: string;
  let model: string | null = null;
  try {
    summary = await generateText({
      purpose: "weekly-review",
      system: `${BASE} Write the weekly review in four short parts labelled Wins, What slipped, Numbers, and Focus for next week (at most 3 items). Numbers covers sales, sleep, energy and habits when there is data. Keep it under 1800 characters.`,
      input: json(context),
      smart: true,
      maxOutputTokens: 1200,
    });
    model = "openai";
  } catch (error) {
    console.error("Weekly review AI failed, using plain version", {
      reason: error instanceof Error ? error.name : "UnknownError",
    });
    summary = plainWeekly(context);
  }

  await getDb()
    .insert(weeklyReviews)
    .values({ weekStart, summary, stats: context, model })
    .onConflictDoUpdate({
      target: weeklyReviews.weekStart,
      set: { summary, stats: context, model },
    });
  return summary;
}
