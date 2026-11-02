"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Circle,
  Flame,
  Minus,
  Moon,
  Plus,
  RefreshCw,
  Sparkles,
  Target,
  TrendingUp,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import type {
  DashboardAnalytics,
  DashboardRange,
  GoalItem,
  HabitGrid,
  SleepStatus,
  TaskItem,
  VerdictTone,
} from "@/lib/types";

type TaskFilter = "all" | "pending" | "done";

const taskFilters: { value: TaskFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "done", label: "Done" },
];

const rangeLabels: Record<DashboardRange, string> = {
  "7d": "Last 7 days",
  "30d": "Last 30 days",
};

const toneStyles: Record<
  VerdictTone,
  { badge: string; border: string; glow: string }
> = {
  great: {
    badge: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
    border: "border-l-emerald-500",
    glow: "from-emerald-500/5 to-transparent",
  },
  good: {
    badge: "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20",
    border: "border-l-sky-500",
    glow: "from-sky-500/5 to-transparent",
  },
  mixed: {
    badge: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
    border: "border-l-amber-500",
    glow: "from-amber-500/5 to-transparent",
  },
  bad: {
    badge: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
    border: "border-l-rose-500",
    glow: "from-rose-500/5 to-transparent",
  },
  empty: {
    badge: "bg-muted text-muted-foreground border-border",
    border: "border-l-muted-foreground/30",
    glow: "from-muted/10 to-transparent",
  },
};

const sleepStatus: Record<SleepStatus, { label: string; style: string }> = {
  great: { label: "Optimal", style: toneStyles.great.badge },
  good: { label: "Good", style: toneStyles.good.badge },
  low: { label: "Under Target", style: toneStyles.mixed.badge },
  poor: { label: "Deficit", style: toneStyles.bad.badge },
  none: { label: "No records", style: toneStyles.empty.badge },
};

const fmtHours = (h: number) => {
  const m = Math.round(h * 60);
  return `${Math.floor(m / 60)}h ${m % 60}m`;
};

