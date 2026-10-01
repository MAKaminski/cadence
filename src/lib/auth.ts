import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { anonymous, jwt, magicLink } from "better-auth/plugins";
import { oauthProvider } from "@better-auth/oauth-provider";
import { stripe } from "@better-auth/stripe";
import { apiKey } from "@better-auth/api-key";
import Stripe from "stripe";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { platformAccounts } from "@/db/schema";
import { asUser } from "@/db";
import { isDemo } from "@/lib/mode";
import { specByProvider } from "@/platforms/registry";
import { sendEmail } from "@/lib/email";
import { MAGIC_LINK_MINUTES, confirmUrl, magicLinkEmail, magicLinkSink, safeNext } from "@/lib/magic-link";
import { emailConfigured } from "@/lib/setup-check";
import { ANALYTICS_SCOPE, linkedinAnalytics } from "@/platforms/linkedin-analytics";

export const PLAN = "cadence";
export const TRIAL_DAYS = 7;
const BASE = (process.env.BETTER_AUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");
/** The MCP endpoint is the one protected resource OAuth tokens are issued for (RFC 8707 audience). */
export const MCP_RESOURCE = `${BASE}/api/mcp`;
/** The REST API is the second protected resource: the iOS app gets tokens for it. */
export const API_RESOURCE = `${BASE}/api/v1`;
/** Better Auth mounts at /api/auth, so that is the OAuth issuer. */
export const ISSUER = `${BASE}/api/auth`;
/** Scopes an assistant can ask for. `cadence:approve` is optional on the consent screen. */
export const OAUTH_SCOPES = ["cadence:read", "cadence:write", "cadence:approve"] as const;

/** Email sign-in needs an email to arrive: always on in demo mode (the link is printed to the server
 *  log), and in production only once Resend is configured. Otherwise the login page offers LinkedIn only. */
export const emailSignIn = () => isDemo() || emailConfigured(process.env);

/** Per-key API limit: requests per window. Shown in the docs and sent as RateLimit headers. */
export const API_LIMIT = { max: 60, windowMs: 60_000 } as const;

// `||`, not `??`: deploy/.env lists every key, so an unset one arrives as "" and new Stripe("") throws while
// this module loads, which takes down every sign-in route. The placeholder is never used to call Stripe.
export const stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY || "sk_test_placeholder", {
  apiVersion: "2026-08-26.dahlia",
});

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  // The jwt plugin's /token route would clash with OAuth; tokens are issued at /oauth2/token.
  disabledPaths: ["/token"],
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: "pg", schema }),
  trustedOrigins: ["https://appleid.apple.com"], // Apple posts its sign-in response back (form_post)
  // Email and password exist only for App Review: sign-up is disabled, so the only such accounts are
  // the ones `pnpm reviewer:create` makes (see scripts/reviewer.mts). Their posts never reach LinkedIn.
  emailAndPassword: { enabled: true, disableSignUp: true },
  socialProviders: {
    // Sign in with Apple (App Store guideline 4.8), on only when its keys are configured. Apple users
    // connect LinkedIn afterwards from Settings.
    ...(process.env.APPLE_CLIENT_ID && process.env.APPLE_CLIENT_SECRET
      ? { apple: { clientId: process.env.APPLE_CLIENT_ID, clientSecret: process.env.APPLE_CLIENT_SECRET } }
      : {}),
    linkedin: {
      clientId: process.env.LINKEDIN_CLIENT_ID ?? "",
      clientSecret: process.env.LINKEDIN_CLIENT_SECRET ?? "",
      // Sign-in and posting in ONE consent. Self-serve LinkedIn apps get no refresh token, so the
      // ~60-day access token is renewed by signing in again; asking for both here means every
      // sign-in renews the posting permission too.
      // Post numbers (impressions, reach, reactions…) need r_member_postAnalytics, which LinkedIn grants
      // only to apps it has approved; asking for it otherwise breaks sign-in, so it waits for LINKEDIN_ANALYTICS=1.
      scope: ["w_member_social", ...(linkedinAnalytics() ? [ANALYTICS_SCOPE] : [])],
    },
    // X is a channel to post to, never a way to sign up: people connect it from Channels while signed
    // in (linkSocial). Cadence's own X app (X_CLIENT_ID/SECRET) does the posting for everyone, so
    // nobody brings their own keys. offline.access gives a refresh token, so the connection lasts.
    twitter: {
      clientId: process.env.X_CLIENT_ID ?? "",
      clientSecret: process.env.X_CLIENT_SECRET ?? "",
      scope: ["tweet.write"],
      disableSignUp: true,
      disableImplicitSignUp: true,
    },
  },
  account: {
    encryptOAuthTokens: true,
    // allowDifferentEmails: connecting a channel while signed in links it whatever email it reports
    // (X often reports none). It applies only to that explicit, signed-in link, never to sign-in.
    accountLinking: { enabled: true, trustedProviders: ["linkedin", "apple"], allowDifferentEmails: true },
  },
  databaseHooks: {
    // Keep the platform-level view of the LinkedIn connection current on every sign-in. The token stays
    // in Better Auth's (encrypted) account row; this row carries identity, status and expiry.
    account: {
      create: { after: async (acc) => { await linkPlatformAccount(acc); await linkedinPhoto(acc); } },
      update: { after: async (acc) => { await linkPlatformAccount(acc); await linkedinPhoto(acc); } },
    },
  },
  plugins: [
    stripe({
      stripeClient,
      stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",
      // Demo mode never talks to Stripe, and neither does a server without a Stripe key yet (the customer is
      // created at checkout instead), so sign-up doesn't call Stripe with the placeholder key.
      createCustomerOnSignUp: !isDemo() && Boolean(process.env.STRIPE_SECRET_KEY),
      subscription: {
        enabled: true,
        plans: [{
          name: PLAN, priceId: process.env.STRIPE_PRICE_ID ?? "", freeTrial: { days: TRIAL_DAYS },
          // Optional yearly price at 20% off (Settings → Billing offers the switch only when it's set).
          ...(process.env.STRIPE_ANNUAL_PRICE_ID ? { annualDiscountPriceId: process.env.STRIPE_ANNUAL_PRICE_ID } : {}),
        }],
      },
    }),
    // Keys for the public API and CLI. Scopes and limits are set server-side only (src/lib/api-keys.ts).
    apiKey({
      defaultPrefix: "cad_",
      rateLimit: { enabled: true, timeWindow: API_LIMIT.windowMs, maxRequests: API_LIMIT.max },
      enableMetadata: true,
    }),
    // OAuth 2.1 for assistants (Claude, Codex, Cursor, VS Code) connecting to the MCP server. Clients
    // register themselves (RFC 7591), the user signs in and consents on /oauth/consent, and access
    // tokens are JWTs bound to the MCP resource.
    jwt(),
    oauthProvider({
      loginPage: "/login",
      consentPage: "/oauth/consent",
      scopes: ["openid", "profile", "offline_access", ...OAUTH_SCOPES],
      allowDynamicClientRegistration: true,
      allowUnauthenticatedClientRegistration: true,
      resources: [MCP_RESOURCE, API_RESOURCE],
      // Every registered client (assistants, the iOS app) may request either resource; each token is
      // still bound to the one resource it was issued for.
      clientRegistrationDefaultResources: [MCP_RESOURCE, API_RESOURCE],
    }),
    // Sign in (and sign up) with an emailed link. LinkedIn is then connected from onboarding or Settings,
    // and linked by email if the person signs in with LinkedIn instead (accountLinking above).
    magicLink({
      expiresIn: MAGIC_LINK_MINUTES * 60,
      storeToken: "hashed",
      rateLimit: { window: 60, max: 3 },
      sendMagicLink: async ({ email, token, url }) => {
        const next = safeNext(new URL(url).searchParams.get("callbackURL"), BASE);
        const link = confirmUrl(BASE, token, next);
        // `pnpm signin:link` (run on the server) takes the link itself instead of emailing it.
        if (magicLinkSink.take) return magicLinkSink.take(link);
        if (!emailSignIn()) throw new Error("Email sign-in is not configured on this server.");
        const { subject, text } = magicLinkEmail(link);
        await sendEmail(email, subject, text);
      },
    }),
    // Demo sign-in, registered only when mode.ts allows demo mode (localhost or CI). Never in production.
    ...(isDemo() ? [anonymous({ emailDomainName: "demo.cadence.local", generateName: () => "Dana Reyes" })] : []),
    nextCookies(), // must stay last: lets server actions set the session cookie
  ],
});

