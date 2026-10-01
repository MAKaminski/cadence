// The import page's body, shared by /app/import and the optional onboarding step (/onboarding/import).
import { IMPORT } from "@/lib/catalog";
import { isDemo } from "@/lib/mode";
import { SAMPLE_CHATGPT, SAMPLE_CLAUDE } from "@/lib/history-samples";
import { overview, SOURCE_NAME, type ImportView } from "@/services/history";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DeleteImported, Importer, Review } from "./importer";

const size = (b: number) => (b < 1048576 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1048576).toFixed(1)} MB`);
const n = (x?: number) => (x ?? 0).toLocaleString("en-US");
const STATUS: Record<ImportView["status"], string> = { uploading: "Upload unfinished", queued: "Waiting", reading: "Reading", distilling: "Finding suggestions", ready: "Done", failed: "Failed" };

export async function ImportPanel({ userId }: { userId: string }) {
  const o = await overview(userId);
  const current = o.imports.find((i) => !["ready", "failed"].includes(i.status)) ?? null;
  const finished = o.imports.filter((i) => i.status === "ready" || i.status === "failed");
  const spent = o.imports.reduce((a, i) => a + i.costUsd, 0);
  const samples = isDemo() ? { chatgpt: JSON.stringify(SAMPLE_CHATGPT), claude: JSON.stringify(SAMPLE_CLAUDE) } : undefined;
  return (
    <div className="flex flex-col gap-6">
      <Importer key={current?.id ?? "none"} maxBytes={IMPORT.maxBytes} current={current} samples={samples} />

      <Card>
        <CardHeader>
          <CardTitle>What Cadence keeps, and why</CardTitle>
          <CardDescription>So your posts sound like you and only say what&apos;s true about you.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <ul className="ml-4 list-disc space-y-1">
            <li>The file you upload is deleted as soon as it has been read.</li>
            <li>Only messages <em>you</em> wrote are kept, once each, with code removed and each cut to {n(IMPORT.messageChars)} characters. The assistant&apos;s replies, attachments and images are never kept.</li>
            <li>A sample of up to {n(IMPORT.maxBatches * IMPORT.batchChars)} characters of excerpts is sent to Anthropic&apos;s Claude API to find suggestions, counted against your monthly model allowance. Never whole conversations.</li>
            <li>Nothing joins your profile until you accept it. Only you can see any of this.</li>
            <li>Delete imported data at any time; deleting your account deletes it too.</li>
          </ul>
        </CardContent>
      </Card>

      {finished.length > 0 && (
        <Card data-testid="imports">
          <CardHeader>
            <CardTitle>What was found</CardTitle>
            <CardDescription>{o.messages.toLocaleString("en-US")} of your messages kept across {finished.length} import{finished.length > 1 ? "s" : ""}. Model cost: ${spent.toFixed(4)}.</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-muted-foreground"><tr>
                <th className="py-1 pr-3 font-medium">From</th><th className="py-1 pr-3 font-medium">File</th><th className="py-1 pr-3 text-right font-medium">Conversations</th>
                <th className="py-1 pr-3 text-right font-medium">Your messages</th><th className="py-1 pr-3 text-right font-medium">Kept</th>
                <th className="py-1 pr-3 text-right font-medium">Suggestions</th><th className="py-1 pr-3 text-right font-medium">Cost</th><th className="py-1 font-medium">Status</th>
              </tr></thead>
              <tbody>
                {finished.map((i) => {
                  const sug = Object.values(i.stats.suggestions ?? {}).reduce((a, b) => a + (b ?? 0), 0);
                  return (
                    <tr key={i.id} className="border-t align-top" data-testid="import-row">
                      <td className="py-2 pr-3">{SOURCE_NAME[i.source]}</td>
                      <td className="py-2 pr-3">{i.fileName}<span className="block text-xs text-muted-foreground">{size(i.bytes)}</span></td>
                      <td className="py-2 pr-3 text-right tabular-nums">{n(i.stats.conversations)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{n(i.stats.messages)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums" title={`${n(i.stats.duplicates)} repeats and ${n(i.stats.noise)} short or code-only messages left out`}>{n(i.stats.kept)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{n(sug)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">${i.costUsd.toFixed(4)}</td>
                      <td className="py-2">{STATUS[i.status]}
                        {i.error && <span className="block text-xs text-destructive">{i.error}</span>}
                        {(i.stats.notes ?? []).map((x) => <span key={x} className="block text-xs text-muted-foreground">{x}</span>)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <Review items={o.suggestions} />

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        <p>Removes every import, the messages kept from them and all suggestions. What you accepted stays in your profile, where you can edit it.</p>
        <DeleteImported disabled={!o.imports.length} />
      </div>
    </div>
  );
}
