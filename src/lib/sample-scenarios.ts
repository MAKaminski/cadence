// The demo's sample-history stories (src/services/sample-history.ts writes them). Pure, so the picker can import it.
export const SCENARIOS = [
  { id: "steady", label: "Steady", blurb: "8 weeks of slightly uneven posting." },
  { id: "grow", label: "Ready to grow", blurb: "On target 4 weeks running, engagement rising, Mondays strongest." },
  { id: "ease", label: "Overstretched", blurb: "1 post a week against 3, engagement falling, Opus near the allowance, held and edited drafts, posting paused." },
] as const;
export type Scenario = (typeof SCENARIOS)[number]["id"];