export type Session = typeof auth.$Infer.Session;

/** An email sign-up that connects LinkedIn later gets its LinkedIn photo as the default, like a LinkedIn
 *  sign-up does (see fillLinkedInPhoto). The token is decrypted server-side by Better Auth. */
async function linkedinPhoto(acc: { id?: string; providerId: string; userId: string }) {
  if (acc.providerId !== "linkedin" || !acc.id) return;
  const { fillLinkedInPhoto } = await import("@/services/avatar");
  await fillLinkedInPhoto(acc.userId, async () =>
    (await auth.api.getAccessToken({ body: { accountId: acc.id!, userId: acc.userId } })).accessToken);
}

/** Keep platform_accounts (the channel view) in step with Better Auth's account rows (the tokens). */
async function linkPlatformAccount(acc: { providerId: string; accountId: string; userId: string; accessTokenExpiresAt?: Date | null; refreshToken?: string | null }) {
  const channel = specByProvider(acc.providerId);
  if (!channel) return;
  // A channel with a refresh token renews itself; only LinkedIn's ~60-day token really expires.
  const values = { status: "active" as const, expiresAt: acc.refreshToken ? null : acc.accessTokenExpiresAt ?? null };
  const externalId = channel.id === "linkedin" ? `urn:li:person:${acc.accountId}` : acc.accountId;
  await asUser(acc.userId, (tx) => tx.insert(platformAccounts)
    .values({ userId: acc.userId, platform: channel.id, externalId, ...values })
    .onConflictDoUpdate({ target: [platformAccounts.userId, platformAccounts.platform, platformAccounts.externalId], set: values }));
}
