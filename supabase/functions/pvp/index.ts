// Supabase Edge Function `pvp`: starts friend battles and resolves phases on
// the server. Deploy with `npx supabase functions deploy pvp`.
// The caller is identified from their access token; the database is written
// with the service-role key, which never leaves the function.
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { DB_ERRORS, PvpError, handle, parseRequest, type PvpDb } from "./logic.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

function rpcDb(admin: SupabaseClient): PvpDb {
  async function call<T>(fn: string, args: Record<string, unknown>): Promise<T> {
    const { data, error } = await admin.rpc(fn, args);
    if (error) {
      const known = DB_ERRORS.find((code) => error.message.includes(code));
      if (known) throw new PvpError(known, known === "PHASE_CONFLICT" ? 409 : 400);
      throw new Error(`${fn}: ${error.message}`);
    }
    return data as T;
  }
  return {
    prepare: (challenger, defender) => call("pvp_prepare", { p_challenger: challenger, p_defender: defender }),
    create: (challenger, defender, snapshot, seed, state) =>
      call("pvp_create", { p_challenger: challenger, p_defender: defender, p_snapshot: snapshot, p_seed: seed, p_state: state }),
    load: (challenger) => call("pvp_load", { p_challenger: challenger }),
    recordPhase: (battleId, phase, selection, result, state) =>
      call("pvp_record_phase", {
        p_battle: battleId,
        p_phase: phase,
        p_selection: selection,
        p_result: result,
        p_state: state,
      }),
  };
}

function randomSeed(): [number, number, number, number] {
  const seed = new Uint32Array(4);
  crypto.getRandomValues(seed);
  return [seed[0]!, seed[1]!, seed[2]!, seed[3]!];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "BAD_REQUEST" }, 405);

  // Projects on the new API keys expose SUPABASE_SECRET_KEYS ({"default": "sb_secret_…"}).
  const secretKey =
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}").default;
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: auth } = token ? await admin.auth.getUser(token) : { data: { user: null } };
  if (!auth.user) return json({ error: "NOT_AUTHENTICATED" }, 401);

  try {
    const request = parseRequest(await req.json().catch(() => null));
    return json(await handle(rpcDb(admin), auth.user.id, request, randomSeed));
  } catch (e) {
    if (e instanceof PvpError) return json({ error: e.code }, e.status);
    console.error("pvp failed", { user: auth.user.id, error: String(e) });
    return json({ error: "SERVER_ERROR" }, 500);
  }
});
