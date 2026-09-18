#!/usr/bin/env node
/**
 * Asks the running database the question check-function-grants.mjs asks of
 * the schema file: can `anon` or `authenticated` execute anything they
 * should not, and does the admin check actually refuse a suspended admin.
 *
 * The static check reads supabase/schema.sql and is what runs in lint. This
 * one needs a real project and is run by hand after applying a schema
 * change, because the two can disagree in both directions:
 *
 *   * A revoke in the file that was never applied leaves the live database
 *     open while the file looks correct.
 *   * `pg_default_acl` grants EXECUTE to anon and authenticated on every new
 *     function in schema public, so a function can arrive granted without a
 *     line anywhere saying so.
 *
 * Both were real. The ledger and payment functions -- including
 * `record_payment_capture`, which marks a booking paid -- were callable by
 * anyone holding the publishable anon key, because the revokes named
 * `anon, authenticated` and left PUBLIC's implicit grant in place.
 *
 * Read-only apart from part 3, which creates one throwaway account, suspends
 * it, and deletes it again. Point it at a test project if that matters to
 * you; it names its fixtures `zz.security.check.*` and removes them.
 *
 * Usage:
 *   NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_ANON_KEY=... \
 *   SUPABASE_SERVICE_ROLE_KEY=... node scripts/check-live-grants.mjs
 */
import { createClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL || !ANON || !SERVICE) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY or " +
      "SUPABASE_SERVICE_ROLE_KEY."
  );
  process.exit(1);
}

// Every function this app's routes call through the service role. None of
// them is meant to be reachable by a browser, signed in or not.
const MUST_BE_CLOSED = [
  ["record_payment_capture", { p_order_id: "x", p_payment_id: "x", p_amount_paise: 0, p_raw: {} }],
  ["grant_session_credits", { p_entitlement_id: null, p_count: 0, p_idempotency_key: "x", p_actor_id: null, p_actor_role: "x", p_reason: "x" }],
  ["adjust_session_credits", { p_entitlement_id: null, p_delta_granted: 0, p_delta_reserved: 0, p_delta_consumed: 0, p_reason: "x", p_actor_id: null, p_idempotency_key: "x" }],
  ["void_session_credits", { p_entitlement_id: null, p_reason: "x", p_idempotency_key: "x", p_actor_id: null, p_actor_role: "x" }],
  ["verify_entitlement_balances", {}],
  ["ensure_entitlement_for_purchase", { p_purchase_id: null, p_kind: "x" }],
  ["claim_promo_code", { p_code: "x", p_patient_id: null, p_appointment_id: null, p_patient_has_paid_before: false }],
  ["claim_invite", { p_code: "x", p_invitee_id: null }],
  ["grant_invite_reward", { p_invitee_id: null, p_appointment_id: null }],
  ["purge_admin_activity_log", { p_days: 36500 }],
  ["save_therapist_weekly_schedule", { p_therapist_id: null, p_slots: [], p_expected_version: 0, p_actor: null }],
  ["revoke_user_sessions", { p_user_id: null }],
  ["debug_reset_all_data", {}],
];

const pass = [];
const fail = [];
const record = (ok, name, detail) => {
  (ok ? pass : fail).push(name);
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};

// A 401/403/404 means the role cannot execute it. A 200 means it ran, which
// for any of the above is the vulnerability. Anything else (a 400 from bad
// arguments) also means it got past the grant check and is a failure.
async function callAs(key, fn, args) {
  const res = await fetch(`${URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  return res.status;
}

console.log("\n1. Functions must be unreachable by anon");
for (const [fn, args] of MUST_BE_CLOSED) {
  const status = await callAs(ANON, fn, args);
  record([401, 403, 404].includes(status), `anon cannot call ${fn}`, `HTTP ${status}`);
}

console.log("\n2. A suspended admin reads nothing");
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
const email = `zz.security.check.${Date.now()}@example.test`;
const password = `Chk-${Math.random().toString(36).slice(2, 12)}`;
let userId = null;

try {
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: "SECURITY CHECK - delete me" },
  });
  if (createError || !created?.user) throw new Error(createError?.message ?? "no user");
  userId = created.user.id;

  const signIn = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const session = await signIn.json();
  if (!session.access_token) throw new Error("could not sign in as the fixture");

  const readAs = async (table) => {
    const res = await fetch(`${URL}/rest/v1/${table}?select=id&limit=1`, {
      headers: { apikey: ANON, Authorization: `Bearer ${session.access_token}` },
    });
    const body = await res.json().catch(() => []);
    return Array.isArray(body) ? body.length : 0;
  };

  const setProfile = (patch) =>
    admin.from("profiles").update(patch).eq("id", userId);

  await setProfile({ role: "admin", admin_scope: "full", active: true, approved: true });
  record((await readAs("admin_activity_log")) > 0, "an ACTIVE admin still reads admin_activity_log");
  record((await readAs("appointments")) > 0, "an ACTIVE admin still reads appointments");

  await setProfile({ active: false });
  record((await readAs("admin_activity_log")) === 0, "a SUSPENDED admin reads no admin_activity_log");
  record((await readAs("appointments")) === 0, "a SUSPENDED admin reads no appointments");

  console.log("\n3. revoke_user_sessions ends the session");
  const { error: rpcError } = await admin.rpc("revoke_user_sessions", { p_user_id: userId });
  record(!rpcError, "service_role can call revoke_user_sessions", rpcError?.message);

  const refresh = await fetch(`${URL}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: session.refresh_token }),
  });
  record(refresh.status !== 200, "the refresh token no longer works", `HTTP ${refresh.status}`);
} finally {
  if (userId) {
    await admin.auth.admin.deleteUser(userId);
    const { data: left } = await admin.from("profiles").select("id").eq("id", userId);
    record((left ?? []).length === 0, "fixture account removed");
  }
}

console.log(`\n${pass.length} passed, ${fail.length} failed`);
if (fail.length) {
  console.error("FAILED: " + fail.join(" | "));
  process.exit(1);
}
