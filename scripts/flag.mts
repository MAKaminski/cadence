// `pnpm flag` lists feature flags; change one on the server whose DATABASE_URL is set:
//   pnpm flag examples --allow you@example.com   turn it on for one account (repeatable)
//   pnpm flag examples --deny you@example.com    take that account off the list
//   pnpm flag examples --all on|off              on or off for everyone (the list is kept)
// Flags live in the feature_flags table (src/lib/flags.ts). An unknown flag name is refused.
import { eq } from "drizzle-orm";

const { db } = await import("../src/db");
const { featureFlags } = await import("../src/db/schema");
const { FLAGS } = await import("../src/lib/flags");

const [name, ...rest] = process.argv.slice(2);
const show = async () => {
  const rows = await db.select().from(featureFlags);
  for (const key of Object.keys(FLAGS)) {
    const r = rows.find((x) => x.key === key), list = (r?.allowEmails as string[] | undefined) ?? [];
    console.log(`${key}: ${r?.enabledForAll ? "on for everyone" : list.length ? `on for ${list.join(", ")}` : "off"}`);
  }
};

if (!name) { await show(); process.exit(0); }
if (!(name in FLAGS)) { console.error(`Unknown flag "${name}". Known: ${Object.keys(FLAGS).join(", ")}.`); process.exit(1); }

const [row] = await db.select().from(featureFlags).where(eq(featureFlags.key, name));
let all = row?.enabledForAll ?? false;
const list = new Set(((row?.allowEmails as string[] | undefined) ?? []).map((e) => e.toLowerCase()));
for (let i = 0; i < rest.length; i += 2) {
  const [opt, val] = [rest[i], rest[i + 1]];
  if (!val) { console.error(`${opt} needs a value.`); process.exit(1); }
  if (opt === "--allow") { if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(val)) { console.error(`"${val}" isn't an email address.`); process.exit(1); } list.add(val.toLowerCase()); }
  else if (opt === "--deny") list.delete(val.toLowerCase());
  else if (opt === "--all" && (val === "on" || val === "off")) all = val === "on";
  else { console.error(`Unknown option ${opt} ${val}.`); process.exit(1); }
}
const values = { key: name, enabledForAll: all, allowEmails: [...list].sort(), updatedAt: new Date() };
await db.insert(featureFlags).values(values).onConflictDoUpdate({ target: featureFlags.key, set: values });
await show();
process.exit(0);
