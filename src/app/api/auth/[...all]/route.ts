import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

// Sign-in, sign-out, the LinkedIn callback and the Stripe webhook (/api/auth/stripe/webhook) all live here.
export const { GET, POST } = toNextJsHandler(auth);
