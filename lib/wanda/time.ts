export function timezone() {
  return process.env.WANDA_TIMEZONE || "Asia/Calcutta";
}

export function dayOf(date: Date) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: timezone(),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: string) =>
    parts.find((item) => item.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function today() {
  return dayOf(new Date());
}

export function weekdayName(date = new Date()) {
  return new Intl.DateTimeFormat("en", {
    timeZone: timezone(),
    weekday: "long",
  }).format(date);
}

export function localHour(date = new Date()) {
  const hour = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone(),
    hour: "2-digit",
    hourCycle: "h23",
  }).format(date);
  return Number(hour);
}

export function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone(),
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function timezoneOffsetMs(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone(),
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const get = (type: string) =>
    Number(parts.find((item) => item.type === type)!.value);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return asUtc - date.getTime();
}

export function zonedTimeToUtc(day: string, hour: number, minute: number) {
  const [year, month, date] = day.split("-").map(Number);
  const guess = Date.UTC(year, month - 1, date, hour, minute);
  return new Date(guess - timezoneOffsetMs(new Date(guess)));
}

export function dayStartUtc(day: string) {
  return zonedTimeToUtc(day, 0, 0);
}

export function isRealDate(day: string) {
  const parsed = new Date(`${day}T00:00:00Z`);
  return (
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === day
  );
}

export function addDays(day: string, amount: number) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

export function weekStartOf(day: string) {
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
  return addDays(day, -((weekday + 6) % 7));
}

function hourFromEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value >= 0 && value <= 23
    ? value
    : fallback;
}

export function isQuietHours(date = new Date()) {
  const start = hourFromEnv("WANDA_QUIET_START", 23);
  const end = hourFromEnv("WANDA_QUIET_END", 7);
  const hour = localHour(date);
  return start > end
    ? hour >= start || hour < end
    : hour >= start && hour < end;
}

export function clip(text: string, max: number) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
