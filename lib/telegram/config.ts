import "server-only";

function positiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function getTelegramConfig() {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const ownerId = Number(process.env.TELEGRAM_OWNER_ID);
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;

  if (
    !botToken ||
    !Number.isSafeInteger(ownerId) ||
    ownerId <= 0 ||
    !webhookSecret ||
    !/^[A-Za-z0-9_-]{1,256}$/.test(webhookSecret)
  ) {
    throw new Error(
      "Set TELEGRAM_BOT_TOKEN, TELEGRAM_OWNER_ID, and a valid TELEGRAM_WEBHOOK_SECRET.",
    );
  }

  return { botToken, ownerId, webhookSecret };
}

export function getOpenAIConfig() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  return {
    apiKey,
    model,
    smartModel: process.env.OPENAI_SMART_MODEL || model,
    transcribeModel:
      process.env.OPENAI_TRANSCRIBE_MODEL || "gpt-4o-mini-transcribe",
    dailyTokenCap: positiveInt(process.env.OPENAI_DAILY_TOKEN_CAP, 200_000),
  };
}

export function getCronSecret() {
  const secret = process.env.CRON_SECRET;
  return secret && secret.length >= 16 ? secret : null;
}

export function getSalesWebhookSecret() {
  const secret = process.env.SALES_WEBHOOK_SECRET;
  return secret && secret.length >= 16 ? secret : null;
}

export function getXConfig() {
  const apiKey = process.env.X_API_KEY;
  const apiSecret = process.env.X_API_SECRET;
  const accessToken = process.env.X_ACCESS_TOKEN;
  const accessSecret = process.env.X_ACCESS_TOKEN_SECRET;
  return apiKey && apiSecret && accessToken && accessSecret
    ? { apiKey, apiSecret, accessToken, accessSecret }
    : null;
}

export function isTelegramOwner(userId: number) {
  return userId === getTelegramConfig().ownerId;
}