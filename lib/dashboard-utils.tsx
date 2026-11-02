// lib/dashboard-utils.ts
// Shared helpers for the dashboard APIs (date bucketing, math, timing).

// everything is bucketed in the owner's timezone
export const TZ = "Asia/Kolkata";
export const TZ_OFFSET = "+05:30"; // India has no DST

const dayFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export const dayKey = (d: Date) => dayFmt.format(d);

export function addDays(key: string, n: number) {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const dayStart = (key: string) =>
  new Date(`${key}T00:00:00${TZ_OFFSET}`);

export function keysBetween(start: string, end: string) {
  const keys: string[] = [];
  for (let k = start; k <= end; k = addDays(k, 1)) keys.push(k);
  return keys;
}

export const weekdayLabel = (key: string) =>
  new Date(`${key}T00:00:00Z`).toLocaleDateString("en", {
    weekday: "short",
    timeZone: "UTC",
  });

export const dateLabel = (key: string) =>
  new Date(`${key}T00:00:00Z`).toLocaleDateString("en", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });

export const avg = (values: number[]) =>
  values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;

export const round = (n: number, digits = 1) => {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
};

export const round2 = (n: number | null) => (n === null ? null : round(n, 1));

export const clamp = (n: number) => Math.max(0, Math.min(100, n));

export const fmtHours = (h: number) => {
  const minutes = Math.round(h * 60);
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
};

export type Win = { start: string; end: string };

// ---------- timing / debug ----------

export function createTimer(name: string) {
  const t0 = performance.now();
  let last = t0;
  const steps: Record<string, number> = {};

  return {
    async wrap<T>(label: string, fn: () => Promise<T>): Promise<T> {
      const start = performance.now();
      console.log(
        `[timing] ${name} ▶ ${label} started (+${Math.round(start - t0)}ms)`,
      );
      try {
        return await fn();
      } finally {
        const ms = Math.round(performance.now() - start);
        steps[label] = ms;
        console.log(`[timing] ${name} ✔ ${label}: ${ms}ms`);
      }
    },
    mark(label: string) {
      const now = performance.now();
      steps[label] = Math.round(now - last);
      console.log(
        `[timing] ${name} · ${label}: ${Math.round(now - last)}ms (total ${Math.round(now - t0)}ms)`,
      );
      last = now;
    },
    total: () => Math.round(performance.now() - t0),
    steps: () => steps,
  };
}
