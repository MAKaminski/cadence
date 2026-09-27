// What each push notification says. Pure (no database, no network), so it is unit-tested directly.

export type PushEvent =
  | { kind: "drafts_ready"; ready: number; held: number }
  | { kind: "posted"; excerpt: string }
  | { kind: "checkin_reminder" }
  | { kind: "connection_expiring"; days: number };

export type PushMessage = { title: string; body: string; screen: "week" | "published" | "checkin" | "settings"; collapseId?: string };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** What a notification says. Pure, so it's tested directly. */
export function message(e: PushEvent): PushMessage {
  switch (e.kind) {
    case "drafts_ready":
      return {
        title: e.held ? `${plural(e.ready + e.held, "draft")} ready, ${e.held} need${e.held === 1 ? "s" : ""} you` : `${plural(e.ready, "draft")} ready`,
        body: e.held ? "Open to see why a draft was held and what to do." : "Review, edit or approve them in two taps.",
        screen: "week", collapseId: "drafts",
      };
    case "posted":
      return { title: "Posted to LinkedIn", body: e.excerpt.slice(0, 120), screen: "published" };
    case "checkin_reminder":
      return { title: "Two minutes for this week's posts?", body: "Your posting days start tomorrow. Tell Cadence what happened this week.", screen: "checkin", collapseId: "checkin" };
    case "connection_expiring":
      return { title: `LinkedIn connection ends in ${plural(e.days, "day")}`, body: "Reconnect once to keep scheduled posts going.", screen: "settings", collapseId: "connection" };
  }
}

