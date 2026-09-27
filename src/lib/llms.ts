// llms.txt (https://llmstxt.org): a plain summary for AI assistants, built from the same catalog as the site.
import { ADJUSTMENTS, COMING, COUNTS, LIMITS, ROUTINES, SETUP, WEEKLY } from "@/lib/catalog";
import { FAQ, SITE } from "@/lib/site";

export function llmsTxt(full: boolean) {
  const out = [
    `# ${SITE.name}`, "", `> ${SITE.description}`, "",
    "## Pages", "",
    `- [How it works](${SITE.url}/how-it-works): every setting, weekly action and automatic routine, and how drafts are adjusted`,
    `- [Demo](${SITE.url}/demo): a recorded walkthrough of a full trial`,
    `- [Source code](${SITE.repo}): MIT-licensed; runs locally with \`pnpm demo\``,
    `- [Pricing](${SITE.url}/#pricing): $${SITE.priceUsd}/month after a ${SITE.trialDays}-day free trial`, "",
  ];
  if (!full) return [...out, "## Optional", "", `- [Full detail](${SITE.url}/llms-full.txt)`, ""].join("\n");
  const list = (title: string, xs: { name: string; what: string; when?: string }[]) =>
    [`## ${title}`, "", ...xs.map((x) => `- **${x.name}**${x.when ? ` (${x.when})` : ""}: ${x.what}`), ""];
  return [
    ...out,
    ...list(`Set up once (${COUNTS.setup})`, SETUP),
    ...list(`Every week (${COUNTS.weekly})`, WEEKLY),
    ...list(`Automatic routines (${COUNTS.routines})`, ROUTINES),
    ...list("Coming", COMING),
    "## How a draft is adjusted", "",
    ...ADJUSTMENTS.flatMap((a) => [`### ${a.label}`, ...a.items.map((i) => `- ${i}`), ""]),
    `Limits: LinkedIn maximum ${LIMITS.hardChars} characters; target ${LIMITS.targetChars}; opening line ${LIMITS.hookChars}; at most ${LIMITS.maxHashtags} hashtags; model spend capped at $${LIMITS.monthlyCapUsd}/user/month.`, "",
    "## FAQ", "", ...FAQ.flatMap((f) => [`### ${f.q}`, f.a, ""]),
  ].join("\n");
}
