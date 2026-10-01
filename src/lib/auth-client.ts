"use client";
import { createAuthClient } from "better-auth/react";
import { anonymousClient, magicLinkClient } from "better-auth/client/plugins";
import { stripeClient } from "@better-auth/stripe/client";
import { oauthProviderClient } from "@better-auth/oauth-provider/client";

export const authClient = createAuthClient({ plugins: [stripeClient({ subscription: true }), anonymousClient(), magicLinkClient(), oauthProviderClient()] });
