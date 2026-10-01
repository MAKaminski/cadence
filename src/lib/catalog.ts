// The one list of what Cadence does. The engine imports its thresholds from here, and the
// how-it-works page, the "Why this draft" panel, llms.txt and the README block are all rendered from
// it — so the docs and the behaviour cannot disagree. Change a number here and everything follows.

export const LIMITS = {
  /** LinkedIn rejects commentary longer than this. */
  hardChars: 3000,
  /** What drafts aim for; longer drafts are rewritten once. */
  targetChars: 1300,
  /** The first line is what shows before "…see more". */
  hookChars: 140,
  maxHashtags: 3,
  /** Trigram similarity at or above this against a recent post means "you've said this". */
  repeatSimilarity: 0.6,
  repeatLookback: 20,
  /** Clean approvals before automatic posting can be switched on. */
  autoPublishAfter: 5,
  /** Per-user model spend per calendar month, in US dollars. */
  monthlyCapUsd: 5,
  variants: 2,
} as const;

/** The planner's limits (src/engine/plan.ts). Times are the user's own. */
export const PLANNER = {
  /** Three posting slots a day, seven days. */
  postsPerWeekMax: 21,
  /** A hard ceiling on comment runs a day: past this LinkedIn reads an account as automated. */
  commentsPerDayMax: 40,
  /** Nothing is planned between these times. */
  quietHours: ["22:00", "06:00"] as const,
  /** Default posting slot times; slot A takes the time chosen in setup. */
  slotTimes: { A: "09:00", B: "12:30", C: "17:30" } as const,
  /** Default comment window and spacing. */
  commentWindow: ["08:00", "18:00"] as const,
  commentGapMinutes: 20,
} as const;

/** Examples (src/services/examples.ts): what you can add and how much of it steers drafting. */
export const EXAMPLES = {
  /** Largest file per example, uploaded or fetched from a URL. */
  maxBytes: 5 * 1024 * 1024,
  /** Examples kept per person; the oldest unrated ones go first past this. */
  maxPerUser: 200,
  /** How many rated examples of each kind (up, down) shape a draft. */
  guidanceMax: 8,
  /** Fetching a URL: give up after this long or this many redirects. */
  fetchTimeoutMs: 10_000,
  maxRedirects: 5,
  /** Characters of post text kept per example. */
  bodyChars: 4000,
} as const;

/** Openers and phrases that read as machine-written. A hit means one rewrite. */
export const BANNED_PHRASES = [
  "in today's fast-paced world", "game-changer", "game changer", "let that sink in", "unlock the power",
  "delve", "i'm thrilled to announce", "i am thrilled to announce", "humbled and honored", "buckle up",
  "here's the thing", "the secret sauce", "synergy", "thought leader", "agree?",
] as const;

export type Item = { name: string; what: string };

export const SETUP: Item[] = [
  { name: "What you do", what: "Your role, in a line. Every draft is written as you." },
  { name: "Who you want to reach", what: "The audience drafts are aimed at." },
  { name: "What posting should do for you", what: "Your goal steers the angle of each post." },
  { name: "Facts list", what: "The only numbers, employers, results and credentials Cadence may state. Anything else is held." },
  { name: "Three of your posts", what: "Teach your voice: sentence length, tone, what you never say." },
  { name: "Topics", what: "What you want to be known for. Drafts stay inside these." },
  { name: "Never write about", what: "Names, subjects or employers that must not appear. A match holds the draft." },
  { name: "Posts per week", what: `1 to 5 in setup; up to ${PLANNER.postsPerWeekMax} on Plan, across three daily slots.` },
  { name: "Posting days", what: "Which weekdays posts go out." },
  { name: "Time of day", what: "In your own time zone. On Plan, each slot has its own time; drag it on the day view to move it." },
  { name: "Writing model", what: "Claude Sonnet 5 (default) or Claude Opus 5." },
  { name: "Automatic posting", what: `Off by default. Unlocks after ${LIMITS.autoPublishAfter} clean approvals; any held check still waits for you.` },
];

export const WEEKLY: Item[] = [
  { name: "Check in", what: "Two minutes of rough notes: what you worked on, learned, shipped or noticed." },
  { name: "Approve", what: "Locks the exact text and schedules it into your next slot." },
  { name: "Edit", what: "Change anything. An edited draft needs approving again, and it is re-checked." },
  { name: "Skip", what: "Drop a draft. Nothing is posted." },
  { name: "Post now", what: "Send an approved post straight away instead of waiting for its slot." },
];

