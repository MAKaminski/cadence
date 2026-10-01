// `pnpm signin:link you@example.com [--comp]` prints a one-time sign-in link for that email, made on the
// server, so the owner can always get in: no email provider and no LinkedIn app needed. It is the same
// link email sign-in would send (15 minutes, works once, creates the account if there is none).
// On the server: docker compose -f deploy/compose.yml --env-file deploy/.env run --rm web pnpm signin:link you@example.com
//
// --comp also gives that account a complimentary plan for a year (as `pnpm reviewer:create` does), so it
// skips the Stripe trial step: for the owner while Stripe isn't set up. Run it again after first sign-in.
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";

const args = process.argv.slice(2);
const email = args.find((a) => !a.startsWith("--"))?.trim().toLowerCase();
if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error("Usage: pnpm signin:link you@example.com [--comp]");
  process.exit(1);
}
const { auth, PLAN } = await import("../src/lib/auth");
const { magicLinkSink } = await import("../src/lib/magic-link");
const { db } = await import("../src/db");
const s = await import("../src/db/schema");

let link = "";
magicLinkSink.take = (l) => { link = l; };
await auth.api.signInMagicLink({ body: { email, callbackURL: "/app" }, headers: new Headers() });

if (args.includes("--comp")) {
  const [u] = await db.select({ id: s.user.id }).from(s.user).where(eq(s.user.email, email));
  if (!u) console.log("No account yet: open the link to create it, then run this again with --comp.");
  else {
    const yearOut = new Date(Date.now() + 365 * 86_400_000);
    await db.delete(s.subscription).where(and(eq(s.subscription.referenceId, u.id), eq(s.subscription.plan, PLAN)));
    await db.insert(s.subscription).values({ id: randomUUID(), plan: PLAN, referenceId: u.id, status: "active", periodStart: new Date(), periodEnd: yearOut, cancelAtPeriodEnd: false });
    console.log(`Complimentary plan on ${email} until ${yearOut.toISOString().slice(0, 10)}.`);
  }
}
console.log(`Sign-in link for ${email} (works once, for 15 minutes):\n\n  ${link}\n`);
process.exit(0);
