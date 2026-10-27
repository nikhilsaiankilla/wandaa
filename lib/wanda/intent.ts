import "server-only";

import { intentSnapshot } from "./context";
import { generateJson } from "./openai";
import { timezone, today, weekdayName } from "./time";

export const INTENT_ACTIONS = [
  "add",
  "tasks",
  "today",
  "done",
  "drop",
  "log",
  "sleep",
  "habits",
  "habit",
  "remind",
  "reminders",
  "cancel",
  "goals",
  "goal",
  "idea",
  "link",
  "note",
  "inbox",
  "apply",
  "apps",
  "app",
  "draft",
  "drafts",
  "tweet",
  "summary",
  "week",
  "sales",
  "status",
  "help",
  "chat",
  "unknown",
] as const;

export type Intent = {
  action: (typeof INTENT_ACTIONS)[number];
  argument: string;
};

const MAX_ACTIONS = 5;

const SYSTEM = `You turn the owner's Telegram message into 1 to ${MAX_ACTIONS} actions for the Wandaa assistant bot. Reply only with the structured result.

Rules:
- The argument is exactly what would follow the slash command, in the format shown below. Use an empty string when the action takes no argument.
- One message can contain several actions, for example a daily update, a sleep entry and a request for a post.
- Resolve relative dates such as "tomorrow" or "next Friday" to real dates using today's date below. Task dates are YYYY-MM-DD. Reminder times are either "in 30m" style or "YYYY-MM-DD HH:mm" in 24-hour local time.
- Refer to existing items only by ids that appear in the lists below. If the owner refers to an item you cannot match to a listed id, use chat instead.
- Use log for past-tense updates about what the owner did today. Keep their wording and do not embellish.
- Use chat for questions or conversation about their own data or plans. The argument is the question as asked.
- Use tweet when they ask you to write or draft a post. The argument is the topic or instruction, or empty to base it on today.
- Use draft only when they dictate the exact post text.
- Never invent text, ids, numbers or dates. If unsure, use unknown with an empty argument.

Actions and argument formats:
add: "<task text>" or "<task text> | YYYY-MM-DD"
tasks, today, habits, reminders, goals, inbox, apps, drafts, status, summary, help: empty
done, drop: "<task id>"
log: "<what the owner did today>"
sleep: "<hours>" or "<hours> <energy 1-5>"
habit: "add <name>" or "done <habit id>" or "archive <habit id>"
remind: "<text> | in 30m" or "<text> | YYYY-MM-DD HH:mm"
cancel: "<reminder id>"
goal: "add <title> | <target number> | <unit>" or "set <goal id> <value>" or "done <goal id>" or "drop <goal id>"
idea, note: "<text>"
link: "<url>"
inbox: empty, or "done <inbox id>"
apply: "<company> | <role>" or "<company> | <role> | YYYY-MM-DD"
app: "<application id> <saved|applied|interviewing|offer|rejected|withdrawn>"
draft: "<exact post text>"
tweet: "<topic or instruction>" or empty
week: empty, or "new" to generate this week's review
sales: empty, or a number of days
chat: "<question>"
unknown: empty`;

const SCHEMA = {
  type: "object",
  properties: {
    actions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          action: { type: "string", enum: [...INTENT_ACTIONS] },
          argument: { type: "string" },
        },
        required: ["action", "argument"],
        additionalProperties: false,
      },
    },
  },
  required: ["actions"],
  additionalProperties: false,
};

function isIntentAction(value: unknown): value is Intent["action"] {
  return INTENT_ACTIONS.includes(value as Intent["action"]);
}

export async function understandMessage(message: string): Promise<Intent[]> {
  const snapshot = await intentSnapshot();
  const system = `${SYSTEM}

Today is ${today()} (${weekdayName()}). Timezone: ${timezone()}.

Existing items you may refer to by id:
${JSON.stringify(snapshot)}`;

  const parsed = await generateJson({
    purpose: "intent",
    system,
    input: message,
    schemaName: "wanda_intents",
    schema: SCHEMA,
    maxOutputTokens: 800,
  });

  const rawActions =
    parsed && typeof parsed === "object" && "actions" in parsed
      ? (parsed as { actions: unknown }).actions
      : null;
  if (!Array.isArray(rawActions))
    throw new Error("OpenAI returned an invalid intent.");

  const intents: Intent[] = [];
  for (const item of rawActions.slice(0, MAX_ACTIONS)) {
    if (!item || typeof item !== "object") continue;
    const { action, argument } = item as Record<string, unknown>;
    if (isIntentAction(action) && typeof argument === "string") {
      intents.push({ action, argument: argument.trim() });
    }
  }
  return intents.length ? intents : [{ action: "unknown", argument: "" }];
}
