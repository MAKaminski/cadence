// Every input a person gives Cadence, in one registry: what it is, why it's where it is, which page is
// its home, how it's edited, and the rule that says whether to keep it, raise it or lower it. The
// Inputs page and each home page's "All inputs" link render from this list, so the two can't drift.
// Pure (no database), so the direction rules are tested directly; src/services/inputs.ts gathers the
// signals they read.
import { LIMITS } from "./catalog";

export type Direction = "maintain" | "increase" | "decrease";
export type Advice = { direction: Direction; reason: string; href: string };

export type InputGroup = "about" | "voice" | "writing" | "rhythm" | "publishing";
export const GROUPS: { id: InputGroup; title: string; blurb: string }[] = [
  { id: "about", title: "Who you are", blurb: "What every draft is written from. Change it when your work or your audience changes." },
  { id: "voice", title: "How you sound", blurb: "What drafts sound like and what they stay away from." },
  { id: "writing", title: "What drafts learn from", blurb: "This week's notes, your ratings and the model doing the writing." },
  { id: "rhythm", title: "How much and when", blurb: "Your plan: the volume and timing approved posts and comments follow." },
  { id: "publishing", title: "Where it goes", blurb: "The channels posts go to and how much waits for your approval." },
];

/** How the Inputs page edits it. `manage` inputs are lists of items, edited on their home page. */
export type Editor =
  | "text" | "lines" | "samples" | "model" | "checkin" | "examples"
  | "posts" | "slots" | "comments" | "window" | "pause"
  | "auto-publish" | "channels" | "channel-drafting";

export type InputId =
  | "role" | "audience" | "goals" | "facts" | "voiceSamples" | "topics" | "noGo"
  | "checkin" | "examples" | "model"
  | "postsPerWeek" | "slots" | "commentsPerDay" | "commentWindow" | "pause"
  | "autoPublish" | "channels" | "channelDrafting";

export type InputDef = {
  id: InputId; group: InputGroup; label: string;
  /** One line: what the input is. */
  what: string;
  /** Why it lives where it does, and what it drives. */
  why: string;
  home: { href: string; label: string };
  editor: Editor;
  /** The direction rule, in words (shown on the page, and the spec for `advise`). */
  rule: string;
  flag?: "examples";
};

const SETUP = (step: number) => ({ href: `/onboarding?edit=1&step=${step}`, label: "Setup" });

