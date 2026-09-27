// A fictional person for demo mode, the demo video and tests. Any resemblance is accidental.
export const PERSONA = {
  role: "Fractional CFO for climate-tech startups",
  audience: "Founders of seed to Series A climate-tech companies",
  goals: "Win two new fractional clients this quarter and be the person founders ask about climate-tech finance",
  facts: [
    "Fractional CFO for three climate-tech startups",
    "Former controller at Northwind Solar, 2019–2023",
    "Cut month-end close from 12 days to 4 at Northwind Solar",
    "Helped raise a $6M seed round for a heat-pump installer",
    "CPA",
  ].join("\n"),
  samples: [
    "Most founders build their first model around revenue. Build it around cash instead.\n\nRevenue tells you what you earned. Cash tells you how long you have. At seed stage only one of those decides whether you're around next year.\n\nStart with the bank balance and work forward, week by week.",
    "I closed the books in 12 days when I started at Northwind Solar. We got it to 4.\n\nNo new software. We stopped waiting for perfect numbers and agreed on what 'good enough by day 4' meant, line by line.\n\nSpeed came from a decision, not a tool.",
    "A founder asked me this week whether they need a CFO yet.\n\nProbably not. You need someone who can tell you, every Monday, how many weeks of cash you have and what changes it. That's a few hours a month, not a hire.",
  ] as [string, string, string],
  topics: "startup finance, climate tech, fundraising",
  noGo: "Contoso, politics",
  checkin: "This week a founder asked how to model heat-pump subsidies before they're approved. My answer: model the timing, not the amount. Also closed the books for a new client in 5 days, first month. Reading about grid interconnection queues and why they wreck revenue forecasts.",
};