function Delta({
  value,
  suffix = "",
}: {
  value: number | null;
  suffix?: string;
}) {
  if (value === null) return null;
  const Icon = value > 0 ? ArrowUpRight : value < 0 ? ArrowDownRight : Minus;
  const color =
    value > 0
      ? "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10"
      : value < 0
        ? "text-rose-600 dark:text-rose-400 bg-rose-500/10"
        : "text-muted-foreground bg-muted";

  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums tracking-tight ${color}`}
    >
      <Icon className="size-3.5" />
      {Math.abs(value)}
      {suffix}
    </span>
  );
}

// ---------- verdict ----------

function VerdictCard({ data }: { data: DashboardAnalytics }) {
  const { verdict } = data;
  const tone = toneStyles[verdict.tone] ?? toneStyles.empty;

  return (
    <Card className="relative overflow-hidden border shadow-sm transition-all">
      <div
        className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${tone.glow}`}
      />
      <CardContent className="relative grid gap-8 p-6 lg:grid-cols-[1.2fr_1.8fr] lg:p-8">
        <div className="flex flex-col justify-between space-y-6">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className={`font-mono text-xs uppercase tracking-wider ${tone.badge}`}
              >
                {verdict.label}
              </Badge>
              <span className="text-xs font-medium text-muted-foreground">
                Weekly Efficiency Score
              </span>
            </div>

            <div className="flex items-baseline gap-2">
              <span className="font-serif text-6xl font-normal tracking-tight tabular-nums text-foreground lg:text-7xl">
                {verdict.score ?? "–"}
              </span>
              <span className="text-sm font-medium text-muted-foreground">/ 100</span>
              <div className="ml-2 flex items-center gap-1.5">
                <Delta value={verdict.deltaVsLastWeek} />
                {verdict.deltaVsLastWeek !== null && (
                  <span className="text-xs text-muted-foreground">vs prev</span>
                )}
              </div>
            </div>

            <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
              {verdict.headline}
            </p>
          </div>

          {verdict.insights.length > 0 && (
            <div className="space-y-2 border-t pt-4">
              <div className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-foreground">
                <Sparkles className="size-3.5 text-amber-500" />
                <span>Signals & Takeaways</span>
              </div>
              <ul className="space-y-1.5 text-xs text-muted-foreground">
                {verdict.insights.map((line) => (
                  <li key={line} className="flex items-start gap-2">
                    <span className="mt-1.5 size-1 shrink-0 rounded-full bg-foreground/40" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="flex flex-col justify-between space-y-5 rounded-xl border bg-card/60 p-5 backdrop-blur-sm">
          <div className="space-y-4">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Component Breakdown
            </p>
            {verdict.components.map((c) => (
              <div key={c.key} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-foreground">{c.label}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">{c.detail}</span>
                    <span className="font-mono font-medium text-foreground tabular-nums">
                      {c.score ?? "–"}
                    </span>
                  </div>
                </div>
                <Progress value={c.score ?? 0} className="h-1.5 rounded-full" />
              </div>
            ))}
          </div>

          <p className="border-t pt-3 text-[11px] leading-relaxed text-muted-foreground/80">
            Weighted balance: Sleep (30%), Tasks (30%), Habits (25%), Energy (15%).
            Unlogged vectors omitted dynamically.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------- tasks ----------

const priorityStyle: Record<TaskItem["priority"], string> = {
  high: "text-rose-600 bg-rose-500/10 border-rose-500/20",
  normal: "text-muted-foreground bg-muted/60 border-transparent",
  low: "text-muted-foreground bg-muted/40 border-transparent",
};

function TaskRow({ task }: { task: TaskItem }) {
  const done = task.status === "done";
  const Icon = done ? CheckCircle2 : task.overdue ? AlertCircle : Circle;
  const iconStyle = done
    ? "text-emerald-500"
    : task.overdue
      ? "text-rose-500"
      : "text-muted-foreground/50 hover:text-foreground";

  return (
    <li className="group flex items-start gap-3 py-3 transition-colors hover:bg-muted/30">
      <Icon className={`mt-0.5 size-4 shrink-0 transition-transform ${iconStyle}`} />
      <div className="min-w-0 flex-1 space-y-0.5">
        <p
          className={`text-sm leading-snug transition-colors ${
            done
              ? "text-muted-foreground line-through"
              : "font-medium text-foreground"
          }`}
        >
          {task.text}
        </p>
        {(task.project || task.overdue) && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {task.project && <span>{task.project}</span>}
            {task.project && task.overdue && <span>•</span>}
            {task.overdue && (
              <span className="font-medium text-rose-500">
                Overdue · {task.dueDate}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        {task.priority !== "normal" && (
          <Badge
            variant="outline"
            className={`text-[10px] uppercase tracking-wide ${priorityStyle[task.priority]}`}
          >
            {task.priority}
          </Badge>
        )}
        <Badge
          variant="outline"
          className={`text-[10px] uppercase tracking-wide ${
            done
              ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400"
              : "border-border text-muted-foreground"
          }`}
        >
          {done ? "Completed" : "Open"}
        </Badge>
      </div>
    </li>
  );
}

function TasksCard({ data }: { data: DashboardAnalytics }) {
  const { today } = data;
  const [filter, setFilter] = useState<TaskFilter>("all");
  const pct = today.total ? Math.round((today.done / today.total) * 100) : 0;
  const filteredTasks = data.tasks.filter(
    (task) =>
      filter === "all" ||
      task.status === (filter === "pending" ? "open" : "done"),
  );
  const filterCounts: Record<TaskFilter, number> = {
    all: data.tasks.length,
    pending: data.tasks.filter((task) => task.status === "open").length,
    done: data.tasks.filter((task) => task.status === "done").length,
  };

  return (
    <Card className="flex flex-col border shadow-sm">
      <CardHeader className="border-b pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-medium">Daily Objectives</CardTitle>
          <div className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">{today.done}</span>
            <span>/</span>
            <span>{today.total}</span>
          </div>
        </div>
        <CardDescription className="text-xs">
          Tasks slated for immediate execution today
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col space-y-4 pt-4">
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Completion Rate</span>
            <span className="font-mono tabular-nums">{pct}%</span>
          </div>
          <Progress value={pct} className="h-1.5 rounded-full" />
        </div>

        <div className="flex items-center justify-between border-b pb-3">
          <div className="flex items-center gap-1 rounded-lg border bg-muted/20 p-0.5">
            {taskFilters.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-all ${
                  filter === value
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => setFilter(value)}
              >
                {label} ({filterCounts[value]})
              </button>
            ))}
          </div>

          {today.overdue > 0 && (
            <Badge
              variant="outline"
              className="border-rose-500/20 bg-rose-500/10 text-xs text-rose-600"
            >
              {today.overdue} Overdue
            </Badge>
          )}
        </div>

        {filteredTasks.length ? (
          <div className="max-h-[340px] flex-1 overflow-y-auto pr-1">
            <ul className="divide-y divide-border/60">
              {filteredTasks.map((t) => (
                <TaskRow key={t.id} task={t} />
              ))}
            </ul>
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center py-10 text-center">
            <p className="text-xs text-muted-foreground">No matching tasks found.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------- sleep ----------

const sleepConfig = {
  hours: { label: "Sleep (h)", color: "var(--foreground)" },
} satisfies ChartConfig;

function barColor(hours: number | null, goodMin: number, target: number) {
  if (hours === null) return "transparent";
  if (hours >= target) return "#10b981";
  if (hours >= goodMin) return "#38bdf8";
  if (hours >= 6) return "#f59e0b";
  return "#f43f5e";
}

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <p className="text-[11px] font-medium tracking-tight text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-foreground">
        {value}
      </p>
      {sub && <p className="mt-0.5 text-[11px] text-muted-foreground/80">{sub}</p>}
    </div>
  );
}

function SleepCard({ data }: { data: DashboardAnalytics }) {
  const { sleep } = data;
  const status = sleepStatus[sleep.status];
  const diff =
    sleep.avg !== null && sleep.prevAvg !== null
      ? Math.round((sleep.avg - sleep.prevAvg) * 60)
      : null;

  const steadiness =
    sleep.variability === null
      ? "–"
      : sleep.variability < 0.75
        ? "Consistent"
        : sleep.variability < 1.5
          ? "Moderate"
          : "Volatile";

  return (
    <Card className="flex flex-col border shadow-sm">
      <CardHeader className="border-b pb-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base font-medium">Sleep Architecture</CardTitle>
            <CardDescription className="text-xs">
              Daily sleep volume indexed against {sleep.target}h target
            </CardDescription>
          </div>
          <Badge variant="outline" className={`font-mono text-xs ${status.style}`}>
            {status.label}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col space-y-4 pt-4">
        {sleep.loggedNights === 0 ? (
          <div className="flex flex-1 items-center justify-center py-10">
            <p className="text-xs text-muted-foreground">No sleep data available.</p>
          </div>
        ) : (
          <>
            <ChartContainer config={sleepConfig} className="h-[190px] w-full">
              <BarChart
                data={sleep.points}
                margin={{ left: -24, right: 12, top: 12, bottom: 0 }}
              >
                <CartesianGrid
                  vertical={false}
                  strokeDasharray="2 2"
                  className="stroke-muted/50"
                />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  interval={sleep.points.length > 10 ? 3 : 0}
                  tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                />
                <YAxis
                  domain={[0, 12]}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                />
                <ReferenceLine
                  y={sleep.target}
                  stroke="currentColor"
                  strokeDasharray="3 3"
                  className="text-muted-foreground/60"
                  label={{
                    value: `${sleep.target}h target`,
                    position: "right",
                    fontSize: 9,
                    fill: "var(--muted-foreground)",
                  }}
                />
                <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                <Bar dataKey="hours" radius={[4, 4, 0, 0]} maxBarSize={28}>
                  {sleep.points.map((p) => (
                    <Cell
                      key={p.day}
                      fill={barColor(p.hours, sleep.goodMin, sleep.target)}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>

            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <Stat
                label="Average Rest"
                value={sleep.avg === null ? "–" : fmtHours(sleep.avg)}
                sub={
                  diff === null
                    ? undefined
                    : `${diff >= 0 ? "+" : ""}${diff}m vs prev`
                }
              />
              <Stat
                label={`Target (≥${sleep.goodMin}h)`}
                value={`${sleep.goodNights}/${sleep.loggedNights}`}
                sub="Logged nights"
              />
              <Stat
                label="Total Debt"
                value={`${sleep.sleepDebt}h`}
                sub={`vs ${sleep.target}h target`}
              />
              <Stat
                label="Variance"
                value={steadiness}
                sub={sleep.variability ? `±${sleep.variability}h` : undefined}
              />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ---------- habits ----------

const DAY_LABELS = ["Mon", "", "Wed", "", "Fri", "", ""];

function cellDate(start: string, index: number) {
  return new Date(Date.parse(`${start}T00:00:00Z`) + index * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

function Heatmap({
  habit,
  start,
  today,
}: {
  habit: HabitGrid;
  start: string;
  today: string;
}) {
  return (
    <div className="flex gap-2.5 overflow-x-auto pb-1">
      <div className="grid grid-rows-7 gap-1 pt-4 text-[9px] font-mono text-muted-foreground">
        {DAY_LABELS.map((d, i) => (
          <span key={i} className="flex h-3 items-center">
            {d}
          </span>
        ))}
      </div>
      <div className="min-w-0">
        <div className="mb-1 flex gap-1 text-[9px] font-mono text-muted-foreground">
          {habit.weeks.map((_, w) => {
            const date = new Date(`${cellDate(start, w * 7)}T00:00:00Z`);
            const month = date.getUTCMonth();
            const previous = w
              ? new Date(`${cellDate(start, (w - 1) * 7)}T00:00:00Z`).getUTCMonth()
              : -1;
            const label =
              month !== previous
                ? date.toLocaleDateString("en", { month: "short", timeZone: "UTC" })
                : "";
            return (
              <span key={w} className="w-3 shrink-0 text-left">
                {label}
              </span>
            );
          })}
        </div>
        <div className="flex gap-1">
          {habit.weeks.map((week, w) => (
            <div key={w} className="grid grid-rows-7 gap-1">
              {week.map((state, d) => {
                const date = cellDate(start, w * 7 + d);
                return (
                  <div
                    key={d}
                    title={
                      state === 2
                        ? undefined
                        : `${date}: ${state === 1 ? "Completed" : "Missed"}`
                    }
                    className={`size-3 rounded-[2px] transition-colors ${
                      state === 1
                        ? "bg-foreground"
                        : state === 0
                          ? "bg-muted/60"
                          : "bg-transparent"
                    } ${date === today ? "ring-1 ring-primary" : ""}`}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function HabitsCard({ data }: { data: DashboardAnalytics }) {
  const { habits } = data;
  return (
    <Card className="border shadow-sm">
      <CardHeader className="border-b pb-4">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base font-medium">Habit Consistency</CardTitle>
            <CardDescription className="text-xs">
              Annual completion telemetry per routine
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="divide-y divide-border/60 p-6">
        {habits.habits.length === 0 ? (
          <p className="py-8 text-center text-xs text-muted-foreground">
            No routines registered for telemetry.
          </p>
        ) : (
          habits.habits.map((h) => {
            const pace = h.doneLast7 >= h.targetPerWeek;
            return (
              <div
                key={h.id}
                className="grid gap-4 py-4 first:pt-0 last:pb-0 lg:grid-cols-[220px_minmax(0,1fr)] lg:items-center"
              >
                <div className="space-y-1.5">
                  <p className="text-sm font-medium text-foreground">{h.name}</p>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge
                      variant="outline"
                      className={`text-[10px] font-mono ${
                        pace
                          ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                          : "border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                      }`}
                    >
                      {h.doneLast7}/{h.targetPerWeek} this week
                    </Badge>
                    {h.streak > 0 && (
                      <Badge
                        variant="secondary"
                        className="gap-1 text-[10px] font-mono"
                      >
                        <Flame className="size-3 text-orange-500" />
                        {h.streak}d streak
                      </Badge>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Target hit in {h.weeksHit} of {h.weeksTotal} weeks
                  </p>
                </div>
                <Heatmap
                  habit={h}
                  start={habits.gridStart}
                  today={habits.today}
                />
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

// ---------- goals ----------

async function submitGoal(
  body: Record<string, string | number>,
  method: "POST" | "PATCH",
) {
  const response = await fetch("/api/dashboard/goals", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const result = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(result?.error ?? "Could not save goal.");
  }
}

function GoalRow({
  goal,
  onSaved,
}: {
  goal: GoalItem;
  onSaved: () => void;
}) {
  const [currentValue, setCurrentValue] = useState(String(goal.currentValue));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const progress =
    goal.targetValue && goal.targetValue > 0
      ? Math.min(100, Math.round((goal.currentValue / goal.targetValue) * 100))
      : 0;
  const active = goal.status === "active";

  async function updateGoal(val?: string, status?: "achieved") {
    setSaving(true);
    setError(null);
    try {
      await submitGoal(
        {
          id: goal.id,
          ...(status ? { status } : { currentValue: Number(val) }),
        },
        "PATCH",
      );
      onSaved();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Failed to update.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <li className="space-y-3 py-4 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <span className="text-sm font-medium text-foreground">{goal.title}</span>
          <span className="ml-2 font-mono text-xs tabular-nums text-muted-foreground">
            {goal.currentValue.toLocaleString()} /{" "}
            {goal.targetValue?.toLocaleString() ?? "∞"} {goal.unit}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs font-semibold tabular-nums">
            {progress}%
          </span>
          <Badge
            variant="outline"
            className={`text-[10px] uppercase font-mono ${
              goal.status === "achieved"
                ? toneStyles.great.badge
                : goal.status === "abandoned"
                  ? toneStyles.empty.badge
                  : toneStyles.good.badge
            }`}
          >
            {goal.status}
          </Badge>
        </div>
      </div>

      <Progress value={progress} className="h-1.5 rounded-full" />

      {active && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void updateGoal(currentValue);
          }}
          className="flex flex-wrap items-center gap-2 pt-1"
        >
          <input
            type="number"
            step="0.01"
            value={currentValue}
            onChange={(e) => setCurrentValue(e.target.value)}
            className="h-8 w-32 rounded-md border bg-background px-2.5 font-mono text-xs text-foreground focus:outline-hidden focus:ring-1 focus:ring-ring"
          />
          <Button
            type="submit"
            size="sm"
            variant="outline"
            className="h-8 text-xs font-medium"
            disabled={saving}
          >
            {saving ? "Saving…" : "Update Progress"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 text-xs text-muted-foreground hover:text-foreground"
            disabled={saving}
            onClick={() => void updateGoal(undefined, "achieved")}
          >
            Mark Complete
          </Button>
        </form>
      )}
      {error && <p className="text-xs text-rose-500">{error}</p>}
    </li>
  );
}

function GoalsCard({
  data,
  onSaved,
}: {
  data: DashboardAnalytics;
  onSaved: () => void;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [title, setTitle] = useState("");
  const [targetValue, setTargetValue] = useState("");
  const [unit, setUnit] = useState("INR");
  const [endsOn, setEndsOn] = useState("");
  const [saving, setSaving] = useState(false);

  async function createGoal(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await submitGoal(
        { title, targetValue: Number(targetValue), unit, endsOn },
        "POST",
      );
      setTitle("");
      setTargetValue("");
      setShowAdd(false);
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="border shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between border-b pb-4">
        <div>
          <CardTitle className="text-base font-medium">Financial Targets</CardTitle>
          <CardDescription className="text-xs">
            Capital milestones and purchasing allocations
          </CardDescription>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-8 gap-1.5 text-xs font-medium"
          onClick={() => setShowAdd(!showAdd)}
        >
          <Plus className="size-3.5" />
          {showAdd ? "Close" : "New Target"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4 p-6">
        {showAdd && (
          <form
            onSubmit={createGoal}
            className="grid gap-3 rounded-lg border bg-muted/20 p-4"
          >
            <div className="grid gap-3 sm:grid-cols-3">
              <input
                required
                placeholder="Target item (e.g. M3 Max)"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="h-8 rounded-md border bg-background px-3 text-xs"
              />
              <input
                required
                type="number"
                placeholder="Amount"
                value={targetValue}
                onChange={(e) => setTargetValue(e.target.value)}
                className="h-8 rounded-md border bg-background px-3 font-mono text-xs"
              />
              <input
                required
                placeholder="Currency (INR, USD)"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="h-8 rounded-md border bg-background px-3 text-xs"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setShowAdd(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                className="h-7 text-xs"
                disabled={saving}
              >
                {saving ? "Adding…" : "Create Target"}
              </Button>
            </div>
          </form>
        )}

        {data.goals.length ? (
          <ul className="divide-y divide-border/60">
            {data.goals.map((goal) => (
              <GoalRow key={goal.id} goal={goal} onSaved={onSaved} />
            ))}
          </ul>
        ) : (
          <p className="py-6 text-center text-xs text-muted-foreground">
            No milestones currently configured.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ---------- trend ----------

const trendConfig = {
  done: { label: "Output", color: "var(--foreground)" },
} satisfies ChartConfig;

function TrendCard({ data }: { data: DashboardAnalytics }) {
  const total = data.taskTrend.reduce((s, p) => s + p.done, 0);

  return (
    <Card className="border shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between border-b pb-4">
        <div>
          <CardTitle className="text-base font-medium">Task Velocity</CardTitle>
          <CardDescription className="text-xs">
            14-day production volume and sprint cadence
          </CardDescription>
        </div>
        <div className="font-mono text-xs font-semibold tabular-nums">
          {total} tasks closed
        </div>
      </CardHeader>
      <CardContent className="p-6">
        <ChartContainer config={trendConfig} className="h-[160px] w-full">
          <BarChart
            data={data.taskTrend}
            margin={{ left: -24, right: 8, top: 8, bottom: 0 }}
          >
            <CartesianGrid
              vertical={false}
              strokeDasharray="2 2"
              className="stroke-muted/40"
            />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
            />
            <YAxis
              allowDecimals={false}
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
            />
            <ChartTooltip content={<ChartTooltipContent hideLabel />} />
            <Bar
              dataKey="done"
              fill="currentColor"
              className="fill-foreground/80 hover:fill-foreground"
              radius={[4, 4, 0, 0]}
              maxBarSize={22}
            />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

// root page
export default function DashboardClient() {
  const [range, setRange] = useState<DashboardRange>("7d");
  const [data, setData] = useState<DashboardAnalytics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let timedOut = false;
    const timeout = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 25_000);
    setLoading(true);
    fetch(`/api/dashboard/analytics?range=${range}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok) throw new Error("Request failed");
        return res.json() as Promise<DashboardAnalytics>;
      })
      .then((result) => {
        setData(result);
        setError(null);
      })
      .catch((err: unknown) => {
        if (
          err instanceof DOMException &&
          err.name === "AbortError" &&
          !timedOut
        )
          return;
        setError(
          timedOut
            ? "Dashboard data took too long to load. Check the database connection, then try again."
            : "Could not load your dashboard. Try refreshing.",
        );
      })
      .finally(() => {
        window.clearTimeout(timeout);
        if (!controller.signal.aborted || timedOut) setLoading(false);
      });
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [range, refresh]);

  const reload = useCallback(() => setRefresh((n) => n + 1), []);

  return (
    <main className="min-h-screen bg-background font-sans text-foreground antialiased">
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6 sm:py-12">
        <header className="flex flex-col justify-between gap-4 border-b pb-6 sm:flex-row sm:items-end">
          <div className="space-y-1">
            <h1 className="text-2xl font-medium tracking-tight sm:text-3xl">
              Performance Snapshot
            </h1>
            <p className="text-xs text-muted-foreground">
              Synthesized personal ops telemetry: sleep, tasks, and habits.
              {data && (
                <span className="ml-1 font-mono">
                  Synced{" "}
                  {new Date(data.generatedAt).toLocaleTimeString("en", {
                    timeStyle: "short",
                  })}
                </span>
              )}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Select
              value={range}
              onValueChange={(v) => setRange(v as DashboardRange)}
            >
              <SelectTrigger className="h-8 w-[140px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(rangeLabels).map(([key, label]) => (
                  <SelectItem key={key} value={key} className="text-xs">
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              variant="outline"
              size="sm"
              onClick={reload}
              disabled={loading}
              className="h-8 gap-1.5 text-xs font-medium"
            >
              <RefreshCw
                className={`size-3.5 ${loading ? "animate-spin" : ""}`}
              />
              <span className="hidden sm:inline">Sync</span>
            </Button>
          </div>
        </header>

        {error && !data ? (
          <Card className="border-rose-500/20 bg-rose-500/5">
            <CardContent className="flex items-center justify-between p-4">
              <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>
              <Button size="sm" variant="outline" onClick={reload} className="h-7 text-xs">
                Retry
              </Button>
            </CardContent>
          </Card>
        ) : !data ? (
          <div className="space-y-6">
            <Skeleton className="h-56 w-full rounded-xl" />
            <div className="grid gap-6 lg:grid-cols-2">
              <Skeleton className="h-80 rounded-xl" />
              <Skeleton className="h-80 rounded-xl" />
            </div>
            <Skeleton className="h-44 w-full rounded-xl" />
          </div>
        ) : (
          <div
            className={`space-y-6 transition-opacity duration-200 ${
              loading ? "opacity-60" : "opacity-100"
            }`}
          >
            <VerdictCard data={data} />

            <div className="grid items-start gap-6 lg:grid-cols-2">
              <TasksCard data={data} />
              <SleepCard data={data} />
            </div>

            <GoalsCard data={data} onSaved={reload} />
            <HabitsCard data={data} />
            <TrendCard data={data} />
          </div>
        )}
      </div>
    </main>
  );
}