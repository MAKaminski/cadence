// Numbers a person copies from LinkedIn's own post analytics into Cadence, for when the server can't
// read them itself (no analytics approval yet). Pure, so it is tested without a database
// (tests/metric-input.test.ts).
import type { MetricDetails } from "@/platforms/types";

export const MANUAL_FIELDS = [
  { key: "impressions", label: "Impressions", required: true },
  { key: "membersReached", label: "Members reached", required: false },
  { key: "reactions", label: "Reactions", required: false },
  { key: "comments", label: "Comments", required: false },
  { key: "reshares", label: "Reposts", required: false },
  { key: "saves", label: "Saves", required: false },
  { key: "sends", label: "Sends", required: false },
  { key: "linkClicks", label: "Link clicks", required: false },
  { key: "followersGained", label: "Followers gained", required: false },
  { key: "profileViews", label: "Profile views", required: false },
] as const;
export type ManualKey = (typeof MANUAL_FIELDS)[number]["key"];

export type ManualNumbers = { impressions: number; reactions: number; comments: number; reshares: number; details: MetricDetails };

const MAX = 1_000_000_000;

/** Whole numbers, commas allowed ("1,204"); blanks are 0, except Impressions which must be given. */
export function parseManualNumbers(raw: Partial<Record<ManualKey, string | number | null | undefined>>): { ok: true; value: ManualNumbers } | { ok: false; error: string } {
  const out: Partial<Record<ManualKey, number>> = {};
  for (const f of MANUAL_FIELDS) {
    const v = String(raw[f.key] ?? "").replace(/[,\s]/g, "");
    if (!v) {
      if (f.required) return { ok: false, error: `${f.label} is required.` };
      continue;
    }
    if (!/^\d+$/.test(v) || Number(v) > MAX) return { ok: false, error: `${f.label} must be a whole number of 0 or more.` };
    out[f.key] = Number(v);
  }
  if (out.membersReached != null && out.membersReached > out.impressions!) return { ok: false, error: "Members reached can't be more than impressions." };
  const details: MetricDetails = {};
  for (const k of ["membersReached", "saves", "sends", "linkClicks", "followersGained", "profileViews"] as const) if (out[k] != null) details[k] = out[k];
  return { ok: true, value: { impressions: out.impressions!, reactions: out.reactions ?? 0, comments: out.comments ?? 0, reshares: out.reshares ?? 0, details } };
}