export const ROUTINES: (Item & { when: string })[] = [
  { name: "Drafting", when: "Right after each check-in", what: `Writes ${LIMITS.variants} variants in your voice from your notes, facts and topics, and keeps the one that passes the most checks.` },
  { name: "LinkedIn formatting", when: "Every draft", what: `Strips markdown LinkedIn doesn't render, caps hashtags at ${LIMITS.maxHashtags}, tidies line breaks and escapes characters LinkedIn treats as markup.` },
  { name: "Quality check", when: "Every draft", what: `Hook under ${LIMITS.hookChars} characters, under ${LIMITS.targetChars} characters overall, no stock phrases. A miss means one rewrite.` },
  { name: "Fact check", when: "Every draft", what: "Every number, company and credential must come from your facts list or this week's notes. Otherwise the draft is held for you." },
  { name: "Repeat and no-go check", when: "Every draft", what: `Holds a draft that mentions a never-write-about item or is ${Math.round(LIMITS.repeatSimilarity * 100)}%+ similar to one of your last ${LIMITS.repeatLookback} posts.` },
  { name: "Monthly cost cap", when: "Before every model call", what: `Stops drafting at $${LIMITS.monthlyCapUsd} of model use in a month and tells you, instead of charging more.` },
  { name: "Scheduling", when: "On approval", what: "Puts the post into your next free posting slot, in your time zone." },
  { name: "Planning", when: "When you change a number on Plan", what: `One more post or comment goes where it does the least harm (the widest gap, never on the hour); one fewer comes out of the most crowded spot. Nothing is planned between ${PLANNER.quietHours[0]} and ${PLANNER.quietHours[1]}.` },
  { name: "Pause", when: "While posting is paused on Plan", what: "Approved posts keep their place and wait; nothing is published until you resume." },
  { name: "Channel versions", when: "Every draft, for each channel you connect", what: "Rewrites the post for the channel (for X: one post within 280 characters as X counts them), runs the same checks against that channel's limits, and keeps it as its own draft for you to approve." },
  { name: "Publishing", when: "At the scheduled time", what: "Posts the exact approved text through each channel's official API (LinkedIn, X), once. A post that might have gone out is marked for review, never retried." },
  { name: "Results check", when: "1, 3 and 7 days after each post", what: "Records impressions, members reached, reactions, comments, reposts, saves, sends, link clicks, followers gained and profile views for Published and the Results charts. LinkedIn numbers are read automatically once the server's LinkedIn app is approved for post analytics (LINKEDIN_ANALYTICS=1); until then you add them on Published from each post's analytics." },
  { name: "Check-in reminder", when: "The day before your first posting day", what: "An email if you haven't checked in that week." },
  { name: "Connection reminder", when: "7 days and 1 day before LinkedIn access expires", what: "LinkedIn access lasts about 60 days. Signing in again renews it." },
];

export const COMING: Item[] = [
  { name: "Learning from results", what: "Once LinkedIn approves analytics access: which hooks, topics and times work for you, fed back into drafting." },
];

/** How a draft gets adjusted, in the order the checks run. Shown per draft and on /how-it-works. */
export const ADJUSTMENTS = [
  { outcome: "fixed", label: "Fixed automatically", items: ["Markdown removed (LinkedIn shows it as raw symbols)", `Hashtags cut to ${LIMITS.maxHashtags}`, "Line breaks normalised", "Characters LinkedIn treats as markup escaped"] },
  { outcome: "rewritten", label: "Rewritten once", items: [`First line over ${LIMITS.hookChars} characters`, "A stock phrase from the banned list", `Longer than ${LIMITS.targetChars} characters`] },
  { outcome: "held", label: "Held for you, never auto-posted", items: ["A number, company or credential not in your facts or notes", "A never-write-about match", `${Math.round(LIMITS.repeatSimilarity * 100)}%+ similar to a recent post`, "Still failing after the rewrite"] },
] as const;

export const COUNTS = { setup: SETUP.length, weekly: WEEKLY.length, routines: ROUTINES.length } as const;
