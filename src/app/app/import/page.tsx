import type { Metadata } from "next";
import { InputsLink } from "@/components/inputs-link";
import { requireSubscriber } from "@/lib/session";
import { ImportPanel } from "./panel";
import { EngineImporter } from "./engine-importer";

export const metadata: Metadata = { title: "Import your AI history" };

export default async function ImportPage() {
  const user = await requireSubscriber();
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Import your AI history</h1>
        <p className="mt-1 text-muted-foreground">
          Years of your ChatGPT or Claude conversations already say what you do, what you care about and how you write. Upload an export and
          Cadence suggests facts, topics, sample posts, things to never write about and post ideas. You choose what goes into your profile.
        </p>
        <p className="mt-2"><InputsLink page="/app/import" /></p>
      </div>
      <EngineImporter />
      <ImportPanel userId={user.id} />
    </div>
  );
}
