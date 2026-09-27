import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { anonymous } from "better-auth/plugins";
import { stripe } from "@better-auth/stripe";
import Stripe from "stripe";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { platformAccounts } from "@/db/schema";
import { asUser } from "@/db";
import { isDemo } from "@/lib/mode";

export const PLAN = "cadence";
export const TRIAL_DAYS = 7;

const stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY ?? "sk_test_placeholder", {
  apiVersion: "2026-08-26.dahlia",
});

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: "pg", schema }),
  socialProviders: {
    linkedin: {
      clientId: process.env.LINKEDIN_CLIENT_ID ?? "",
      clientSecret: process.env.LINKEDIN_CLIENT_SECRET ?? "",
      // Sign-in and posting in ONE consent. Self-serve LinkedIn apps get no refresh token, so the
      // ~60-day access token is renewed by signing in again; asking for both here means every
      // sign-in renews the posting permission too.
      scope: ["w_member_social"],
    },
  },
  account: {
    encryptOAuthTokens: true,
    accountLinking: { enabled: true, trustedProviders: ["linkedin"] },
  },
  databaseHooks: {
    // Keep the platform-level view of the LinkedIn connection current on every sign-in. The token stays
    // in Better Auth's (encrypted) account row; this row carries identity, status and expiry.
    account: {
      create: { after: async (acc) => { await linkPlatformAccount(acc); } },
      update: { after: async (acc) => { await linkPlatformAccount(acc); } },
    },
  },
  plugins: [
    stripe({
      stripeClient,
      stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",
      createCustomerOnSignUp: !isDemo(), // demo mode never talks to Stripe
      subscription: {
        enabled: true,
        plans: [{ name: PLAN, priceId: process.env.STRIPE_PRICE_ID ?? "", freeTrial: { days: TRIAL_DAYS } }],
      },
    }),
    // Demo sign-in, registered only when mode.ts allows demo mode (localhost or CI). Never in production.
    ...(isDemo() ? [anonymous({ emailDomainName: "demo.cadence.local", generateName: () => "Dana Reyes" })] : []),
    nextCookies(), // must stay last: lets server actions set the session cookie
  ],
});

export type Session = typeof auth.$Infer.Session;

async function linkPlatformAccount(acc: { providerId: string; accountId: string; userId: string; accessTokenExpiresAt?: Date | null }) {
  if (acc.providerId !== "linkedin") return;
  const values = { status: "active" as const, expiresAt: acc.accessTokenExpiresAt ?? null };
  await asUser(acc.userId, (tx) => tx.insert(platformAccounts)
    .values({ userId: acc.userId, platform: "linkedin", externalId: `urn:li:person:${acc.accountId}`, ...values })
    .onConflictDoUpdate({ target: [platformAccounts.userId, platformAccounts.platform, platformAccounts.externalId], set: values }));
}