export const INPUTS: InputDef[] = [
  { id: "role", group: "about", label: "What you do", editor: "text", home: SETUP(1),
    what: "Your role, in a line.", why: "Every draft is written as this person. Set once in setup, so it's there.",
    rule: "Maintain. Change it when your role changes." },
  { id: "audience", group: "about", label: "Who you want to reach", editor: "text", home: SETUP(1),
    what: "The people your posts are for.", why: "Drafting aims each post's angle and vocabulary at them.",
    rule: "Maintain. Change it when who you're after changes." },
  { id: "goals", group: "about", label: "What posting should do for you", editor: "text", home: SETUP(1),
    what: "The outcome you want from posting.", why: "Steers each post's angle and close.",
    rule: "Maintain. Change it when the goal is met or replaced." },
  { id: "facts", group: "about", label: "Facts Cadence may state", editor: "lines", home: SETUP(1),
    what: "The only numbers, employers, results and credentials drafts may claim.",
    why: "The fact check holds any draft that claims something not here or in this week's notes.",
    rule: "Increase when drafts were held this month (a held draft often claims a true fact that isn't listed); otherwise maintain." },
  { id: "voiceSamples", group: "voice", label: "Three of your posts", editor: "samples", home: SETUP(2),
    what: "Posts you wrote, so drafts sound like you.", why: "Drafting copies their sentence length and tone.",
    rule: "Increase (swap in better ones) when you edited more than half the drafts you approved this month; otherwise maintain." },
  { id: "topics", group: "voice", label: "Topics", editor: "lines", home: SETUP(2),
    what: "What you want to be known for.", why: "Drafts stay inside these.",
    rule: "Increase (add a fresh one) when engagement over your last 4 posts fell 15% or more against the 4 before; otherwise maintain." },
  { id: "noGo", group: "voice", label: "Never write about", editor: "lines", home: SETUP(2),
    what: "Names, subjects or employers that must not appear.", why: "A match holds the draft for you.",
    rule: "Maintain. Add to it whenever a draft goes somewhere it shouldn't." },
  { id: "checkin", group: "writing", label: "This week's check-in", editor: "checkin", home: { href: "/app", label: "This week" },
    what: "Rough notes on what you did, learned or noticed.", why: "Every draft starts from a check-in; it lives on This week next to the drafts it makes.",
    rule: "Increase when you haven't checked in for 7 days; otherwise maintain." },
  { id: "examples", group: "writing", label: "Example ratings", editor: "examples", home: { href: "/app/examples", label: "Examples" }, flag: "examples",
    what: "Thumbs up or down on posts and visuals you've seen.", why: "Rated examples become a \"do more of / avoid\" list in every drafting brief.",
    rule: "Increase until at least 3 examples are rated and read; otherwise maintain." },
  { id: "model", group: "writing", label: "Writing model", editor: "model", home: SETUP(3),
    what: "The Claude model that writes your drafts.", why: "Opus writes richer drafts and uses the monthly allowance about 2.5× faster.",
    rule: "Decrease (switch to Sonnet) when Opus has used 80% or more of this month's allowance; otherwise maintain." },
  { id: "postsPerWeek", group: "rhythm", label: "Posts a week", editor: "posts", home: { href: "/app/plan#posting", label: "Plan" },
    what: "How many posts go out each week.", why: "Plan turns the number into slots; Results measures you against it.",
    rule: "Decrease when you averaged under 75% of it over the last 4 full weeks. Increase when you hit it in 3 of the last 4 weeks and engagement over your last 4 posts held against the 4 before. Otherwise maintain." },
  { id: "slots", group: "rhythm", label: "Posting days and times", editor: "slots", home: { href: "/app/plan#posting", label: "Plan" },
    what: "Three daily slots (A, B, C), each with a time and days.", why: "Approved posts go into the next free slot that's on.",
    rule: "Increase (add the day) when your best weekday on Results, with 2 or more posts, has no slot on; otherwise maintain." },
  { id: "commentsPerDay", group: "rhythm", label: "Comments a day", editor: "comments", home: { href: "/app/plan#comments", label: "Plan" },
    what: "How many comments the Cadence runner leaves each day.", why: "Planned next to your posts so the two never crowd each other.",
    rule: "Maintain. Nothing runs comments until the runner is connected, so there are no results to go on." },
  { id: "commentWindow", group: "rhythm", label: "Comment window and spacing", editor: "window", home: { href: "/app/plan#comments", label: "Plan" },
    what: "When comments may run, and the minimum minutes between them.", why: "Keeps comment runs inside your day and apart.",
    rule: "Maintain. Nothing runs comments until the runner is connected." },
  { id: "pause", group: "rhythm", label: "Pause posting", editor: "pause", home: { href: "/app/plan#pause", label: "Plan" },
    what: "Stops publishing; approved posts keep their place.", why: "Lives on Plan, next to the slots it holds.",
    rule: "Increase (resume) while paused; otherwise maintain." },
  { id: "autoPublish", group: "publishing", label: "Post clean drafts automatically", editor: "auto-publish", home: { href: "/app/settings", label: "Settings" },
    what: "Lets drafts that pass every check schedule themselves.", why: `Unlocks after ${LIMITS.autoPublishAfter} clean approvals; anything held still waits for you.`,
    rule: "Increase (turn on) once it's unlocked and no draft was held this month; otherwise maintain." },
  { id: "channels", group: "publishing", label: "Channels", editor: "channels", home: { href: "/app/channels", label: "Channels" },
    what: "Where your posts go: LinkedIn, and X once connected.", why: "Each connected channel gets its own version of every post.",
    rule: "Increase when a channel that's ready on this server isn't connected; otherwise maintain." },
  { id: "channelDrafting", group: "publishing", label: "Draft for each channel", editor: "channel-drafting", home: { href: "/app/channels", label: "Channels" },
    what: "Per channel: write a version of each post, or pause that channel's drafts.", why: "Keeps a connection without drafting for it.",
    rule: "Increase when a connected channel's drafting is off; otherwise maintain." },
];

