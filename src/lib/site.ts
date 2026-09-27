// Public facts about the product, shared by the landing page, /how-it-works, JSON-LD, llms.txt and the
// README block. Numbers come from catalog.ts.
import { COUNTS, LIMITS } from "@/lib/catalog";

export const SITE = {
  name: "Cadence",
  tagline: "LinkedIn posts in your own voice, from two minutes a week.",
  description: `Cadence turns a two-minute weekly check-in into LinkedIn posts in your own voice, checks every draft against facts you supplied, and publishes the ones you approve through LinkedIn's official API. ${COUNTS.setup} settings you choose once, ${COUNTS.weekly} weekly actions, ${COUNTS.routines} automatic routines. $20/month after a 7-day free trial. Open source (MIT).`,
  url: (process.env.NEXT_PUBLIC_SITE_URL ?? process.env.BETTER_AUTH_URL ?? "http://localhost:3000").replace(/\/$/, ""),
  repo: "https://github.com/MAKaminski/cadence",
  ideas: "https://github.com/MAKaminski/cadence/discussions/categories/ideas",
  priceUsd: 20,
  trialDays: 7,
};

export const FAQ: { q: string; a: string }[] = [
  { q: "Does Cadence log in to my LinkedIn account?", a: "No. You sign in with LinkedIn's official sign-in, and Cadence posts through LinkedIn's official API with the 'share on LinkedIn' permission. It never uses your password, a browser extension or automated clicking." },
  { q: "Will it post without asking me?", a: `Not unless you choose that. Every draft waits for your approval. After ${LIMITS.autoPublishAfter} clean approvals you can switch on automatic posting for drafts that pass every check; anything held still waits for you.` },
  { q: "Can it make things up about me?", a: "Every number, company and credential in a draft must come from your facts list or that week's notes. Anything else is held for you, with the exact claim named." },
  { q: "How does Cadence decide to change a draft?", a: `It fixes formatting automatically (markdown, extra hashtags, line breaks), rewrites once for a weak opening line, a stock phrase or a draft over ${LIMITS.targetChars} characters, and holds anything with an unsupported claim, a never-write-about match, or ${Math.round(LIMITS.repeatSimilarity * 100)}%+ similarity to a recent post. Each draft shows which of these happened.` },
  { q: "Which AI writes the drafts?", a: "Anthropic's Claude. Claude Sonnet 5 by default; you can switch to Claude Opus 5 for richer drafts." },
  { q: "What does it cost?", a: `$${SITE.priceUsd} a month after a ${SITE.trialDays}-day free trial, card first. Cancel anytime in Settings.` },
  { q: "Does it comment, send connection requests or messages?", a: "No. LinkedIn's API doesn't allow apps to do those things for members, and Cadence only does what the official API allows: posting." },
  { q: "Can I run it myself?", a: "Yes. The code is open source under the MIT licence. `pnpm demo` runs the whole product locally with no keys; the README covers self-hosting." },
  { q: "Will it support other platforms?", a: "LinkedIn first. Every post, account and result is already tagged with its platform, so adding one is an adapter, not a rebuild. Tell us which you want in GitHub Discussions." },
];
