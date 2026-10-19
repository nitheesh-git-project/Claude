// Support impersonation, the rules in docs/rules/ops-security.md turned into
// cases: who may start it (a Master Admin only -- never on another admin, a
// suspended account or themselves, and never without a real reason), what
// the swap does (recorded before it opens, the browser genuinely becomes the
// patient, every write inside it attributed to the admin, the back office
// shut), how it ends (Exit puts the admin back; the proxy ends a lapsed
// window), and that a caller who is not shown to be that admin is never told
// where the back office is.
//
// impersonation-exit.spec.ts is the narrower regression for Exit's restore.
// The target is QA Patient B: an impersonation row is append-only, and it
// keeps the account it names from being deleted (see the report on this
// spec), so a throwaway patient would be one nobody could remove. The same
// rows are why the file runs only on the gate's disposable stack or with
// E2E_ALLOW_APPEND_ONLY_WRITES=1, like recommendation-course.
import {
  test,
  expect,
  type APIRequestContext,
  type BrowserContext,
  request as playwrightRequest,
} from "@playwright/test";
import {
  BASE,
  QA_EMAILS,
  adminClient,
  browserCookiesFor,
  cookieHeaderFor,
  createFixtureAccount,
  deleteFixtureAccount,
  profileIdFor,
  setQaAdminScope,
  waitForSplashToClear,
} from "./helpers";
import { IMPERSONATION_COOKIE, ADMIN_RESTORE_COOKIE, START_REFUSAL_MESSAGE } from "../src/lib/impersonation";

test.skip(
  process.env.E2E_ALLOW_APPEND_ONLY_WRITES !== "1" && process.env.CI_LOCAL_STACK !== "1",
  "writes append-only admin_impersonation_sessions rows; set E2E_ALLOW_APPEND_ONLY_WRITES=1 on a disposable project"
);

test.describe.configure({ mode: "serial" });

const db = adminClient();
const MARKER = `E2E impersonation ${Date.now()}`;
const REASON = `Patient reports the sessions page is blank (${MARKER})`;

let adminId = "";
let target: { id: string; name: string };
let suspended: { id: string } | undefined;
// A little before this run, so a database clock a second or two behind
// this machine's cannot hide a row the run wrote.
const startedAfter = new Date(Date.now() - 10_000).toISOString();
const contexts: APIRequestContext[] = [];

async function as(email?: string, cookie?: string) {
  const ctx = await playwrightRequest.newContext({
    baseURL: BASE,
    extraHTTPHeaders: email ? { Cookie: await cookieHeaderFor(email) } : cookie ? { Cookie: cookie } : {},
  });
  contexts.push(ctx);
  return ctx;
}

function start(ctx: APIRequestContext, data: unknown) {
  return ctx.post("/api/admin/start-impersonation", { data: data as Record<string, unknown> });
}

/** This admin's impersonation rows on the target from this run, oldest first. */
async function sessionsThisRun() {
  const { data, error } = await db
    .from("admin_impersonation_sessions")
    .select("id, target_id, target_role, reason, started_at, expires_at, ended_at, ended_reason")
    .eq("admin_id", adminId)
    .eq("target_id", target.id)
    .gte("started_at", startedAfter)
    .order("started_at", { ascending: true });
  if (error) throw new Error(`could not read the impersonation record: ${error.message}`);
  return data ?? [];
}

async function activity(action: string, sessionTarget = target.id) {
  const { data } = await db
    .from("admin_activity_log")
    .select("actor_id, action, target_id, details")
    .eq("action", action)
    .eq("target_id", sessionTarget)
    .gte("created_at", startedAfter)
    .order("created_at", { ascending: true });
  return data ?? [];
}

async function cookieNamed(context: BrowserContext, name: string) {
  return (await context.cookies(BASE)).find((c) => c.name === name);
}

test.beforeAll(async () => {
  adminId = await profileIdFor(db, QA_EMAILS.admin);
  const targetId = await profileIdFor(db, QA_EMAILS.patientB);
  const { data } = await db.from("profiles").select("full_name").eq("id", targetId).single();
  target = { id: targetId, name: data?.full_name ?? "this user" };
  suspended = await createFixtureAccount("impersonation suspended", { active: false });
});

test.afterAll(async () => {
  for (const ctx of contexts) await ctx.dispose();
  await db.from("patient_addresses").delete().eq("patient_id", target.id).like("line1", `${MARKER}%`);
  // Refused swaps write nothing, so this one can go.
  await deleteFixtureAccount(suspended?.id);
});

