// `pnpm reviewer:create [email]` creates (or resets) the App Review account on the server whose
// DATABASE_URL and BETTER_AUTH_SECRET are set. Run it against production before submitting the app.
//
// The account:
//  - signs in with email and password (public sign-up stays disabled, so this is the only way in);
//  - has a complimentary active plan and a finished setup, with the fictional demo persona;
//  - has a LinkedIn "connection" flagged `reviewer`, so every post goes to the recording publisher and
//    nothing can ever reach LinkedIn;
//  - has eight weeks of sample history, so Results has something to show.
// The password is printed once. Put it in App Store Connect's review notes; never commit it.
import { randomBytes, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";

const email = process.argv[2] ?? "app-review@example.com";
const { auth, PLAN } = await import("../src/lib/auth");
const { db, asUser } = await import("../src/db");
const s = await import("../src/db/schema");
const { PERSONA } = await import("../src/lib/demo-persona");
const { addSampleHistory } = await import("../src/services/sample-history");

const lines = (x: string) => x.split(/\n|,/).map((l) => l.trim()).filter(Boolean);
const ctx = await auth.$context;
const password = randomBytes(12).toString("base64url");

const [existing] = await db.select().from(s.user).where(eq(s.user.email, email));
if (existing) {
  await db.delete(s.subscription).where(eq(s.subscription.referenceId, existing.id));
  await db.delete(s.user).where(eq(s.user.id, existing.id)); // cascades everything else
}
const u = await ctx.internalAdapter.createUser({ email, name: "App Review", emailVerified: true }, { method: "admin" });
await ctx.internalAdapter.linkAccount({ userId: u.id, providerId: "credential", accountId: u.id, password: await ctx.password.hash(password) });
const yearOut = new Date(Date.now() + 365 * 86_400_000);
await db.insert(s.subscription).values({ id: randomUUID(), plan: PLAN, referenceId: u.id, status: "active", periodStart: new Date(), periodEnd: yearOut, cancelAtPeriodEnd: false });
await asUser(u.id, async (tx) => {
  await tx.insert(s.profiles).values({
    userId: u.id, about: { role: PERSONA.role, audience: PERSONA.audience, goals: PERSONA.goals }, facts: lines(PERSONA.facts),
    voiceSamples: PERSONA.samples, topics: lines(PERSONA.topics), noGo: lines(PERSONA.noGo), onboardingStep: 4,
  });
  await tx.insert(s.platformAccounts).values({
    userId: u.id, platform: "linkedin", externalId: "urn:li:person:app-review", handle: "App Review (posts are recorded, never sent)",
    expiresAt: yearOut, platformData: { reviewer: true },
  });
});
await addSampleHistory(u.id);

console.log(`App Review account ready.\n  email:    ${email}\n  password: ${password}\nPosts from this account are recorded and never sent to LinkedIn.`);
process.exit(0);
