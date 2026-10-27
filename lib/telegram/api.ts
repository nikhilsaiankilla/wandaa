import "server-only";

import { getTelegramConfig } from "./config";

export type InlineKeyboardMarkup = {
  inline_keyboard: { text: string; callback_data: string }[][];
};

const MESSAGE_LIMIT = 4096;

async function callTelegram<T = unknown>(
  method: string,
  body: Record<string, unknown>,
): Promise<T> {
  const { botToken } = getTelegramConfig();
  const response = await fetch(
    `https://api.telegram.org/bot${botToken}/${method}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );

  const result = (await response.json()) as {
    ok?: boolean;
    result?: T;
    error_code?: number;
  };
  if (!response.ok || !result.ok) {
    throw new Error(
      `Telegram API rejected ${method} (${result.error_code ?? response.status}).`,
    );
  }
  return result.result as T;
}

export function sendTelegramMessage(
  chatId: number,
  text: string,
  replyMarkup?: InlineKeyboardMarkup,
  options: { silent?: boolean } = {},
) {
  return callTelegram("sendMessage", {
    chat_id: chatId,
    text:
      text.length > MESSAGE_LIMIT
        ? `${text.slice(0, MESSAGE_LIMIT - 1)}…`
        : text,
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    ...(options.silent ? { disable_notification: true } : {}),
  });
}

export function answerTelegramCallback(callbackQueryId: string, text: string) {
  return callTelegram("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    text,
  });
}

export function clearTelegramButtons(chatId: number, messageId: number) {
  return callTelegram("editMessageReplyMarkup", {
    chat_id: chatId,
    message_id: messageId,
    reply_markup: { inline_keyboard: [] },
  });
}

export function sendTelegramTyping(chatId: number) {
  return callTelegram("sendChatAction", { chat_id: chatId, action: "typing" });
}

export async function downloadTelegramFile(fileId: string, maxBytes: number) {
  const { botToken } = getTelegramConfig();
  const file = await callTelegram<{ file_path?: string; file_size?: number }>(
    "getFile",
    { file_id: fileId },
  );
  if (!file.file_path) throw new Error("Telegram returned no file path.");
  if (file.file_size && file.file_size > maxBytes) {
    throw new Error("Telegram file is too large.");
  }

  const response = await fetch(
    `https://api.telegram.org/file/bot${botToken}/${file.file_path}`,
  );
  if (!response.ok) {
    throw new Error(`Telegram file download failed (${response.status}).`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > maxBytes)
    throw new Error("Telegram file is too large.");
  return bytes;
}