test("IMP-001: only a Master Admin may start one -- never on an admin, a suspended account or themselves, and never without a reason", async () => {
  test.setTimeout(90_000);
  const body = { userId: target.id, reason: REASON };

  // Nobody outside the back office, and no limited desk inside it.
  for (const email of [undefined, QA_EMAILS.patientA, QA_EMAILS.therapistA, QA_EMAILS.hospital]) {
    const refused = await start(await as(email), body);
    expect(refused.status(), email ?? "anonymous").toBe(403);
    expect(JSON.stringify(await refused.json()), email ?? "anonymous").not.toContain("/admin");
  }
  try {
    await setQaAdminScope(db, adminId, "operations");
    const desk = await start(await as(QA_EMAILS.admin), body);
    expect(desk.status()).toBe(403);
    expect((await desk.json()).error).toBe(START_REFUSAL_MESSAGE.not_master_admin);
  } finally {
    await setQaAdminScope(db, adminId, "full");
  }

  const master = await as(QA_EMAILS.admin);
  const malformed = await master.post("/api/admin/start-impersonation", {
    headers: { "Content-Type": "application/json" },
    data: "{not json",
  });
  expect(malformed.status()).toBe(400);

  const { data: otherAdmin } = await db
    .from("profiles")
    .select("id")
    .eq("role", "admin")
    .neq("id", adminId)
    .limit(1)
    .single();
  expect(otherAdmin, "a second admin exists (seed:qa makes qa.admin.backup)").toBeTruthy();

  const cases: [string, unknown, string][] = [
    ["no reason", { userId: target.id }, START_REFUSAL_MESSAGE.no_reason],
    ["a reason padded to look long", { userId: target.id, reason: "   checking   " }, START_REFUSAL_MESSAGE.no_reason],
    ["nobody", { userId: "00000000-0000-4000-8000-000000000000", reason: REASON }, START_REFUSAL_MESSAGE.target_missing],
    ["themselves", { userId: adminId, reason: REASON }, START_REFUSAL_MESSAGE.target_is_self],
    ["another admin", { userId: otherAdmin!.id, reason: REASON }, START_REFUSAL_MESSAGE.target_is_admin],
    ["a suspended patient", { userId: suspended!.id, reason: REASON }, START_REFUSAL_MESSAGE.target_inactive],
  ];
  for (const [what, data, error] of cases) {
    const refused = await start(master, data);
    expect(refused.status(), what).toBe(400);
    expect((await refused.json()).error, what).toBe(error);
  }

  // Not one of those opened a window or left a row saying it had.
  expect(await sessionsThisRun()).toEqual([]);
  expect(await activity("impersonation.start")).toEqual([]);
});

test("IMP-002: a Master Admin's swap is recorded before it opens, becomes the patient, logs every write under the admin, and Exit puts them back", async ({
  page,
  context,
}) => {
  test.setTimeout(120_000);
  await context.addCookies(await browserCookiesFor(QA_EMAILS.admin));

  // page.request shares the browser's cookie jar, so the swap lands here
  // exactly as it would for a tap on the profile page.
  const opened = await page.request.post(`${BASE}/api/admin/start-impersonation`, {
    data: { userId: target.id, reason: `  ${REASON}  ` },
  });
  expect(opened.status(), await opened.text()).toBe(200);
  expect(await opened.json()).toEqual({ ok: true, redirectTo: "/patient/dashboard" });

  // The record: who, whom, why (trimmed), and a thirty-minute window.
  const [row] = await sessionsThisRun();
  expect(row).toMatchObject({ target_id: target.id, target_role: "patient", reason: REASON, ended_at: null });
  const windowMs = new Date(row.expires_at).getTime() - new Date(row.started_at).getTime();
  expect(Math.abs(windowMs - 30 * 60_000)).toBeLessThan(60_000);
  const started = await activity("impersonation.start");
  expect(started).toHaveLength(1);
  expect(started[0]).toMatchObject({ actor_id: adminId, details: { role: "patient", reason: REASON, minutes: 30 } });
  expect(await cookieNamed(context, IMPERSONATION_COOKIE)).toMatchObject({ httpOnly: true });
  expect(await cookieNamed(context, ADMIN_RESTORE_COOKIE)).toMatchObject({ httpOnly: true });

  // Inside the window the browser is the patient: their own route writes as
  // them...
  const saved = await page.request.post(`${BASE}/api/patient/addresses/save`, {
    data: { line1: `${MARKER} street`, pincode: "600017", city: "Chennai" },
  });
  expect(saved.status(), await saved.text()).toBe(200);
  const { data: address } = await db
    .from("patient_addresses")
    .select("patient_id")
    .eq("id", (await saved.json()).id)
    .single();
  expect(address?.patient_id).toBe(target.id);
  // ...and the write is on the admin's trail, naming the window it was made in.
  await expect
    .poll(async () => (await activity("impersonation.action")).map((r) => [r.actor_id, r.details]))
    .toContainEqual([
      adminId,
      { method: "POST", path: "/api/patient/addresses/save", sessionId: row.id, targetRole: "patient" },
    ]);

  // The back office is shut while it lasts: no admin route, and no second swap.
  expect((await page.request.post(`${BASE}/api/admin/assign-appointment`, { data: {} })).status()).toBe(403);
  expect(
    (await page.request.post(`${BASE}/api/admin/start-impersonation`, { data: { userId: target.id, reason: REASON } })).status()
  ).toBe(403);

  // The patient's own dashboard, under the banner that says whose it is.
  await page.goto(`${BASE}/patient/dashboard`);
  await waitForSplashToClear(page);
  await expect(page).toHaveURL(/\/patient\/dashboard/);
  await expect(page.getByText(`You are signed in as ${target.name}.`)).toBeVisible({ timeout: 60_000 });

  // Exit: back to the admin's own dashboard, still signed in as the admin.
  await page.getByRole("button", { name: "Exit and go back to admin" }).click();
  await page.waitForURL(/\/admin\/dashboard/, { timeout: 60_000 });
  await expect(page.getByText(/You are signed in as/)).toHaveCount(0);
  expect(await cookieNamed(context, IMPERSONATION_COOKIE)).toBeUndefined();
  expect(await cookieNamed(context, ADMIN_RESTORE_COOKIE)).toBeUndefined();
  // An admin route answers the admin again: past the guard, to the body.
  expect((await page.request.post(`${BASE}/api/admin/assign-appointment`, { data: {} })).status()).toBe(400);

  const [closed] = await sessionsThisRun();
  expect(closed).toMatchObject({ id: row.id, ended_reason: "admin_exited" });
  expect(closed.ended_at).toBeTruthy();
  const ended = await activity("impersonation.end");
  expect(ended).toHaveLength(1);
  expect(ended[0]).toMatchObject({ actor_id: adminId, details: { role: "patient" } });
});

