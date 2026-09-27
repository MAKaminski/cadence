import type { Metadata } from "next";
import Link from "next/link";
import { SITE } from "@/lib/site";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CopyBlock } from "./copy";

export const metadata: Metadata = {
  title: "Use Cadence from Claude, Codex, Cursor or VS Code",
  description: "Connect Cadence to your AI assistant over MCP: do your weekly check-in in conversation, review drafts and see results. One click or one command.",
  alternates: { canonical: "/integrations" },
};

const TOOLS = [
  ["get_status", "Plan, connection, this week's posts vs target"],
  ["get_setup", "Your facts, topics, rhythm and model"],
  ["list_drafts / get_draft", "Drafts, and why each reads the way it does"],
  ["get_results", "Outreach and impact"],
  ["save_checkin", "Your weekly notes → drafts"],
  ["edit_draft / skip_draft", "Change or drop a draft"],
  ["approve_draft", "Schedule a draft, only if you allowed approving"],
] as const;

export default function Integrations() {
  const url = `${SITE.url}/api/mcp`;
  const cursor = `cursor://anysphere.cursor-deeplink/mcp/install?name=cadence&config=${Buffer.from(JSON.stringify({ url })).toString("base64")}`;
  const vscode = `vscode:mcp/install?${encodeURIComponent(JSON.stringify({ name: "cadence", type: "http", url }))}`;
  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-10 px-4 py-16">
        <header className="flex flex-col gap-3">
          <h1 className="text-4xl font-semibold tracking-tight">Use Cadence from your AI assistant</h1>
          <p className="max-w-3xl text-lg text-muted-foreground">
            Cadence is an MCP server. Connect it once, then say "let's do my Cadence check-in" and your assistant interviews you,
            saves your notes, walks you through the drafts and why each reads the way it does, and shows your results.
            You choose what it may do; it can never post immediately.
          </p>
          <p className="text-sm text-muted-foreground">Server URL: <code className="rounded bg-muted px-1.5 py-0.5">{url}</code></p>
        </header>

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>Claude (web and desktop)</CardTitle><CardDescription>Settings → Connectors → Add custom connector, then paste the server URL. You'll sign in to Cadence and choose what Claude may do.</CardDescription></CardHeader>
            <CardContent className="flex flex-col gap-3">
              <CopyBlock label="server URL" text={url} />
              <Button render={<a href="https://claude.ai/settings/connectors" target="_blank" rel="noreferrer" />}>Open Claude connectors</Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Claude Code</CardTitle><CardDescription>One command. Run /mcp in Claude Code to sign in.</CardDescription></CardHeader>
            <CardContent><CopyBlock label="Claude Code command" text={`claude mcp add --transport http cadence ${url}`} /></CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Codex</CardTitle><CardDescription>Add to ~/.codex/config.toml, then sign in when Codex asks. Or use an API key from Settings as a bearer token.</CardDescription></CardHeader>
            <CardContent><CopyBlock label="Codex config" text={`[mcp_servers.cadence]\nurl = "${url}"`} /></CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Cursor and VS Code</CardTitle><CardDescription>One click installs the server; the editor opens Cadence's sign-in.</CardDescription></CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button render={<a href={cursor} />}>Add to Cursor</Button>
              <Button variant="outline" render={<a href={vscode} />}>Add to VS Code</Button>
            </CardContent>
          </Card>
        </div>

        <section className="flex flex-col gap-3">
          <h2 className="text-2xl font-semibold tracking-tight">What your assistant can do</h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {TOOLS.map(([name, what]) => <li key={name} className="rounded-lg border p-3 text-sm"><code className="font-medium">{name}</code><span className="block text-muted-foreground">{what}</span></li>)}
          </ul>
          <p className="text-sm text-muted-foreground">
            There is also a <code>weekly_checkin</code> prompt: a two-minute interview that ends in a saved check-in.
            Limits match the API (60 requests a minute). Disconnect any assistant in Settings; it takes effect immediately.
            Prefer scripts? See the <a className="underline" href="/docs/api">API</a> and <a className="underline" href={`${SITE.repo}/tree/main/cli`}>CLI</a>.
          </p>
        </section>
        <p className="text-xs text-muted-foreground">Cadence is not affiliated with LinkedIn, Anthropic, OpenAI, Cursor or Microsoft. Drafts are written by AI; approving one is your review of it.</p>
        <div><Button size="lg" render={<Link href="/login" />}>Start your {SITE.trialDays}-day free trial</Button></div>
      </main>
      <SiteFooter />
    </>
  );
}
