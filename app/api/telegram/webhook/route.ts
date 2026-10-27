import { timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { processedUpdates } from "@/db/schema";
import {
  handleTelegramCallback,
  handleTelegramMessage,
} from "@/lib/telegram/handlers";
import {
  answerTelegramCallback,
  clearTelegramButtons,
  downloadTelegramFile,
  sendTelegramMessage,
  sendTelegramTyping,
} from "@/lib/telegram/api";
import { getOpenAIConfig, getTelegramConfig } from "@/lib/telegram/config";
import { AiUnavailableError, transcribeAudio } from "@/lib/wanda/openai";

export const maxDuration = 60;

type TelegramUpdate = {
  update_id?: number;
  message?: {
    from?: { id?: number; username?: string };
    chat?: { id?: number; type?: string };
    text?: string;
    voice?: { file_id?: string; duration?: number; file_size?: number };
  };
  callback_query?: {
    id?: string;
    data?: string;
    from?: { id?: number; username?: string };
    message?: { message_id?: number; chat?: { id?: number; type?: string } };
  };
};

const MAX_VOICE_BYTES = 10 * 1024 * 1024;
const MAX_VOICE_SECONDS = 300;

const ok = () => Response.json({ ok: true });

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeUpdate(value: unknown): TelegramUpdate {
  if (!isRecord(value)) {
    throw new Error("Invalid Telegram update.");
  }
  return value as TelegramUpdate;
}

function hasValidSecret(request: Request, webhookSecret: string) {
  const received = Buffer.from(
    request.headers.get("x-telegram-bot-api-secret-token") ?? "",
  );
  const expected = Buffer.from(webhookSecret);
  return (
    expected.length === received.length && timingSafeEqual(expected, received)
  );
}

// Telegram retries updates it thinks failed, so each update id is claimed once.
async function claimUpdate(
  updateId: number,
  eventType: "message" | "voice" | "callback" | "other",
  userHandle: string | null,
  actionPreview: string,
) {
  const claimed = await getDb()
    .insert(processedUpdates)
    .values({ updateId, eventType, userHandle, actionPreview })
    .onConflictDoNothing()
    .returning({ updateId: processedUpdates.updateId });
  return claimed.length > 0;
}

async function markUpdate(updateId: number | undefined, status: "delivered" | "failed") {
  if (updateId === undefined) return;
  await getDb()
    .update(processedUpdates)
    .set({ status })
    .where(eq(processedUpdates.updateId, updateId));
}

async function reportFailure(chatId: number, callbackId?: string) {
  try {
    if (callbackId) {
      await answerTelegramCallback(
        callbackId,
        "Something went wrong. Try again.",
      );
    } else {
      await sendTelegramMessage(
        chatId,
        "Something went wrong handling that. Please send it again.",
      );
    }
  } catch {
    // The failure is already logged by the caller, nothing more to do here.
  }
}

function startTyping(chatId: number) {
  sendTelegramTyping(chatId).catch(() => undefined);
}

async function transcribeVoice(
  chatId: number,
  voice: NonNullable<NonNullable<TelegramUpdate["message"]>["voice"]>,
) {
  if (!voice.file_id) return null;
  if (!getOpenAIConfig()) {
    await sendTelegramMessage(
      chatId,
      "Voice notes need OPENAI_API_KEY configured. Send text for now.",
    );
    return null;
  }
  if (
    (voice.duration && voice.duration > MAX_VOICE_SECONDS) ||
    (voice.file_size && voice.file_size > MAX_VOICE_BYTES)
  ) {
    await sendTelegramMessage(
      chatId,
      "That voice note is too long. Keep it under 5 minutes.",
    );
    return null;
  }

  startTyping(chatId);
  try {
    const audio = await downloadTelegramFile(voice.file_id, MAX_VOICE_BYTES);
    const transcript = await transcribeAudio(audio, "voice.ogg");
    if (!transcript) {
      await sendTelegramMessage(
        chatId,
        "I couldn’t make out any words in that voice note.",
      );
      return null;
    }
    return transcript;
  } catch (error) {
    if (error instanceof AiUnavailableError) {
      await sendTelegramMessage(chatId, error?.message);
      return null;
    }
    throw error;
  }
}

export async function POST(request: Request) {
  let updateId: number | undefined;

  try {
    const { ownerId, webhookSecret } = getTelegramConfig();

    if (!hasValidSecret(request, webhookSecret)) {
      return new Response("Unauthorized", { status: 401 });
    }

    let update: TelegramUpdate;
    try {
      update = safeUpdate(await request.json());
    } catch {
      return new Response("Bad Request", { status: 400 });
    }
    updateId = update.update_id;

    let chatId: number;
    let text: string | undefined;
    let voice: NonNullable<TelegramUpdate["message"]>["voice"];
    let callbackId: string | undefined;
    let callbackData: string | undefined;
    let callbackMessageId: number | undefined;
    let userHandle: string | null;

    if (update.message) {
      const { from, chat } = update.message;
      if (from?.id !== ownerId || chat?.type !== "private" || !chat.id) {
        return ok();
      }
      chatId = chat.id;
      userHandle = from.username ? `@${from.username}` : null;
      text = update.message.text;
      voice = update.message.voice;
    } else if (update.callback_query) {
      const callback = update.callback_query;
      const chat = callback.message?.chat;
      if (
        callback.from?.id !== ownerId ||
        chat?.type !== "private" ||
        !chat.id ||
        !callback.id
      ) {
        return ok();
      }
      chatId = chat.id;
      userHandle = callback.from?.username ? `@${callback.from.username}` : null;
      callbackId = callback.id;
      callbackData = callback.data;
      callbackMessageId = callback.message?.message_id;
    } else {
      return ok();
    }

    const eventType = callbackId
      ? "callback"
      : voice
        ? "voice"
        : typeof text === "string" && text.trim()
          ? "message"
          : "other";
    const actionPreview = callbackData
      ? callbackData.split(":").slice(0, 2).join(":")
      : text
        ? /^\/(\w+)/.exec(text.trim())?.[0] ?? "Natural language message"
        : voice
          ? "Voice message received"
          : "Unsupported update";

    if (
      updateId !== undefined &&
      !(await claimUpdate(
        updateId,
        eventType,
        userHandle,
        actionPreview.slice(0, 120),
      ))
    ) {
      console.info("Telegram update skipped", {
        updateId,
        reason: "duplicate",
      });
      return ok();
    }

    try {
      if (callbackId) {
        console.info("Telegram update received", {
          updateId,
          type: "callback",
        });
        const result = await handleTelegramCallback(callbackData ?? "");
        await answerTelegramCallback(callbackId, result.answer);
        if (result.clearButtons && callbackMessageId) {
          await clearTelegramButtons(chatId, callbackMessageId).catch(
            () => undefined,
          );
        }
        if (result.message) {
          await sendTelegramMessage(chatId, result.message);
        }
        console.info("Telegram update delivered", {
          updateId,
          type: "callback",
          messageSent: Boolean(result.message),
        });
        await markUpdate(updateId, "delivered");
        return ok();
      }

      let heard: string | undefined;
      if (voice && !text) {
        const transcript = await transcribeVoice(chatId, voice);
        if (!transcript) {
          await markUpdate(updateId, "delivered");
          return ok();
        }
        text = transcript;
        heard = transcript;
      }

      if (typeof text === "string" && text.trim()) {
        console.info("Telegram update received", {
          updateId,
          type: heard ? "voice" : "message",
          characters: text.length,
          command:
            /^\/(\w+)/.exec(text.trim())?.[1]?.toLowerCase() ??
            "natural_language",
        });
        startTyping(chatId);
        const reply = await handleTelegramMessage(text);
        const body = heard ? `Heard: “${heard}”\n\n${reply.text}` : reply.text;
        await sendTelegramMessage(chatId, body, reply.replyMarkup);
        console.info("Telegram update delivered", {
          updateId,
          type: heard ? "voice" : "message",
          responseCharacters: body.length,
          hasButtons: Boolean(reply.replyMarkup),
        });
      } else {
        await sendTelegramMessage(
          chatId,
          "I understand text and voice notes for now.",
        );
        console.info("Telegram update delivered", {
          updateId,
          type: "unsupported",
        });
      }
      await markUpdate(updateId, "delivered");
    } catch (error) {
      console.log('error ', error)
      console.error("Telegram update handling failed", {
        updateId,
        reason: error instanceof Error ? error.name : "UnknownError",
      });
      await markUpdate(updateId, "failed").catch(() => undefined);
      await reportFailure(chatId, callbackId);
    }

    return ok();
  } catch (error) {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? String(error.code)
        : undefined;
    console.error("Telegram webhook failed", {
      updateId,
      reason: error instanceof Error ? error.name : "UnknownError",
      code,
    });
    return Response.json({ ok: false }, { status: 500 });
  }
}