test("IMP-003: a lapsed window is ended by the proxy, and a caller not shown to be the admin is never told where the back office is", async ({
  page,
  context,
}) => {
  test.setTimeout(120_000);

  // Exit with no marker at all, and with a forged one: both answer
  // /dashboard, which resolves the caller's own role, and log nothing.
  const anonymous = await (await as()).post("/api/admin/stop-impersonation");
  expect(anonymous.status()).toBe(200);
  expect(await anonymous.json()).toEqual({ ok: true, redirectTo: "/dashboard" });

  const forgedTarget = "00000000-0000-4000-8000-00000000f0f0";
  const forged = {
    sessionId: "00000000-0000-4000-8000-00000000abcd",
    adminId,
    targetId: forgedTarget,
    targetRole: "patient",
    targetName: "Forged",
    expiresAt: Date.now() + 60_000,
  };
  const forger = await as(undefined, `${IMPERSONATION_COOKIE}=${encodeURIComponent(JSON.stringify(forged))}`);
  const forgedStop = await forger.post("/api/admin/stop-impersonation");
  expect(forgedStop.status()).toBe(200);
  const forgedBody = await forgedStop.json();
  expect(forgedBody.redirectTo).toBe("/dashboard");
  expect(JSON.stringify(forgedBody)).not.toContain("/admin");
  expect(await activity("impersonation.end", forgedTarget)).toEqual([]);

  // A real window, then its marker moved past its end -- the browser's own
  // clock is not trusted to end it; the proxy is.
  await context.addCookies(await browserCookiesFor(QA_EMAILS.admin));
  const opened = await page.request.post(`${BASE}/api/admin/start-impersonation`, {
    data: { userId: target.id, reason: REASON },
  });
  expect(opened.status(), await opened.text()).toBe(200);
  const marker = (await cookieNamed(context, IMPERSONATION_COOKIE))!;
  const restore = (await cookieNamed(context, ADMIN_RESTORE_COOKIE))!;
  const lapsed = { ...JSON.parse(decodeURIComponent(marker.value)), expiresAt: Date.now() - 1_000 };
  await context.addCookies([
    { name: IMPERSONATION_COOKIE, value: encodeURIComponent(JSON.stringify(lapsed)), url: BASE, httpOnly: true },
  ]);

  await page.goto(`${BASE}/patient/dashboard`);
  await page.waitForURL(/\/admin\/login\?expired=impersonation/, { timeout: 60_000 });
  expect(await cookieNamed(context, IMPERSONATION_COOKIE)).toBeUndefined();
  // Signed out, not left as the patient with the banner gone.
  const afterLapse = await page.request.post(`${BASE}/api/patient/addresses/save`, {
    data: { line1: `${MARKER} after the window`, pincode: "600017" },
  });
  expect(afterLapse.status()).toBe(401);

  // The window's own row stays open until somebody closes it; put the two
  // cookies back as the start route wrote them and Exit closes it properly.
  await context.addCookies([
    { name: IMPERSONATION_COOKIE, value: marker.value, url: BASE, httpOnly: true },
    { name: ADMIN_RESTORE_COOKIE, value: restore.value, url: BASE, httpOnly: true },
  ]);
  const exited = await page.request.post(`${BASE}/api/admin/stop-impersonation`);
  expect(await exited.json()).toEqual({ ok: true, redirectTo: "/admin/dashboard" });
  const rows = await sessionsThisRun();
  expect(rows.every((r) => r.ended_reason === "admin_exited" && r.ended_at)).toBe(true);
});
