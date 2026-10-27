export type DashboardRange = "24h" | "7d" | "30d";

export type MetricCardData = {
  value: number;
  delta: number;
  subtitle: string;
};

export type ActivityDataPoint = {
  label: string;
  messages: number;
  callbacks: number;
  sales: number;
};

export type EventBreakdown = {
  name: "Message" | "Callback" | "Voice" | "Sales" | "Other";
  count: number;
};

export type RecentActivityItem = {
  id: string;
  timestamp: string;
  eventType: EventBreakdown["name"];
  userHandle: string;
  status: "Delivered" | "Failed" | "Received";
  actionPreview: string;
};

export type DashboardAnalytics = {
  range: DashboardRange;
  source: "database" | "sample";
  generatedAt: string;
  metrics: {
    telegramUpdates: MetricCardData;
    messagesHandled: MetricCardData;
    actionsCompleted: MetricCardData;
    salesNotifications: MetricCardData;
  };
  activity: ActivityDataPoint[];
  breakdown: EventBreakdown[];
  recentActivity: RecentActivityItem[];
};

const metric = (value: number, delta: number, subtitle: string): MetricCardData => ({
  value,
  delta,
  subtitle,
});

export function getSampleAnalytics(range: DashboardRange): DashboardAnalytics {
  const now = new Date();
  const count = range === "24h" ? 24 : range === "7d" ? 7 : 30;
  const activity = Array.from({ length: count }, (_, index) => {
    const date = new Date(now);
    if (range === "24h") {
      date.setHours(now.getHours() - (count - index - 1), 0, 0, 0);
    } else {
      date.setDate(now.getDate() - (count - index - 1));
      date.setHours(0, 0, 0, 0);
    }
    const wave = (index * 17 + 13) % 24;
    return {
      label: range === "24h"
        ? date.toLocaleTimeString("en", { hour: "numeric" })
        : range === "7d"
          ? date.toLocaleDateString("en", { weekday: "short" })
          : date.toLocaleDateString("en", { month: "short", day: "numeric" }),
      messages: (range === "24h" ? 2 : range === "7d" ? 20 : 22) + wave,
      callbacks: 3 + (index * 7) % (range === "24h" ? 9 : 13),
      sales: index % (range === "24h" ? 9 : 4) === 0 ? 1 : 0,
    };
  });

  const totals = range === "24h"
    ? { updates: 186, messages: 126, actions: 34, sales: 2 }
    : range === "7d"
      ? { updates: 342, messages: 189, actions: 87, sales: 12 }
      : { updates: 1284, messages: 704, actions: 238, sales: 48 };
  const recentTypes: EventBreakdown["name"][] = [
    "Message", "Callback", "Voice", "Message", "Sales", "Other", "Message", "Callback",
  ];
  const recentActivity = recentTypes.map((eventType, index) => ({
    id: `sample-${index}`,
    timestamp: new Date(now.getTime() - index * 11 * 60_000).toISOString(),
    eventType,
    userHandle: eventType === "Sales" ? "Payment webhook" : "@wanda_owner",
    status: index === 5 ? "Failed" as const : "Delivered" as const,
    actionPreview: [
      "/done · Completed task",
      "task:done · Action confirmed",
      "Voice note transcribed",
      "/remind · Reminder created",
      "Sale · Pro plan · $49.00",
      "Update handling failed",
      "/inbox · Inbox opened",
      "draft:approve · Draft approved",
    ][index],
  }));

  return {
    range,
    source: "sample",
    generatedAt: now.toISOString(),
    metrics: {
      telegramUpdates: metric(totals.updates, 12.8, "Accepted Telegram webhook updates"),
      messagesHandled: metric(totals.messages, 8.2, "Text and voice messages delivered"),
      actionsCompleted: metric(totals.actions, 3.1, "Callback actions delivered"),
      salesNotifications: metric(totals.sales, 2.4, "Sales and refunds recorded"),
    },
    activity,
    breakdown: [
      { name: "Message", count: Math.round(totals.updates * 0.54) },
      { name: "Callback", count: totals.actions },
      { name: "Voice", count: Math.round(totals.updates * 0.09) },
      { name: "Sales", count: totals.sales },
      { name: "Other", count: Math.round(totals.updates * 0.1) },
    ],
    recentActivity,
  };
}
