import "server-only";

import { createHmac, randomBytes } from "node:crypto";
import { getXConfig } from "@/lib/telegram/config";

const TWEETS_URL = "https://api.x.com/2/tweets";

function percentEncode(value: string) {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function authorizationHeader(
  method: string,
  url: string,
  credentials: NonNullable<ReturnType<typeof getXConfig>>,
) {
  const oauth: Record<string, string> = {
    oauth_consumer_key: credentials.apiKey,
    oauth_nonce: randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_token: credentials.accessToken,
    oauth_version: "1.0",
  };

  const parameterString = Object.entries(oauth)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([key, value]) => `${percentEncode(key)}=${percentEncode(value)}`)
    .join("&");
  const baseString = [
    method.toUpperCase(),
    percentEncode(url),
    percentEncode(parameterString),
  ].join("&");
  const signingKey = `${percentEncode(credentials.apiSecret)}&${percentEncode(credentials.accessSecret)}`;
  const signature = createHmac("sha1", signingKey)
    .update(baseString)
    .digest("base64");

  const header = Object.entries({ ...oauth, oauth_signature: signature })
    .map(([key, value]) => `${percentEncode(key)}="${percentEncode(value)}"`)
    .join(", ");
  return `OAuth ${header}`;
}

export function isXConfigured() {
  return getXConfig() !== null;
}

export async function postToX(text: string) {
  const credentials = getXConfig();
  if (!credentials) throw new Error("X credentials are not configured.");

  const response = await fetch(TWEETS_URL, {
    method: "POST",
    headers: {
      authorization: authorizationHeader("POST", TWEETS_URL, credentials),
      "content-type": "application/json",
    },
    body: JSON.stringify({ text }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`X API returned ${response.status}.`);

  const payload = (await response.json()) as { data?: { id?: string } };
  if (!payload.data?.id) throw new Error("X returned no post id.");
  return { id: payload.data.id };
}
