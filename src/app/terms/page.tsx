import type { Metadata } from "next";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";

export const metadata: Metadata = { title: "Terms" };

export default function Terms() {
  return (<><SiteHeader /><main className="mx-auto max-w-2xl flex-1 px-4 py-12 [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-semibold [&_p]:mt-3 [&_p]:text-muted-foreground">
    <h1 className="text-3xl font-semibold tracking-tight">Terms of service</h1>
    <p>Draft terms for review before launch. Last updated 2026-09-27.</p>
    <h2>The service</h2><p>Cadence drafts LinkedIn posts from information you provide and, with your approval, publishes them through LinkedIn's official API on your behalf.</p>
    <h2>Your account and content</h2><p>You are responsible for what is published from your account. Cadence publishes only drafts you approve, or drafts produced under automatic posting after you turn it on. You keep ownership of everything you provide and everything published.</p>
    <h2>Billing</h2><p>After a 7-day free trial the plan costs $20 per month, billed by Stripe. Cancel anytime from Settings; you keep access until the end of the paid period. Monthly writing usage is capped to keep the service fair.</p>
    <h2>Acceptable use</h2><p>Don't use Cadence to post content you don't have the right to share, to mislead, or in breach of LinkedIn's terms.</p>
    <h2 id="api">API, CLI and connected assistants</h2>
    <p>API keys and connected assistants (such as Claude or Codex) act as you, with only the scopes you grant. Keep keys secret; revoke them in Settings. Each key is limited to 60 requests a minute and check-ins to 20 a day; we may change limits with 30 days' notice in the changelog.</p>
    <p>No key or assistant can publish immediately. A draft is only published after it is approved (by you, or by a tool you granted the separate approve scope) and only at your scheduled time. Drafts are written by AI and can be wrong; approving one is your review of it.</p>
    <p>Cadence is not affiliated with, endorsed by or sponsored by LinkedIn, and the API cannot comment, message or send connection requests. We may suspend keys used to abuse the service or LinkedIn.</p>
    <h2>Changes and contact</h2><p>We will tell you by email before material changes take effect.</p>
  </main><SiteFooter /></>);
}
