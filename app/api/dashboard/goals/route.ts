import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { goals } from "@/db/schema";
import { isRealDate } from "@/lib/wanda/time";

const headers = { "Cache-Control": "private, no-store, max-age=0" };
const amountPattern = /^\d{1,12}(?:\.\d{1,2})?$/;
const goalStatuses = ["active", "achieved", "abandoned"] as const;
type GoalStatus = (typeof goalStatuses)[number];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isGoalStatus(value: unknown): value is GoalStatus {
  return goalStatuses.some((status) => status === value);
}

async function readBody(request: Request) {
  try {
    const body: unknown = await request.json();
    return isRecord(body) ? body : null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const body = await readBody(request);
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const unit = typeof body?.unit === "string" ? body.unit.trim() : "";
  const targetValue = String(body?.targetValue ?? "");
  const endsOn =
    typeof body?.endsOn === "string" && body.endsOn.trim()
      ? body.endsOn.trim()
      : null;

  if (
    !title ||
    title.length > 200 ||
    !unit ||
    unit.length > 30 ||
    !amountPattern.test(targetValue) ||
    Number(targetValue) <= 0 ||
    (endsOn !== null && !isRealDate(endsOn))
  ) {
    return Response.json(
      { error: "Enter a title, target price, currency, and optional valid date." },
      { status: 400, headers },
    );
  }

  try {
    const [goal] = await getDb()
      .insert(goals)
      .values({ title, unit, targetValue, endsOn })
      .returning({ id: goals.id });
    return Response.json({ id: goal.id }, { status: 201, headers });
  } catch (error) {
    console.error("Goal creation failed", {
      reason: error instanceof Error ? error.message : "UnknownError",
    });
    return Response.json(
      { error: "Could not create goal." },
      { status: 500, headers },
    );
  }
}

export async function PATCH(request: Request) {
  const body = await readBody(request);
  const id = typeof body?.id === "number" ? body.id : Number(body?.id);
  const targetValue =
    body?.currentValue === undefined
      ? undefined
      : String(body.currentValue);
  const status = body?.status;

  if (
    !Number.isSafeInteger(id) ||
    id <= 0 ||
    (targetValue !== undefined &&
      (!amountPattern.test(targetValue) || Number(targetValue) < 0)) ||
    (status !== undefined && !isGoalStatus(status)) ||
    (targetValue === undefined && status === undefined)
  ) {
    return Response.json(
      { error: "Enter a valid goal id and progress or status." },
      { status: 400, headers },
    );
  }

  const values: {
    currentValue?: string;
    status?: GoalStatus;
    updatedAt: Date;
  } = { updatedAt: new Date() };
  if (targetValue !== undefined) values.currentValue = targetValue;
  if (isGoalStatus(status)) values.status = status;

  try {
    const [updated] = await getDb()
      .update(goals)
      .set(values)
      .where(and(eq(goals.id, id), eq(goals.status, "active")))
      .returning({ id: goals.id });

    if (!updated)
      return Response.json(
        { error: "Active goal not found." },
        { status: 404, headers },
      );
    return Response.json({ id: updated.id }, { headers });
  } catch (error) {
    console.error("Goal update failed", {
      reason: error instanceof Error ? error.message : "UnknownError",
    });
    return Response.json(
      { error: "Could not update goal." },
      { status: 500, headers },
    );
  }
}
