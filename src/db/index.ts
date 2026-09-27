import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import postgres from "postgres";
import * as schema from "./schema";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

// One pool per process. Railway's Postgres allows plenty of connections for web + worker.
const client = postgres(url, { max: 10, prepare: false });
export const db = drizzle(client, { schema });
export type Db = typeof db;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * Run `fn` as one user. Row-level security on every tenant table compares `user_id` with
 * `app.user_id`, so a query that forgets its own WHERE clause still cannot read another user's rows.
 */
export async function asUser<T>(userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`set local role cadence_app`);
    await tx.execute(sql`select set_config('app.user_id', ${userId}, true)`);
    return fn(tx);
  });
}

/** The worker claims jobs across users; it identifies itself and then switches to the job's user. */
export async function asWorker<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`set local role cadence_app`);
    await tx.execute(sql`select set_config('app.role', 'worker', true)`);
    return fn(tx);
  });
}
