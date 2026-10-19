// The scheduled maintenance sweep (/api/cron/maintenance), driven the way
// .github/workflows/maintenance.yml drives it: a POST with the shared
// CRON_SECRET as a bearer token. Every other caller is refused without the
// sweep running, the right secret runs every step and says which, and one
// step's effect is read back from the database -- a stale issued credential
// cleared, a fresh one kept (purge_expired_temp_passwords, 14 days).
//
// The quality gate generates a CRON_SECRET per run (quality-gate.yml), so
// the app and this spec share it and no real secret is involved. Without
// one in the environment the spec skips itself, which the gate counts as a
// failure. The route's 503 for an unset secret needs a server started
// without it, so it is not driven here.
import { test, expect, type APIRequestContext, request as playwrightRequest } from "@playwright/test";
import { BASE, adminClient, createFixtureAccount, deleteFixtureAccount } from "./helpers";

const SECRET = process.env.CRON_SECRET ?? "";
const ROUTE = "/api/cron/maintenance";
// What the route reports, in the order src/lib/maintenanceSweep.ts runs it.
const STEPS = [
  "packageExpiry",
  "homeVisitExpiry",
  "meetSync",
  "meetAccess",
  "riskSweep",
  "tempPasswordPurge",
  "abandonedBookingAccounts",
];
const DAY = 86_400_000;
// A placeholder, not a credential: the column is only ever cleared now
// (schema.sql), and this is the shape of a row an older version left.
const PLACEHOLDER = `e2e-placeholder-${Date.now()}`;

test.describe.configure({ mode: "serial" });
test.skip(!SECRET, "CRON_SECRET is not set -- the quality gate generates one per run; export the app's own value to run this locally");

const db = adminClient();
let ctx: APIRequestContext;
let stale: { id: string } | undefined;
let fresh: { id: string } | undefined;
let freshSetAt = "";
let staleSetAt = "";

test.beforeAll(async () => {
  ctx = await playwrightRequest.newContext({ baseURL: BASE });
});

test.afterAll(async () => {
  await ctx?.dispose();
  // The notes rows go with their profiles.
  await deleteFixtureAccount(stale?.id);
  await deleteFixtureAccount(fresh?.id);
});

test("MS-001: without the shared secret the sweep is refused and nothing about it is said", async () => {
  const attempts: [string, Record<string, string>][] = [
    ["no header", {}],
    ["a wrong secret", { Authorization: "Bearer not-the-secret" }],
    ["the secret under another scheme", { Authorization: `Basic ${SECRET}` }],
    ["the secret with one character more", { Authorization: `Bearer ${SECRET}x` }],
    ["the secret alone", { Authorization: SECRET }],
  ];
  for (const [what, headers] of attempts) {
    const refused = await ctx.post(ROUTE, { headers });
    expect(refused.status(), what).toBe(403);
    const body = await refused.json();
    expect(body, what).toEqual({ error: "Forbidden" });
  }
  // A GET is not a way in either.
  const get = await ctx.get(ROUTE, { headers: { Authorization: `Bearer ${SECRET}` } });
  expect(get.status()).toBe(405);
});

test("MS-002: the right secret runs every step, and a stale issued credential is purged while a fresh one is kept", async () => {
  test.setTimeout(90_000);
  stale = await createFixtureAccount("sweep stale credential");
  fresh = await createFixtureAccount("sweep fresh credential");
  staleSetAt = new Date(Date.now() - 30 * DAY).toISOString();
  freshSetAt = new Date(Date.now() - 1 * DAY).toISOString();
  const { error } = await db.from("patient_admin_notes").upsert([
    { patient_id: stale.id, note: "", temp_password: PLACEHOLDER, temp_password_set_at: staleSetAt },
    { patient_id: fresh.id, note: "", temp_password: PLACEHOLDER, temp_password_set_at: freshSetAt },
  ]);
  expect(error, error?.message).toBeNull();

  const swept = await ctx.post(ROUTE, { headers: { Authorization: `Bearer ${SECRET}` } });
  const body = await swept.json();
  expect(swept.status(), JSON.stringify(body)).toBe(200);
  // Which steps ran and how each went -- and nothing else.
  expect(Object.keys(body).sort()).toEqual(["ok", "steps"]);
  expect(body.ok).toBe(true);
  expect(Object.keys(body.steps)).toEqual(STEPS);
  for (const step of STEPS) expect(body.steps[step], step).toBe("ok");

  const { data: notes } = await db
    .from("patient_admin_notes")
    .select("patient_id, temp_password, temp_password_set_at")
    .in("patient_id", [stale.id, fresh.id]);
  const byPatient = new Map((notes ?? []).map((n) => [n.patient_id, n]));
  // Cleared, with the record that one was issued kept beside it.
  expect(byPatient.get(stale.id)?.temp_password).toBeNull();
  expect(new Date(byPatient.get(stale.id)?.temp_password_set_at ?? 0).getTime()).toBe(new Date(staleSetAt).getTime());
  // Inside the window: untouched.
  expect(byPatient.get(fresh.id)?.temp_password).toBe(PLACEHOLDER);
});
