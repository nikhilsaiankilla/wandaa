"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  Circle,
  Flame,
  Minus,
  Moon,
  RefreshCw,
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
  HabitGrid,
  SleepStatus,
  TodayTask,
  VerdictTone,
} from "@/lib/types";

const rangeLabels: Record<DashboardRange, string> = {
  "7d": "Last 7 days",
  "30d": "Last 30 days",
};

const toneStyles: Record<VerdictTone, string> = {
  great:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  good: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  mixed: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  bad: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300",
  empty: "bg-muted text-muted-foreground",
};

const sleepStatus: Record<SleepStatus, { label: string; style: string }> = {
  great: { label: "Great", style: toneStyles.great },
  good: { label: "Good", style: toneStyles.good },
  low: { label: "Below target", style: toneStyles.mixed },
  poor: { label: "Poor", style: toneStyles.bad },
  none: { label: "No data", style: toneStyles.empty },
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
  const style =
    value > 0
      ? "text-emerald-600"
      : value < 0
        ? "text-rose-600"
        : "text-muted-foreground";
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-sm font-medium ${style}`}
    >
      <Icon className="size-4" />
      {Math.abs(value)}
      {suffix}
    </span>
  );
}

// ---------- verdict ----------

function VerdictCard({ data }: { data: DashboardAnalytics }) {
  const { verdict } = data;
  return (
    <Card>
      <CardContent className="grid gap-6 pt-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="space-y-3">
          <Badge className={`border-0 ${toneStyles[verdict.tone]}`}>
            {verdict.label}
          </Badge>
          <div className="flex items-baseline gap-3">
            <span className="text-6xl font-semibold tracking-tight tabular-nums">
              {verdict.score ?? "–"}
            </span>
            <span className="text-muted-foreground">/ 100</span>
            <Delta value={verdict.deltaVsLastWeek} />
            {verdict.deltaVsLastWeek !== null && (
              <span className="text-xs text-muted-foreground">
                vs last week
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground">{verdict.headline}</p>
          {verdict.insights.length > 0 && (
            <ul className="space-y-1.5 pt-1 text-sm">
              {verdict.insights.map((line) => (
                <li key={line} className="flex gap-2">
                  <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />
                  {line}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="space-y-4">
          {verdict.components.map((c) => (
            <div key={c.key} className="space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">{c.label}</span>
                <span className="text-muted-foreground">
                  {c.detail}
                  <span className="ml-2 font-medium text-foreground tabular-nums">
                    {c.score ?? "–"}
                  </span>
                </span>
              </div>
              <Progress value={c.score ?? 0} className="h-2" />
            </div>
          ))}
          <p className="text-xs text-muted-foreground">
            Rolling 7 days. Weights: sleep 30, tasks 30, habits 25, energy 15.
            Missing areas are left out, not counted as zero.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------- today's tasks ----------

const priorityStyle: Record<TodayTask["priority"], string> = {
  high: toneStyles.bad,
  normal: "bg-muted text-muted-foreground",
  low: "bg-muted text-muted-foreground",
};

function TaskRow({ task }: { task: TodayTask }) {
  const done = task.status === "done";
  const Icon = done ? CheckCircle2 : task.overdue ? AlertCircle : Circle;
  const iconStyle = done
    ? "text-emerald-500"
    : task.overdue
      ? "text-rose-500"
      : "text-muted-foreground";
  return (
    <li className="flex items-start gap-3 py-2.5">
      <Icon className={`mt-0.5 size-4 shrink-0 ${iconStyle}`} />
      <div className="min-w-0 flex-1">
        <p
          className={`text-sm ${done ? "text-muted-foreground line-through" : "font-medium"}`}
        >
          {task.text}
        </p>
        {(task.project || task.overdue) && (
          <p className="mt-0.5 text-xs text-muted-foreground">
            {task.project}
            {task.project && task.overdue ? " · " : ""}
            {task.overdue && (
              <span className="text-rose-600">due {task.dueDate}</span>
            )}
          </p>
        )}
      </div>
      {task.priority !== "normal" && (
        <Badge
          variant="secondary"
          className={`border-0 ${priorityStyle[task.priority]}`}
        >
          {task.priority}
        </Badge>
      )}
    </li>
  );
}

function TodayCard({ data }: { data: DashboardAnalytics }) {
  const { today } = data;
  const pct = today.total ? Math.round((today.done / today.total) * 100) : 0;
  return (
    <Card className="flex flex-col">
      <CardHeader>
        <CardTitle>Today&apos;s tasks</CardTitle>
        <CardDescription>
          Due today, overdue, and finished today
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col space-y-4">
        <div className="flex items-center gap-4">
          <Progress value={pct} className="h-2 flex-1" />
          <span className="text-sm tabular-nums text-muted-foreground">
            {today.done}/{today.total} done
          </span>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge variant="secondary">{today.open} open</Badge>
          <Badge variant="secondary">{today.done} done</Badge>
          {today.overdue > 0 && (
            <Badge className={`border-0 ${toneStyles.bad}`}>
              {today.overdue} overdue
            </Badge>
          )}
        </div>
        {today.tasks.length ? (
          <div className="max-h-[360px] overflow-y-auto pr-1">
            <ul className="divide-y">
              {today.tasks.map((t) => (
                <TaskRow key={t.id} task={t} />
              ))}
            </ul>
          </div>
        ) : (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Nothing due today. A clear slate.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ---------- sleep ----------

const sleepConfig = {
  hours: { label: "Sleep (h)", color: "var(--chart-2)" },
} satisfies ChartConfig;

function barColor(hours: number | null, goodMin: number, target: number) {
  if (hours === null) return "transparent";
  if (hours >= target) return "#34d399";
  if (hours >= goodMin) return "#7dd3fc";
  if (hours >= 6) return "#fdba74";
  return "#fb7185";
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
    <div className="rounded-lg border bg-muted/30 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
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
        ? "Steady"
        : sleep.variability < 1.5
          ? "Variable"
          : "Erratic";

  return (
    <Card className="flex flex-col">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>Sleep: good or bad?</CardTitle>
            <CardDescription>
              Each bar is a night, colored against your {sleep.target}h target
            </CardDescription>
          </div>
          <Badge className={`border-0 ${status.style}`}>{status.label}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {sleep.loggedNights === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No sleep logged in this range.
          </p>
        ) : (
          <>
            <ChartContainer config={sleepConfig} className="h-[220px] w-full">
              <BarChart
                data={sleep.points}
                margin={{ left: -20, right: 8, top: 8 }}
              >
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  interval={sleep.points.length > 10 ? 4 : 0}
                  tick={{ fontSize: 11 }}
                />
                <YAxis
                  domain={[0, 12]}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11 }}
                />
                <ReferenceLine
                  y={sleep.target}
                  stroke="var(--muted-foreground)"
                  strokeDasharray="4 4"
                  label={{
                    value: `${sleep.target}h`,
                    position: "right",
                    fontSize: 10,
                  }}
                />
                <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                <Bar dataKey="hours" radius={[6, 6, 0, 0]} maxBarSize={36}>
                  {sleep.points.map((p) => (
                    <Cell
                      key={p.day}
                      fill={barColor(p.hours, sleep.goodMin, sleep.target)}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat
                label="Average"
                value={sleep.avg === null ? "–" : fmtHours(sleep.avg)}
                sub={
                  diff === null
                    ? undefined
                    : `${diff >= 0 ? "+" : ""}${diff} min vs previous period`
                }
              />
              <Stat
                label={`Nights ≥ ${sleep.goodMin}h`}
                value={`${sleep.goodNights}/${sleep.loggedNights}`}
              />
              <Stat
                label="Sleep debt"
                value={`${sleep.sleepDebt}h`}
                sub={`vs ${sleep.target}h nights`}
              />
              <Stat
                label="Consistency"
                value={steadiness}
                sub={
                  sleep.variability === null
                    ? undefined
                    : `±${sleep.variability}h`
                }
              />
            </div>

            {(sleep.best || sleep.energyAfterGoodSleep !== null) && (
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
                {sleep.best && sleep.worst && (
                  <span>
                    Best {sleep.best.label} ({fmtHours(sleep.best.hours)}) ·
                    Worst {sleep.worst.label} ({fmtHours(sleep.worst.hours)})
                  </span>
                )}
                {sleep.energyAfterGoodSleep !== null &&
                  sleep.energyAfterShortSleep !== null && (
                    <span className="inline-flex items-center gap-1">
                      <Moon className="size-3" />
                      Energy {sleep.energyAfterGoodSleep}/5 after good sleep vs{" "}
                      {sleep.energyAfterShortSleep}/5 after short sleep
                    </span>
                  )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ---------- habit heatmaps ----------

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
    <div className="flex gap-2">
      <div className="grid grid-rows-7 gap-[3px] pt-px text-[10px] leading-none text-muted-foreground">
        {DAY_LABELS.map((d, i) => (
          <span key={i} className="flex h-3.5 items-center">
            {d}
          </span>
        ))}
      </div>
      <div className="flex gap-[3px] overflow-x-auto">
        {habit.weeks.map((week, w) => (
          <div key={w} className="grid grid-rows-7 gap-[3px]">
            {week.map((state, d) => {
              const date = cellDate(start, w * 7 + d);
              return (
                <div
                  key={d}
                  title={
                    state === 2
                      ? undefined
                      : `${date}: ${state === 1 ? "done" : "missed"}`
                  }
                  className={`size-3.5 rounded-[3px] ${
                    state === 1
                      ? "bg-primary"
                      : state === 0
                        ? "bg-muted"
                        : "bg-transparent"
                  } ${date === today ? "ring-1 ring-foreground/40" : ""}`}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function HabitsCard({ data }: { data: DashboardAnalytics }) {
  const { habits } = data;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Habit consistency</CardTitle>
        <CardDescription>
          Last 12 weeks, one square per day. Filled means done.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {habits.habits.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No active habits yet. Add one and its grid shows up here.
          </p>
        ) : (
          <div className="divide-y">
            {habits.habits.map((h) => {
              const pace = h.doneLast7 >= h.targetPerWeek;
              return (
                <div
                  key={h.id}
                  className="grid gap-3 py-4 first:pt-0 last:pb-0 md:grid-cols-[200px_minmax(0,1fr)]"
                >
                  <div className="space-y-2">
                    <p className="font-medium">{h.name}</p>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge
                        className={`border-0 ${pace ? toneStyles.great : toneStyles.mixed}`}
                      >
                        {h.doneLast7}/{h.targetPerWeek} this week
                      </Badge>
                      {h.streak > 0 && (
                        <Badge variant="secondary" className="gap-1">
                          <Flame className="size-3 text-orange-500" />
                          {h.streak}d
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Hit target {h.weeksHit} of {h.weeksTotal} full weeks
                    </p>
                  </div>
                  <Heatmap
                    habit={h}
                    start={habits.gridStart}
                    today={habits.today}
                  />
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------- task trend ----------

const trendConfig = {
  done: { label: "Tasks done", color: "var(--chart-3)" },
} satisfies ChartConfig;

function TrendCard({ data }: { data: DashboardAnalytics }) {
  const total = data.taskTrend.reduce((s, p) => s + p.done, 0);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Tasks completed</CardTitle>
        <CardDescription>{total} finished in the last 14 days</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={trendConfig} className="h-[180px] w-full">
          <BarChart
            data={data.taskTrend}
            margin={{ left: -24, right: 8, top: 8 }}
          >
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              interval={1}
              tick={{ fontSize: 10 }}
            />
            <YAxis
              allowDecimals={false}
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11 }}
            />
            <ChartTooltip content={<ChartTooltipContent hideLabel />} />
            <Bar
              dataKey="done"
              fill="var(--color-done)"
              radius={[6, 6, 0, 0]}
              maxBarSize={24}
            />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

// ---------- page ----------

function LoadingState() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-64 w-full rounded-xl" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-96 rounded-xl" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
      <Skeleton className="h-72 w-full rounded-xl" />
    </div>
  );
}

export default function DashboardClient() {
  const [range, setRange] = useState<DashboardRange>("7d");
  const [data, setData] = useState<DashboardAnalytics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
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
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError("Could not load your dashboard. Try refreshing.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [range, refresh]);

  const reload = useCallback(() => setRefresh((n) => n + 1), []);

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
        <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              How is my week going?
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Sleep, tasks, and habits in one glance.
              {data &&
                ` Updated ${new Date(data.generatedAt).toLocaleTimeString("en", { timeStyle: "short" })}.`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select
              value={range}
              onValueChange={(v) => setRange(v as DashboardRange)}
            >
              <SelectTrigger className="w-[150px]" aria-label="Sleep range">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(rangeLabels).map(([key, label]) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              onClick={reload}
              disabled={loading}
              className="gap-2"
            >
              <RefreshCw
                className={`size-4 ${loading ? "animate-spin" : ""}`}
              />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
          </div>
        </header>

        {error && !data ? (
          <Card>
            <CardContent className="flex items-center justify-between gap-4">
              <p className="text-sm text-destructive">{error}</p>
              <Button variant="outline" onClick={reload}>
                Retry
              </Button>
            </CardContent>
          </Card>
        ) : !data ? (
          <LoadingState />
        ) : (
          <div
            className={`space-y-4 transition-opacity ${loading ? "opacity-60" : ""}`}
          >
            <VerdictCard data={data} />
            <div className="grid items-start gap-4 lg:grid-cols-2">
              <TodayCard data={data} />
              <SleepCard data={data} />
            </div>
            <HabitsCard data={data} />
            <TrendCard data={data} />
          </div>
        )}
      </div>
    </main>
  );
}
