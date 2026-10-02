// The Help page's content: one entry per thing a person can do in Cadence, each with a short recorded
// demo (scripts/help/record.ts records them from demo mode into public/help) and the questions people
// ask about it. The page (/help) and the recorder both read this list, so a topic can't lose its video.
import { LIMITS } from "./catalog";

export type HelpTopic = {
  id: string; title: string; group: HelpGroup;
  /** One or two sentences: what this is and why you'd do it. */
  summary: string;
  steps: string[];
  faqs: { q: string; a: string }[];
};
export type HelpGroup = "start" | "weekly" | "tune" | "measure";
export const HELP_GROUPS: { id: HelpGroup; title: string }[] = [
  { id: "start", title: "Getting started" },
  { id: "weekly", title: "Every week" },
  { id: "tune", title: "Tuning Cadence" },
  { id: "measure", title: "Seeing what works" },
];

export const videoOf = (id: string) => ({ src: `/help/${id}.mp4`, poster: `/help/${id}.jpg` });

export const HELP: HelpTopic[] = [
  {
    id: "sign-in", group: "start", title: "Sign in and start your trial",
    summary: "Sign in with LinkedIn (or an emailed link), then start the 7-day trial. You're charged only if you keep Cadence past day 7.",
    steps: ["Open Cadence and choose Continue with LinkedIn, or enter your email for a sign-in link.", "Add a card on Stripe's checkout page: nothing is charged for 7 days.", "You land in setup."],
    faqs: [
      { q: "Does Cadence get my LinkedIn password?", a: "No. LinkedIn's own sign-in page handles it, and Cadence receives only your name, email, photo and permission to post for you." },
      { q: "How do I cancel?", a: "Settings → Billing → Manage billing or cancel. Cancelling during the trial means you're never charged." },
    ],
  },
  {
    id: "quick-fill", group: "start", title: "Quick fill your setup from LinkedIn",
    summary: "Fill setup's first two steps in one go from your LinkedIn data, then adjust with quick picks instead of typing.",
    steps: [
      "On setup's first step, upload your LinkedIn export (LinkedIn → Settings → Data privacy → Get a copy of your data), or paste your profile page's text.",
      "Cadence fills in what you do, your facts, your posts and your picks.",
      "Click picks on or off; add your own where nothing fits. Save and continue.",
    ],
    faqs: [
      { q: "Why doesn't Cadence read my profile when I sign in?", a: "LinkedIn shares only your name, email and photo with apps like Cadence. Your headline, roles and posts come from your export or your paste." },
      { q: "What leaves my computer when I upload the export?", a: "Only the profile, positions, education, skills and posts files. Your browser reads the zip; messages and connections never leave it." },
      { q: "Can Quick fill invent facts about me?", a: "No. Facts come only from your export or what you pasted. The model only suggests picks such as audience and topics, which you can untick." },
    ],
  },
  {
    id: "best-posts", group: "start", title: "Pick your three best posts",
    summary: "Cadence learns your voice from three of your posts. Paste your Activity page and it ranks your posts by engagement and ticks the top three.",
    steps: [
      "On setup's second step, open your LinkedIn Activity page and scroll so your recent posts load.",
      "Select all, copy, and paste into Your best posts. Press Find my best posts.",
      "The top three by reactions + 2 × comments + 3 × reposts are ticked and fill the sample boxes. Tick a different one to swap.",
    ],
    faqs: [
      { q: "Why paste the Activity page?", a: "LinkedIn doesn't share post numbers with apps, but your Activity page shows them. Cadence reads only your own posts from it; reposts are left out." },
      { q: "I haven't posted much. Do I need three posts?", a: "No. Pick how you sound (plain-spoken, short paragraphs, stories…) and Cadence writes from that until you have posts." },
    ],
  },
  {
    id: "import-history", group: "start", title: "Bring your ChatGPT or Claude history",
    summary: "Your AI conversations already say what you do and how you write. Upload an export and accept the facts, topics and post ideas Cadence finds.",
    steps: ["Go to AI history (under Inputs) and choose ChatGPT or Claude.", "Upload the export .zip as it came.", "Accept or dismiss each suggestion. Accepted ones join your setup."],
    faqs: [
      { q: "What does Cadence keep from my history?", a: "Only messages you wrote, trimmed, and only what you accept joins your profile. The uploaded file is deleted once read." },
    ],
  },
  {
    id: "import-engine", group: "start", title: "Bring your LinkedIn Engine history",
    summary: "Move every post LinkedIn Engine published, with its numbers, pillar, hook and score, into Cadence so Results starts from your real history.",
    steps: ["Run scripts/engine-export.mjs (read-only) to get linkedin-engine-export.json.", "On the AI history page, upload it under Bring your LinkedIn Engine history.", "Open Results → All time."],
    faqs: [
      { q: "What if I import the same file twice?", a: "Nothing is duplicated. Posts already in Cadence only gain newer numbers." },
      { q: "Some posts show no text. Why?", a: "LinkedIn Engine didn't keep the text of a few early posts. Their numbers still count; open them on LinkedIn to read them." },
    ],
  },
  {
    id: "check-in", group: "weekly", title: "Check in and get drafts",
    summary: "Two minutes a week: tell Cadence what happened, and it drafts posts in your voice from your notes and facts.",
    steps: ["On This week, write a few lines about your week: what you did, learned or noticed.", "Save the check-in. Drafts arrive in a few seconds.", "Open Why this draft to see the angle, the checks it passed and what steered it."],
    faqs: [
      { q: "How does Cadence avoid making things up?", a: "Every number, company and credential must come from your facts or that week's notes. Anything else is held for you, with the claim named." },
      { q: "Which model writes my drafts?", a: "Claude Sonnet 5 by default, or Opus 5 if you choose it on Inputs → What drafts learn from." },
    ],
  },
  {
    id: "approve", group: "weekly", title: "Approve, edit or post now",
    summary: "Nothing posts without your approval. Approve a draft to schedule it into your next slot, edit it first, or post it right away.",
    steps: ["Read a draft and edit it if you like.", "Approve: it's scheduled into your next posting slot.", "Or press Post now under Scheduled to publish immediately."],
    faqs: [
      { q: "Can Cadence post automatically?", a: `After ${LIMITS.autoPublishAfter} clean approvals you can turn on automatic posting in Settings. Anything a check holds still waits for you.` },
      { q: "What does held mean?", a: "A check found a claim not in your facts, a never-write-about topic or a near-repeat of a recent post. The draft says which; fix it or skip it." },
    ],
  },
  {
    id: "connect-x", group: "tune", title: "Connect X in one click",
    summary: "Post to X as well as LinkedIn. Each LinkedIn draft gets an X version written to X's length and style.",
    steps: ["Go to Channels.", "Press Connect X and approve Cadence on X's page.", "From the next check-in, drafts come in pairs: LinkedIn and X."],
    faqs: [
      { q: "Do I need my own X developer keys?", a: "No. Cadence's own X app posts for everyone, each with their own consent. You just connect your account." },
      { q: "Can I keep X connected but stop drafting for it?", a: "Yes: Channels → X → turn drafting off. Your connection stays." },
    ],
  },
  {
    id: "inputs", group: "tune", title: "Change any input",
    summary: "Inputs lists everything you tell Cadence, in tabs, with a direction from your results: keep it, raise it or lower it.",
    steps: ["Open Inputs.", "Pick a tab. A number on a tab means inputs there your results say to change.", "Edit and save in place, or follow On … to the input's own page."],
    faqs: [
      { q: "Where do the directions come from?", a: "Your last 4 weeks on Results. Open How this direction is set under any input to see the exact rule." },
    ],
  },
  {
    id: "plan", group: "tune", title: "Plan how much and when",
    summary: "Set posts a week, posting days and times, and how many comments a day Cadence suggests, or pause posting.",
    steps: ["Open Plan (under Inputs).", "Drag or type posts a week and slots; set comments a day and their window.", "Pause posting any time; nothing is lost."],
    faqs: [{ q: "What happens to scheduled posts when I pause?", a: "They stay scheduled but don't go out until you resume." }],
  },
  {
    id: "numbers", group: "measure", title: "Add a post's numbers",
    summary: "LinkedIn doesn't share post analytics with most apps, so copy a post's numbers from LinkedIn into Published. They show on Results at once.",
    steps: ["Open Published and find the post.", "Open Add numbers and type impressions, reactions, comments and so on from LinkedIn's View analytics.", "Save. Each save is a new snapshot; the latest wins."],
    faqs: [{ q: "Do I have to do this for every post?", a: "Only if you want Results for it. Imported LinkedIn Engine posts arrive with their numbers." }],
  },
  {
    id: "results", group: "measure", title: "Read your Results",
    summary: "Outreach (what you put out) and impact (what it did), for 4 weeks, 12 weeks, 6 months or all time, with what works best for you.",
    steps: ["Open Results and choose a time frame.", "Read the totals: posts, impressions, engagement rate, best post.", "Scroll to What works: angle, weekday, length, time of day, hook and score."],
    faqs: [
      { q: "What is engagement rate?", a: "Reactions + comments + reshares, divided by impressions. 50 engagements on 2,000 impressions is 2.5%." },
      { q: "Why is What works only a hint?", a: "With a few posts per group, one good post moves the average. Treat it as a direction until there are more." },
    ],
  },
  {
    id: "settings", group: "tune", title: "Settings, billing and your photo",
    summary: "Change your name and photo, switch to annual billing (save 20%), turn on automatic posting, and manage API keys.",
    steps: ["Open Settings from your name at the bottom of the menu.", "Profile: name and photo. Billing: switch to annual or manage billing.", "Writing and posting: automatic posting once unlocked."],
    faqs: [{ q: "How much does annual save?", a: "12 × $20 = $240 a year monthly; annual is $192, so you save $48 (20%)." }],
  },
];
