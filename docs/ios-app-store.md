# App Store submission pack (Cadence for iOS)

Everything App Store Connect asks for, drafted. **You submit**: it goes out under your Apple Developer account. Re-check the purchase rules (below) on the day you submit.

## Listing

- **Name:** Cadence: LinkedIn in your voice
- **Subtitle:** Two-minute check-ins, posts you approve
- **Category:** Productivity (secondary: Business)
- **Availability (v0.6):** United States only
- **Description:**
  Cadence turns a two-minute weekly check-in into LinkedIn posts in your own voice, and posts only the ones you approve.
  - Check in by voice or text. Voice is transcribed on your iPhone; the audio never leaves it.
  - See why every draft reads the way it does: each check it passed, what was fixed, what was held and why.
  - Approve, edit or skip in two taps. Approved posts go out once, through LinkedIn's official API, on your schedule.
  - Get a notification when drafts are ready, and keep an eye on your week from the widget.
  - Results show posts per week against your target, and reach and engagement per post.
  Cadence only states facts you gave it, and never posts without your approval unless you turn on automatic posting. Not affiliated with LinkedIn.
- **Keywords:** linkedin,posts,writing,personal brand,ghostwriter,scheduler,career,thought leadership
- **Support URL:** https://github.com/MAKaminski/cadence/issues
- **Privacy policy URL:** https://YOUR-CADENCE-HOST/privacy

## Purchases (guidelines 3.1.1 / 3.1.3)

The app sells nothing in-app. In the US storefront it shows **"Subscribe on the Cadence website"**, which opens web checkout; other storefronts see a note that subscriptions aren't available in the app yet. Existing subscribers can sign in anywhere. Before submitting, confirm the current US rule for external purchase links (it changed in 2025 and was under appeal). If in-app purchase turns out to be required alongside the link, add StoreKit (planned as v0.7).

## Sign-in (4.8) and account deletion (5.1.1(v))

- Sign in with LinkedIn **or Sign in with Apple** (needs `APPLE_CLIENT_ID` / `APPLE_CLIENT_SECRET` set on the server).
- Settings → **Delete account** deletes everything and cancels the web subscription immediately.

## App Review access (2.1)

1. On the production server: `pnpm reviewer:create` (with production `DATABASE_URL` and `BETTER_AUTH_SECRET`). It prints an email and password.
2. Review notes: *"Tap Sign in, then 'App Review sign-in' at the bottom of the page, and use the account below. It has an active plan and sample history. Posts from this account are recorded by the server and never sent to LinkedIn."*

## Privacy "nutrition label"

| Data | Collected | Linked to you | Used for tracking | Purpose |
|---|---|---|---|---|
| Name, email | Yes (from LinkedIn or Apple sign-in) | Yes | No | App functionality |
| User content (check-ins, drafts, posts) | Yes | Yes | No | App functionality |
| Device ID (push token) | Yes | Yes | No | App functionality |
| Audio | No (transcribed on device, never uploaded) | – | – | – |
| Usage data, diagnostics | No | – | – | – |

`ios/App/PrivacyInfo.xcprivacy` declares no tracking.

## Screenshots

`pnpm ios:record` (planned) captures them from the simulator against `pnpm demo`: This week, a draft with the why sheet, check-in, Results, widget.
