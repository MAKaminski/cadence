# Cadence demo guide

A full trial, recorded from the app itself in **demo mode**: real screens, real checks and real scheduling, with LinkedIn, Stripe and Claude replaced by local stand-ins.

- **Watch:** [cadence-demo.mp4](https://github.com/MAKaminski/cadence/releases/latest/download/cadence-demo.mp4) (86 s, captions burned in, plus a [WebVTT file](../public/demo/cadence-demo.vtt))
- **Try it yourself:** `pnpm demo`, then open <http://localhost:3000> and choose *Continue as demo user* ([setup](../README.md#run-it-in-two-minutes-no-keys))
- **Re-record it:** `pnpm demo:record` (Playwright drives the app; ffmpeg encodes it)

| Time | Chapter |
|---|---|
| 0:00 | Cadence: LinkedIn posts in your own voice, from two minutes a week. $20/month after a 7-day trial. |
| 0:05 | Everything is visible: 12 settings you choose once, 5 weekly actions, 10 automatic routines |
| 0:10 | Every draft is fixed, rewritten once, or held for you, by the same published rules |
| 0:15 | Sign in. Real users use LinkedIn's official sign-in; the demo uses a throwaway account |
| 0:18 | Card first, 7 days free. Real users go to Stripe Checkout; the demo takes no card |
| 0:22 | Setup 1 of 3: who you are, who you want to reach, and the only facts Cadence may state |
| 0:27 | Setup 2 of 3: three of your own posts teach it your voice, plus topics and a never-write-about list |
| 0:32 | Setup 3 of 3: posts per week, days, time, and the writing model (Claude Sonnet 5 or Opus 5) |
| 0:38 | Each week: two minutes of rough notes. That's the only regular input |
| 0:43 | Cadence writes 2 versions of each post in your voice, checks both, and keeps the better one |
| 0:47 | Drafts are ready. Nothing posts until you approve it |
| 0:51 | Why this draft: the angle, every check it passed, what was fixed automatically, and what it cost |
| 0:58 | Edit anything. Your version is re-checked but never rewritten: you're the author |
| 1:04 | Approved: the exact text is locked and scheduled into your next posting slot, in your time zone |
| 1:08 | Or post now. It goes out once through LinkedIn's official API (recorded, not sent, in the demo) |
| 1:12 | Published. Results arrive once LinkedIn approves analytics; the demo shows sample numbers |
| 1:16 | Settings: edit your setup, see this month's model use, and unlock automatic posting after 5 clean approvals |
| 1:21 | Every rule is public. Run it yourself: git clone, pnpm install, pnpm demo. MIT licensed. |

## 1. What Cadence is

The landing page says what it does and what it costs, and shows every rule it follows. Nothing is hidden behind a sales call.

**0:00**: Cadence: LinkedIn posts in your own voice, from two minutes a week. $20/month after a 7-day trial.

![Cadence: LinkedIn posts in your own voice, from two minutes a week. $20/month after a 7-day trial.](demo/still-01.png)

**0:05**: Everything is visible: 12 settings you choose once, 5 weekly actions, 10 automatic routines

![Everything is visible: 12 settings you choose once, 5 weekly actions, 10 automatic routines](demo/still-02.png)

**0:10**: Every draft is fixed, rewritten once, or held for you, by the same published rules

![Every draft is fixed, rewritten once, or held for you, by the same published rules](demo/still-03.png)

## 2. Sign up and start the trial

Real users sign in with LinkedIn's official sign-in, which also grants permission to post the drafts they approve, then add a card in Stripe Checkout for a 7-day free trial. Demo mode swaps both for local stand-ins so no account or card is needed.

**0:15**: Sign in. Real users use LinkedIn's official sign-in; the demo uses a throwaway account

![Sign in. Real users use LinkedIn's official sign-in; the demo uses a throwaway account](demo/still-04.png)

**0:18**: Card first, 7 days free. Real users go to Stripe Checkout; the demo takes no card

![Card first, 7 days free. Real users go to Stripe Checkout; the demo takes no card](demo/still-05.png)

## 3. Set up once (about 8 minutes)

Three short steps, each explaining why it asks. The **facts list** is the most important field: it is the only source of claims Cadence may make about you.

**0:22**: Setup 1 of 3: who you are, who you want to reach, and the only facts Cadence may state

![Setup 1 of 3: who you are, who you want to reach, and the only facts Cadence may state](demo/still-06.png)

**0:27**: Setup 2 of 3: three of your own posts teach it your voice, plus topics and a never-write-about list

![Setup 2 of 3: three of your own posts teach it your voice, plus topics and a never-write-about list](demo/still-07.png)

**0:32**: Setup 3 of 3: posts per week, days, time, and the writing model (Claude Sonnet 5 or Opus 5)

![Setup 3 of 3: posts per week, days, time, and the writing model (Claude Sonnet 5 or Opus 5)](demo/still-08.png)

## 4. Check in each week (about 2 minutes)

Rough notes are enough. Cadence writes one post per weekly slot, two versions of each, runs every check on both, and keeps the better one.

**0:38**: Each week: two minutes of rough notes. That's the only regular input

![Each week: two minutes of rough notes. That's the only regular input](demo/still-09.png)

**0:43**: Cadence writes 2 versions of each post in your voice, checks both, and keeps the better one

![Cadence writes 2 versions of each post in your voice, checks both, and keeps the better one](demo/still-10.png)

**0:47**: Drafts are ready. Nothing posts until you approve it

![Drafts are ready. Nothing posts until you approve it](demo/still-11.png)

## 5. See why each draft reads the way it does

Open **Why this draft** on any draft for the angle, every check with its result, what was fixed automatically, the model and the cost. This is how you learn what Cadence does with your input, and where to ask for more.

**0:51**: Why this draft: the angle, every check it passed, what was fixed automatically, and what it cost

![Why this draft: the angle, every check it passed, what was fixed automatically, and what it cost](demo/still-12.png)

## 6. Edit, approve, post

Your edits are re-checked but never rewritten. Approving locks the exact text; only that text can be published, once. **Post now** skips the wait.

**0:58**: Edit anything. Your version is re-checked but never rewritten: you're the author

![Edit anything. Your version is re-checked but never rewritten: you're the author](demo/still-13.png)

**1:04**: Approved: the exact text is locked and scheduled into your next posting slot, in your time zone

![Approved: the exact text is locked and scheduled into your next posting slot, in your time zone](demo/still-14.png)

**1:08**: Or post now. It goes out once through LinkedIn's official API (recorded, not sent, in the demo)

![Or post now. It goes out once through LinkedIn's official API (recorded, not sent, in the demo)](demo/still-15.png)

## 7. Results, settings and the rules

Published posts are listed with results (sample numbers in demo mode until LinkedIn approves analytics). Settings show model use against the monthly allowance, and automatic posting unlocks after 5 clean approvals.

**1:12**: Published. Results arrive once LinkedIn approves analytics; the demo shows sample numbers

![Published. Results arrive once LinkedIn approves analytics; the demo shows sample numbers](demo/still-16.png)

**1:16**: Settings: edit your setup, see this month's model use, and unlock automatic posting after 5 clean approvals

![Settings: edit your setup, see this month's model use, and unlock automatic posting after 5 clean approvals](demo/still-17.png)

**1:21**: Every rule is public. Run it yourself: git clone, pnpm install, pnpm demo. MIT licensed.

![Every rule is public. Run it yourself: git clone, pnpm install, pnpm demo. MIT licensed.](demo/still-18.png)

## What you can configure, at a glance

See the generated tables in the [README](../README.md#what-cadence-does), or `/how-it-works` in the app. Missing something? [Suggest it](https://github.com/MAKaminski/cadence/discussions/categories/ideas).
