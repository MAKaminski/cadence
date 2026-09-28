import { z } from "zod";
import { isDemo } from "./mode";

// Every secret comes from the environment (deploy/.env on the server, the shell in development).
// Nothing here has a default that would let the app run half-configured. Demo mode (see mode.ts) needs
// only the database and the auth secret, because it replaces every outside service.
const core = z.object({
  DATABASE_URL: z.string().url(),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.string().url(),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  RESEND_API_KEY: z.string().min(1).optional(),
  EMAIL_FROM: z.string().min(3).optional(),
});
const live = core.extend({
  LINKEDIN_CLIENT_ID: z.string().min(1),
  LINKEDIN_CLIENT_SECRET: z.string().min(1),
  STRIPE_SECRET_KEY: z.string().startsWith("sk_"),
  STRIPE_WEBHOOK_SECRET: z.string().startsWith("whsec_"),
  STRIPE_PRICE_ID: z.string().startsWith("price_"),
  ANTHROPIC_API_KEY: z.string().min(1),
});

export type Env = z.infer<typeof core> & Partial<z.infer<typeof live>>;

let cached: Env | null = null;

/** Read and validate the environment once. Throws with the names of what is missing. */
export function env(): Env {
  if (cached) return cached;
  const parsed = (isDemo() ? core : live).safeParse(process.env);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Cadence is missing or has invalid settings: ${missing}`);
  }
  cached = parsed.data;
  return cached;
}
