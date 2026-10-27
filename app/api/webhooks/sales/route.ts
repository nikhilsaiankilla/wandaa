import { timingSafeEqual } from "node:crypto";
import { getDb } from "@/db";
import { metricSnapshots, notificationHistory } from "@/db/schema";
import { getSalesWebhookSecret } from "@/lib/telegram/config";
import { money, productName, salesSummary } from "@/lib/wanda/context";
import {
  markIntegrationFailed,
  markIntegrationOk,
  notifyOwner,
} from "@/lib/wanda/jobs";
import { addDays, dayStartUtc, isQuietHours, today } from "@/lib/wanda/time";

export const maxDuration = 30;

const MAX_BODY_BYTES = 10_000;

type SaleEvent = {
  id: string;
  kind: "sale" | "refund";
  product: string;
  amount: number;
  currency: string;
  customer: string | null;
  plan: string | null;
};

function hasValidSecret(request: Request, secret: string) {
  const received = Buffer.from(request.headers.get("x-wanda-secret") ?? "");
  const expected = Buffer.from(secret);
  return (
    received.length === expected.length && timingSafeEqual(received, expected)
  );
}

function optionalString(value: unknown, max: number) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, max)
    : null;
}

function parseEvent(value: unknown): SaleEvent | null {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return null;
  const body = value as Record<string, unknown>;

  const id = optionalString(body.id, 200);
  const product = optionalString(body.product, 100);
  const currency = optionalString(body.currency, 10);
  const amount = typeof body.amount === "number" ? body.amount : Number.NaN;
  const kind =
    body.kind === "refund"
      ? "refund"
      : body.kind === undefined || body.kind === "sale"
        ? "sale"
        : null;

  if (!id || !product || !currency || !kind) return null;
  if (!Number.isFinite(amount) || amount < 0 || amount > 1e9) return null;

  return {
    id,
    kind,
    product: product.toLowerCase(),
    amount,
    currency: currency.toUpperCase(),
    customer: optionalString(body.customer, 100),
    plan: optionalString(body.plan, 100),
  };
}

export async function POST(request: Request) {
  const secret = getSalesWebhookSecret();
  if (!secret) {
    return Response.json(
      { ok: false, error: "SALES_WEBHOOK_SECRET is not set." },
      { status: 503 },
    );
  }
  if (!hasValidSecret(request, secret)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return new Response("Payload Too Large", { status: 413 });
  }

  let event: SaleEvent | null;
  try {
    event = parseEvent(JSON.parse(raw));
  } catch {
    event = null;
  }
  if (!event) {
    return Response.json(
      { ok: false, error: "Send id, product, amount and currency." },
      { status: 400 },
    );
  }

  try {
    const db = getDb();
    const name = productName(event.product);
    const summary =
      event.kind === "refund"
        ? `Refund on ${name}: ${money(event.currency, event.amount)}`
        : `New sale on ${name}: ${money(event.currency, event.amount)}`;

    const [claimed] = await db
      .insert(notificationHistory)
      .values({
        source: "sales",
        eventKey: event.id,
        kind: event.kind,
        summary,
        details: { customer: event.customer, plan: event.plan },
      })
      .onConflictDoNothing()
      .returning({ id: notificationHistory.id });
    if (!claimed) return Response.json({ ok: true, duplicate: true });

    await db.insert(metricSnapshots).values({
      source: "sales",
      product: event.product,
      name: event.kind,
      value: String(event.amount),
      unit: event.currency,
      details: {
        eventId: event.id,
        customer: event.customer,
        plan: event.plan,
      },
    });

    const todayRows = await salesSummary(
      dayStartUtc(today()),
      dayStartUtc(addDays(today(), 1)),
    );
    const todayForProduct = todayRows.find(
      (row) => row.product === event.product && row.unit === event.currency,
    );

    const lines = [summary];
    if (event.plan) lines.push(`Plan: ${event.plan}`);
    if (todayForProduct) {
      lines.push(
        `Today on ${name}: ${todayForProduct.count} ${todayForProduct.count === 1 ? "sale" : "sales"}, net ${money(event.currency, todayForProduct.net)}`,
      );
    }

    try {
      await notifyOwner(lines.join("\n"), isQuietHours());
      await markIntegrationOk("webhook:sales");
    } catch (error) {
      console.error("Sales alert could not be delivered", {
        reason: error instanceof Error ? error.name : "UnknownError",
      });
      await markIntegrationFailed("webhook:sales", error);
    }

    return Response.json({ ok: true });
  } catch (error) {
    console.error("Sales webhook failed", {
      reason: error instanceof Error ? error.name : "UnknownError",
    });
    return Response.json({ ok: false }, { status: 500 });
  }
}