import type { Metadata } from "next";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";

export const metadata: Metadata = { title: "Privacy" };

export default function Privacy() {
  return (<><SiteHeader /><main className="mx-auto max-w-2xl flex-1 px-4 py-12 [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-semibold [&_p]:mt-3 [&_p]:text-muted-foreground">
    <h1 className="text-3xl font-semibold tracking-tight">Privacy policy</h1>
    <p>Draft policy for review before launch. Last updated 2026-10-01.</p>
    <h2>What we collect</h2><p>Your email address if you sign in with an emailed link; your LinkedIn name, email and member ID when you connect LinkedIn; a LinkedIn access token that lets us publish posts you approve (stored encrypted); the same for X and any other channel you connect; the setup details, facts, sample posts and weekly check-ins you enter; drafts and what was published; billing status from Stripe. We never see your card details. If you use Examples, the links you add, the page text and image we fetch from them, the files you upload (up to 5 MB each) and your ratings.</p>
    <h2>How we use it</h2><p>Only to write and publish your posts and run your account. Your text is sent to Anthropic's Claude API to draft posts, and examples you add are sent to it to describe how they are built. Examples are visible only to you. We do not sell your data or use it to advertise.</p>
    <h2>Deleting your data</h2><p>Deleting your account removes your setup, check-ins, drafts, examples and their files, and tokens from our database. Deleting an example removes its file at once. You can also revoke Cadence's access from LinkedIn's settings at any time.</p>
    <h2>Processors</h2><p>Oracle Cloud (hosting), Stripe (billing), Anthropic (drafting and example analysis), LinkedIn (sign-in and publishing), X (publishing, if you connect it), Resend (email).</p>
  </main><SiteFooter /></>);
}
