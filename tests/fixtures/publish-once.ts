// Child process for the publish-safety test: publishes one draft, with CADENCE_FAULT set by the parent.
import { publishDraft } from "@/lib/publishing";

const [userId, draftId] = process.argv.slice(2);
publishDraft(userId, draftId).then((r) => { console.log(r); process.exit(0); }, (e) => { console.error(e); process.exit(1); });
