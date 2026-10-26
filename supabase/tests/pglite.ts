import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PGlite, type Transaction } from "@electric-sql/pglite";

const migrationsDir = fileURLToPath(new URL("../migrations/", import.meta.url));

// Minimal stand-in for what Supabase provides: roles, auth.users and auth.uid().
const SUPABASE_STUB = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin;
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth, public to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on functions to anon, authenticated;
`;

export const ALICE = "00000000-0000-0000-0000-00000000000a";
export const BOB = "00000000-0000-0000-0000-00000000000b";
export const CAROL = "00000000-0000-0000-0000-00000000000c";

export let db: PGlite;

/** A fresh database with every migration (or those before `until`) applied; use in beforeEach. */
export async function createDb(until = "~") {
  db = new PGlite();
  await db.exec(SUPABASE_STUB);
  await migrate("", until);
  await db.exec(`insert into auth.users (id, email) values
    ('${ALICE}', 'alice@example.com'), ('${BOB}', 'bob@example.com'), ('${CAROL}', 'carol@example.com')`);
}

/** Applies the migrations whose file names sort in [from, until). */
export async function migrate(from: string, until = "~") {
  for (const file of readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort()) {
    if (file >= from && file < until) await db.exec(readFileSync(migrationsDir + file, "utf8"));
  }
}

/** Runs `fn` as the given role with the given user ID (or none). */
export async function as<T>(uid: string | null, fn: (tx: Transaction) => Promise<T>, role = "authenticated"): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${role}`);
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid ?? ""]);
    return fn(tx);
  });
}

export async function rpc<T = any>(uid: string | null, sql: string, params: unknown[] = [], role?: string): Promise<T> {
  return as(
    uid,
    async (tx) => {
      const res = await tx.query<{ r: T }>(`select ${sql} as r`, params);
      return res.rows[0]!.r;
    },
    role,
  );
}
