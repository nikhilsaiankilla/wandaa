import "server-only";

import { and, eq, gte, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { metricSnapshots } from "@/db/schema";
import { getOpenAIConfig } from "@/lib/telegram/config";
import { dayStartUtc, today } from "./time";

export class AiUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiUnavailableError";
  }
}

type ResponsesPayload = {
  output?: { content?: { type?: string; text?: string }[] }[];
  usage?: { total_tokens?: number };
};

type TextOptions = {
  purpose: string;
  system: string;
  input: string;
  smart?: boolean;
  maxOutputTokens?: number;
};

const REQUEST_TIMEOUT_MS = 45_000;

function requireConfig() {
  const config = getOpenAIConfig();
  if (!config) {
    throw new AiUnavailableError(
      "AI features need OPENAI_API_KEY configured. Slash commands still work; send /help to see them.",
    );
  }
  return config;
}

async function tokensUsedToday() {
  const [row] = await getDb()
    .select({ total: sql<string>`coalesce(sum(${metricSnapshots.value}), 0)` })
    .from(metricSnapshots)
    .where(
      and(
        eq(metricSnapshots.source, "openai"),
        eq(metricSnapshots.name, "tokens"),
        gte(metricSnapshots.capturedAt, dayStartUtc(today())),
      ),
    );
  return Number(row?.total ?? 0);
}

async function assertWithinBudget(cap: number) {
  if ((await tokensUsedToday()) >= cap) {
    throw new AiUnavailableError(
      "Today’s AI limit is reached, so AI features are paused until tomorrow. Slash commands still work.",
    );
  }
}

async function recordUsage(purpose: string, model: string, tokens: number) {
  if (!tokens) return;
  try {
    await getDb()
      .insert(metricSnapshots)
      .values({
        source: "openai",
        name: "tokens",
        value: String(tokens),
        unit: "tokens",
        details: { purpose, model },
      });
  } catch {
    console.error("Could not record OpenAI usage", { purpose });
  }
}

async function callResponses(
  options: TextOptions,
  format?: Record<string, unknown>,
) {
  const config = requireConfig();
  await assertWithinBudget(config.dailyTokenCap);

  const model = options.smart ? config.smartModel : config.model;
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      instructions: options.system,
      input: options.input,
      max_output_tokens: options.maxOutputTokens ?? 1200,
      store: false,
      ...(format ? { text: { format } } : {}),
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`OpenAI API returned ${response.status}.`);

  const payload = (await response.json()) as ResponsesPayload;
  await recordUsage(options.purpose, model, payload.usage?.total_tokens ?? 0);

  const text = payload.output
    ?.flatMap((item) => item.content ?? [])
    .find((item) => item.type === "output_text")?.text;
  if (!text?.trim()) throw new Error("OpenAI returned no output.");
  return text.trim();
}

export function generateText(options: TextOptions) {
  return callResponses(options);
}

export async function generateJson(
  options: TextOptions & {
    schemaName: string;
    schema: Record<string, unknown>;
  },
): Promise<unknown> {
  const text = await callResponses(options, {
    type: "json_schema",
    name: options.schemaName,
    strict: true,
    schema: options.schema,
  });
  return JSON.parse(text);
}

export async function transcribeAudio(audio: Uint8Array, filename: string) {
  const config = requireConfig();
  await assertWithinBudget(config.dailyTokenCap);

  const form = new FormData();
  form.append("model", config.transcribeModel);
  form.append("file", new Blob([new Uint8Array(audio)]), filename);

  const response = await fetch(
    "https://api.openai.com/v1/audio/transcriptions",
    {
      method: "POST",
      headers: { authorization: `Bearer ${config.apiKey}` },
      body: form,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    },
  );
  if (!response.ok) {
    throw new Error(`OpenAI transcription returned ${response.status}.`);
  }

  const payload = (await response.json()) as {
    text?: string;
    usage?: { total_tokens?: number };
  };
  await recordUsage(
    "transcribe",
    config.transcribeModel,
    payload.usage?.total_tokens ?? 0,
  );
  return (payload.text ?? "").trim();
}
