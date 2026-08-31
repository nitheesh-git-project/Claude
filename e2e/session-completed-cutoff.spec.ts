// "Tap to Join" turning into "Session Completed" once a session is far
// enough past its scheduled start, and the admin setting that decides how
// far (site_settings.session_completed_after_minutes).
//
// Browser-driven, because what is under test is what a person reads on the
// button -- and it has to read the same way on every surface a session is
// listed on, the admin's own included: their button ignores the join
// *window* but not this cutoff.
import { test, expect, request, type Page, type APIRequestContext } from "@playwright/test";
import { BASE, QA_EMAILS, adminClient, browserCookiesFor, cookieHeaderFor, profileIdFor } from "./helpers";

const db = adminClient();
const MARKER = "E2E completed-cutoff";
const DEFAULT_MINUTES = 60;

let patientId: string;
let therapistId: string;

function minutesAgo(n: number) {
  return new Date(Date.now() - n * 60_000).toISOString();
}

async function setCutoff(minutes: number) {
  const { error } = await db
    .from("site_settings")
    .update({ session_completed_after_minutes: minutes })
    .eq("id", true);
  if (error) throw new Error(`could not set the cutoff: ${error.message}`);
}

async function seedSession(opts: { minutesOld: number; status?: string }) {
  const { data, error } = await db
    .from("appointments")
    .insert({
      patient_id: patientId,
      therapist_id: therapistId,
      slot_time: minutesAgo(opts.minutesOld),
      status: opts.status ?? "confirmed",
      duration_minutes: 30,
      meet_link: "https://meet.google.com/e2e-cutoff-test",
      concern: MARKER,
    })
    .select("id, session_code")
    .single();
  if (error) throw new Error(`could not seed a session: ${error.message}`);
  return data as { id: string; session_code: string | null };
}

// Reads the join control on the seeded session's own card. Scoped by
// session code rather than taking the first button on the page: this
// patient carries rows other specs created, and .first() read whichever one
// happened to sort earliest.
function joinButton(page: Page, sessionCode: string) {
  // Walks up from the session code to its own card -- each session is one
  // <li> in the dashboard's list. Scoped this way rather than taking the
  // first button on the page because this patient carries rows other specs
  // created, and some of those render a join control too.
  return page
    // Substring, not exact: the dashboard prints the code straight after
    // the concern in one paragraph.
    .getByText(sessionCode)
    .locator("xpath=ancestor::li[1]")
    .getByRole("button", { name: /Tap to Join|Session Completed|Session Cancelled/ });
}

// Opens the screen that lists every session, not Overview.
//
// Overview shows what is coming up; every session this spec seeds is
// deliberately in the past, so on a database carrying rows from earlier runs
// the seeded card is simply not on that screen and the wait times out. The
// Sessions screen has an "All" filter, which is the honest place to assert
// what a past session's join control reads.
async function openPatientDashboard(page: Page, sessionCode: string) {
  await page.goto(`${BASE}/patient/dashboard/sessions`, { waitUntil: "domcontentloaded" });
  await showAllSessions(page);
  await joinButton(page, sessionCode).first().waitFor({ timeout: 60_000 });
}

async function showAllSessions(page: Page) {
  const all = page.getByRole("button", { name: /^All/ });
  if (await all.count()) await all.first().click();
}