export const input = (id: InputId) => INPUTS.find((i) => i.id === id)!;
/** The inputs whose home is this page (path only, ignoring the query and anchor). */
export const inputsOn = (path: string) => INPUTS.filter((i) => i.home.href.split(/[?#]/)[0] === path);

/** What the direction rules read. Gathered by src/services/inputs.ts. */
export type Signals = {
  /** LinkedIn posts in the last 4 full weeks, oldest first, against the target then. */
  weeks: { posts: number; target: number }[];
  target: number;
  /** Mean engagement rate of the last 4 posts with numbers, and of the 4 before. */
  rate: { recent: number | null; earlier: number | null };
  /** The weekday with the best engagement rate (2+ posts), and the days a posting slot is on. */
  bestDay: { label: string; rate: number; posts: number } | null;
  onDays: string[];
  month: { approved: number; edited: number; held: number };
  model: string; spentShare: number;
  autoPublish: { on: boolean; left: number };
  paused: boolean; waiting: number;
  channels: { name: string; connected: boolean; connectable: boolean; drafting: boolean | null }[];
  examples: { rated: number } | null;
  daysSinceCheckin: number | null;
};

const pct = (r: number) => `${(r * 100).toFixed(1)}%`;
const keep = (reason: string, href: string): Advice => ({ direction: "maintain", reason, href });

/** The direction for one input, with the reason and the page that shows the evidence. */
export function advise(id: InputId, s: Signals): Advice {
  switch (id) {
    case "postsPerWeek": {
      const posted = s.weeks.reduce((a, w) => a + w.posts, 0);
      if (s.target === 0) return keep("Posting is set to zero a week.", "/app/plan#posting");
      if (!posted) return keep("Nothing published in the last 4 weeks yet; hold the target until there's a record.", "/app/results#outreach");
      const avg = posted / s.weeks.length, hit = s.weeks.filter((w) => w.posts >= w.target).length;
      if (avg < 0.75 * s.target) return { direction: "decrease", reason: `You published ${avg.toFixed(1)} a week against ${s.target} over the last 4 weeks. A target you hit beats one you miss.`, href: "/app/results#outreach" };
      const { recent, earlier } = s.rate;
      if (hit >= 3 && recent != null && earlier != null && recent >= earlier)
        return { direction: "increase", reason: `On target ${hit} of the last 4 weeks, and engagement held (${pct(earlier)} → ${pct(recent)}). Try one more a week.`, href: "/app/results#impact" };
      if (hit >= 3 && recent != null && earlier != null) return keep(`On target, but engagement slipped (${pct(earlier)} → ${pct(recent)}). Hold the volume.`, "/app/results#impact");
      if (hit >= 3) return keep(`On target ${hit} of the last 4 weeks. Post numbers will say whether more would help.`, "/app/results#outreach");
      return keep(`On target ${hit} of the last 4 weeks.`, "/app/results#outreach");
    }
    case "slots": {
      const b = s.bestDay;
      if (!b) return keep("Not enough posts per weekday to compare days yet.", "/app/results#what-works");
      if (!s.onDays.includes(b.label)) return { direction: "increase", reason: `${b.label} is your best day (${pct(b.rate)} engagement over ${b.posts} posts) and no slot posts then.`, href: "/app/results#what-works" };
      return keep(`${b.label}, your best day (${pct(b.rate)}), already has a slot.`, "/app/results#what-works");
    }
    case "facts":
      return s.month.held ? { direction: "increase", reason: `${s.month.held} draft${s.month.held > 1 ? "s were" : " was"} held this month. If one claimed something true, add it here.`, href: "/app" }
        : keep("No drafts held this month.", "/app/results#consistency");
    case "voiceSamples":
      return s.month.approved >= 3 && s.month.edited / s.month.approved > 0.5
        ? { direction: "increase", reason: `You edited ${s.month.edited} of ${s.month.approved} approved drafts this month. Posts that sound like you now mean fewer edits.`, href: "/app/results#consistency" }
        : keep(s.month.approved ? `${s.month.edited} of ${s.month.approved} approved drafts edited this month.` : "No approvals yet this month.", "/app/results#consistency");
    case "topics": {
      const { recent, earlier } = s.rate;
      if (recent != null && earlier != null && earlier > 0 && recent <= earlier * 0.85)
        return { direction: "increase", reason: `Engagement fell from ${pct(earlier)} to ${pct(recent)} over your last 4 posts. Add a fresh topic.`, href: "/app/results#impact" };
      return keep(recent != null && earlier != null ? `Engagement steady (${pct(earlier)} → ${pct(recent)}).` : "Needs 8 posts with numbers to compare.", "/app/results#impact");
    }
    case "model":
      return s.model === "claude-opus-5" && s.spentShare >= 0.8
        ? { direction: "decrease", reason: `Opus has used ${Math.round(s.spentShare * 100)}% of this month's allowance. Sonnet goes about 2.5× further.`, href: "/app/settings" }
        : keep(`${Math.round(s.spentShare * 100)}% of this month's allowance used.`, "/app/settings");
    case "pause":
      return s.paused ? { direction: "increase", reason: `Posting is paused${s.waiting ? ` with ${s.waiting} approved post${s.waiting > 1 ? "s" : ""} waiting` : ""}. Resume when you're ready.`, href: "/app" }
        : keep("Posting is on.", "/app/plan#pause");
    case "autoPublish":
      if (s.autoPublish.on) return keep("On: clean drafts schedule themselves; held ones wait for you.", "/app/settings");
      if (s.autoPublish.left > 0) return keep(`Unlocks after ${s.autoPublish.left} more clean approval${s.autoPublish.left > 1 ? "s" : ""}.`, "/app/settings");
      return s.month.held ? keep(`${s.month.held} draft${s.month.held > 1 ? "s" : ""} held this month; keep approving by hand for now.`, "/app")
        : { direction: "increase", reason: "Unlocked, and nothing was held this month. Let clean drafts schedule themselves.", href: "/app/settings" };
    case "channels": {
      const ready = s.channels.filter((c) => c.connectable && !c.connected);
      return ready.length ? { direction: "increase", reason: `${ready.map((c) => c.name).join(", ")} ${ready.length > 1 ? "are" : "is"} ready to connect: every post gets a version there, no extra writing.`, href: "/app/channels" }
        : keep("Every channel ready on this server is connected.", "/app/channels");
    }
    case "channelDrafting": {
      const off = s.channels.filter((c) => c.drafting === false);
      return off.length ? { direction: "increase", reason: `${off.map((c) => c.name).join(", ")} drafting is off: connected, but getting no posts.`, href: "/app/channels" }
        : keep(s.channels.some((c) => c.drafting) ? "Every connected channel gets a version of each post." : "No other channel connected yet.", "/app/channels");
    }
    case "examples":
      if (!s.examples) return keep("Examples isn't on for your account yet.", "/app/inputs");
      return s.examples.rated < 3 ? { direction: "increase", reason: `${s.examples.rated} rated so far. Rate at least 3 so drafting has something to learn from.`, href: "/app/examples" }
        : keep(`${s.examples.rated} rated examples steer drafting.`, "/app/examples");
    case "checkin":
      return s.daysSinceCheckin == null || s.daysSinceCheckin > 7
        ? { direction: "increase", reason: s.daysSinceCheckin == null ? "No check-in yet. Drafts come from check-ins." : `Last check-in ${s.daysSinceCheckin} days ago. Drafts come from check-ins.`, href: "/app" }
        : keep(`Last check-in ${s.daysSinceCheckin === 0 ? "today" : `${s.daysSinceCheckin} day${s.daysSinceCheckin > 1 ? "s" : ""} ago`}.`, "/app");
    case "commentsPerDay": case "commentWindow":
      return keep("Planned only: no comment results to go on until the runner is connected.", "/app/plan#comments");
    case "role": case "audience": case "goals": case "noGo":
      return keep("Set by you; no result says to change it.", input(id).home.href);
  }
}

/** The headline: grow, hold or ease off, from the posting rule (the input everything else follows). */
export function strategy(s: Signals): Advice {
  const a = advise("postsPerWeek", s);
  return { ...a, reason: `${a.direction === "increase" ? "Grow" : a.direction === "decrease" ? "Ease off" : "Hold steady"}: ${a.reason}` };
}