test.describe("Session Completed cutoff", () => {
  let adminCtx: APIRequestContext;
  let patientCtx: APIRequestContext;

  test.beforeAll(async () => {
    patientId = await profileIdFor(db, QA_EMAILS.patientA);
    therapistId = await profileIdFor(db, QA_EMAILS.therapistA);
    // Anything a previous run left behind would be an extra row on the
    // dashboard with its own button, and .first() would read the wrong one.
    await db.from("appointments").delete().eq("concern", MARKER);
    adminCtx = await request.newContext({
      baseURL: BASE,
      extraHTTPHeaders: { Cookie: await cookieHeaderFor(QA_EMAILS.admin) },
    });
    patientCtx = await request.newContext({
      baseURL: BASE,
      extraHTTPHeaders: { Cookie: await cookieHeaderFor(QA_EMAILS.patientA) },
    });
  });

  test.afterAll(async () => {
    await db.from("appointments").delete().eq("concern", MARKER);
    await setCutoff(DEFAULT_MINUTES);
    await adminCtx.dispose();
    await patientCtx.dispose();
  });

  test.beforeEach(async () => {
    // The browser cases load a dashboard three times over; 30s is the config
    // default and is comfortable alone but not while the rest of the suite is
    // hammering the same dev server, which is how SC-008 first failed.
    test.setTimeout(120_000);
    await db.from("appointments").delete().eq("concern", MARKER);
    await setCutoff(DEFAULT_MINUTES);
  });

  test("SC-001 the route refuses a cutoff of zero", async () => {
    const res = await adminCtx.post("/api/admin/update-setting", {
      data: { key: "session_completed_after_minutes", value: 0 },
    });
    expect(res.status()).toBe(400);
  });

  test("SC-002 the route refuses a negative, a fraction and a string", async () => {
    for (const value of [-5, 12.5, "60"]) {
      const res = await adminCtx.post("/api/admin/update-setting", {
        data: { key: "session_completed_after_minutes", value },
      });
      expect(res.status(), `value ${JSON.stringify(value)}`).toBe(400);
    }
  });

  test("SC-003 an admin can set it, a patient cannot", async () => {
    expect(
      (
        await adminCtx.post("/api/admin/update-setting", {
          data: { key: "session_completed_after_minutes", value: 90 },
        })
      ).ok()
    ).toBe(true);
    let { data } = await db
      .from("site_settings")
      .select("session_completed_after_minutes")
      .maybeSingle();
    expect(data?.session_completed_after_minutes).toBe(90);

    const refused = await patientCtx.post("/api/admin/update-setting", {
      data: { key: "session_completed_after_minutes", value: 5 },
    });
    expect(refused.status()).toBe(403);
    ({ data } = await db
      .from("site_settings")
      .select("session_completed_after_minutes")
      .maybeSingle());
    expect(data?.session_completed_after_minutes).toBe(90);
  });

  test("SC-004 a session inside the cutoff still offers the call", async ({ browser }) => {
    const seeded = await seedSession({ minutesOld: 10 });
    const ctx = await browser.newContext();
    await ctx.addCookies(await browserCookiesFor(QA_EMAILS.patientA));
    const page = await ctx.newPage();
    await openPatientDashboard(page, seeded.session_code!);
    await expect(joinButton(page, seeded.session_code!).first()).toHaveText("Tap to Join");
    await ctx.close();
  });

  test("SC-005 past the cutoff it reads Session Completed to the patient", async ({ browser }) => {
    const seeded = await seedSession({ minutesOld: 75 });
    const ctx = await browser.newContext();
    await ctx.addCookies(await browserCookiesFor(QA_EMAILS.patientA));
    const page = await ctx.newPage();
    await openPatientDashboard(page, seeded.session_code!);
    await expect(joinButton(page, seeded.session_code!).first()).toHaveText("Session Completed");
    await expect(joinButton(page, seeded.session_code!).first()).toBeDisabled();
    await ctx.close();
  });

  test("SC-006 the admin's own list reads it the same way", async ({ browser }) => {
    // Found by session code, the one seeded value All Sessions actually
    // paints -- the concern this spec marks its rows with is drawer detail,
    // not a column.
    const seeded = await seedSession({ minutesOld: 75 });
    const ctx = await browser.newContext();
    await ctx.addCookies(await browserCookiesFor(QA_EMAILS.admin));
    const page = await ctx.newPage();
    await page.goto(`${BASE}/admin/dashboard?section=sessions&tab=all`, {
      waitUntil: "domcontentloaded",
    });
    const row = page.getByRole("row").filter({ hasText: seeded.session_code! });
    await row.first().waitFor({ timeout: 60_000 });
    // alwaysActive exempts an admin from the join window, never from this.
    await expect(row.first().getByRole("button", { name: "Session Completed" })).toBeVisible();
    await ctx.close();
  });

  test("SC-007 the therapist sees the same thing", async ({ browser }) => {
    await seedSession({ minutesOld: 75 });
    const ctx = await browser.newContext();
    await ctx.addCookies(await browserCookiesFor(QA_EMAILS.therapistA));
    const page = await ctx.newPage();
    await page.goto(`${BASE}/therapist/dashboard/sessions`, { waitUntil: "domcontentloaded" });
    await showAllSessions(page);
    await expect(
      page.getByRole("button", { name: "Session Completed" }).first()
    ).toBeVisible({ timeout: 30_000 });
    await ctx.close();
  });

  test("SC-008 the admin's setting is what moves the line", async ({ browser }) => {
    const seeded = await seedSession({ minutesOld: 45 });

    // 45 minutes old, cutoff 60: still a live session.
    const ctx = await browser.newContext();
    await ctx.addCookies(await browserCookiesFor(QA_EMAILS.patientA));
    const page = await ctx.newPage();
    await openPatientDashboard(page, seeded.session_code!);
    await expect(joinButton(page, seeded.session_code!).first()).toHaveText("Tap to Join");

    // Same session, cutoff pulled in to 30: now over.
    await setCutoff(30);
    await page.reload({ waitUntil: "domcontentloaded" });
    await showAllSessions(page);
    await joinButton(page, seeded.session_code!).first().waitFor({ timeout: 30_000 });
    await expect(joinButton(page, seeded.session_code!).first()).toHaveText("Session Completed");

    // ...and pushing it back out brings the call back.
    await setCutoff(120);
    await page.reload({ waitUntil: "domcontentloaded" });
    await showAllSessions(page);
    await joinButton(page, seeded.session_code!).first().waitFor({ timeout: 30_000 });
    await expect(joinButton(page, seeded.session_code!).first()).toHaveText("Tap to Join");
    await ctx.close();
  });

  test("SC-009 a completed session says so regardless of the clock", async ({ browser }) => {
    const seeded = await seedSession({ minutesOld: 5, status: "completed" });
    const ctx = await browser.newContext();
    await ctx.addCookies(await browserCookiesFor(QA_EMAILS.patientA));
    const page = await ctx.newPage();
    await openPatientDashboard(page, seeded.session_code!);
    await expect(joinButton(page, seeded.session_code!).first()).toHaveText("Session Completed");
    await ctx.close();
  });

  // The form itself, not just the route behind it: it carries its own floor
  // and could post the wrong key while every case above stayed green.
  test("SC-011 an admin can change it from Settings -> Booking Rules", async ({ browser }) => {
    const ctx = await browser.newContext();
    await ctx.addCookies(await browserCookiesFor(QA_EMAILS.admin));
    const page = await ctx.newPage();
    await page.goto(`${BASE}/admin/dashboard?section=settings&tab=booking`, {
      waitUntil: "domcontentloaded",
    });
    const card = page.locator("div", { hasText: "Session Completed Cutoff" }).last();
    const input = card.locator('input[type="number"]');
    await input.waitFor({ timeout: 30_000 });
    await input.fill("45");
    await card.getByRole("button", { name: "Save" }).click();
    // The write is what matters; the badge waits on a router.refresh() that
    // re-runs the whole admin page, which is slow enough to outlast a tight
    // assertion while the save itself has already landed.
    await expect
      .poll(
        async () => {
          const { data } = await db
            .from("site_settings")
            .select("session_completed_after_minutes")
            .maybeSingle();
          return data?.session_completed_after_minutes;
        },
        { timeout: 60_000 }
      )
      .toBe(45);
    await expect(card.getByText("Saved.")).toBeVisible({ timeout: 60_000 });
    await ctx.close();
  });

  test("SC-010 a cancelled session is never called completed", async ({ browser }) => {
    const seeded = await seedSession({ minutesOld: 75, status: "cancelled" });
    const ctx = await browser.newContext();
    await ctx.addCookies(await browserCookiesFor(QA_EMAILS.patientA));
    const page = await ctx.newPage();
    await openPatientDashboard(page, seeded.session_code!);
    await expect(joinButton(page, seeded.session_code!).first()).toHaveText("Session Cancelled");
    await ctx.close();
  });
});
