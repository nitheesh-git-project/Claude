// Suite ALL -- Logs -> All Activity shows everyone's actions.
//
// The admin log only ever recorded admins. A patient cancelling a session, a
// therapist recommending a programme, a payment arriving: none of it was in
// "All Logs". It is now one feed of two tables (admin_activity_log and
// user_activity_log), with the actor's role on every row and filters for
// Actor role / person, Programme ID, Patient, Therapist and Condition that
// live in the URL (al_* keys).
//
// What only a browser can check: the patient's own cancel (a real route)
// reaches the screen with the Patient chip, and the Patient and Programme
// filters find it and narrow the list. The programme half uses one fixture
// row written with the service role under a made-up programme ID, because
// buying a real programme would make this a payments spec; the log is
// append-only, so the fixture is keyed (dedupe_key) and written once.
//
// Writes append-only rows, so it runs on a disposable project only.
import { test, expect, request, type APIRequestContext, type Page } from "@playwright/test";
import {
  BASE,
  QA_EMAILS,
  adminClient,
  browserCookiesFor,
  cookieHeaderFor,
  markDashboardTourSeen,
  profileIdFor,
  waitForSplashToClear,
} from "./helpers";

test.skip(
  process.env.E2E_ALLOW_APPEND_ONLY_WRITES !== "1" && process.env.CI_LOCAL_STACK !== "1",
  "writes append-only activity-log rows; set E2E_ALLOW_APPEND_ONLY_WRITES=1 on a disposable project"
);

const db = adminClient();
const MARKER = "E2E all-logs";
const FIXTURE_PROGRAMME = "E2E_PKG999";
const FIXTURE_KEY = "e2e-all-logs-programme-fixture";

let patientId = "";
let patientName = "";
let patient: APIRequestContext;

async function openLogs(page: Page, query = "") {
  await page.context().addCookies(await browserCookiesFor(QA_EMAILS.admin));
  await page.goto(`${BASE}/admin/dashboard?section=logs&tab=all${query}`);
  await waitForSplashToClear(page);
}

test.beforeAll(async () => {
  patientId = await profileIdFor(db, QA_EMAILS.patientB);
  const { data } = await db.from("profiles").select("full_name").eq("id", patientId).single();
  patientName = data!.full_name as string;
  await markDashboardTourSeen(QA_EMAILS.patientB);
  await markDashboardTourSeen(QA_EMAILS.admin);
  patient = await request.newContext({ extraHTTPHeaders: { Cookie: await cookieHeaderFor(QA_EMAILS.patientB) } });
  await db.from("appointments").delete().like("concern", `${MARKER}%`);
});

test.afterAll(async () => {
  await db.from("appointments").delete().like("concern", `${MARKER}%`);
  await patient?.dispose();
});

test("ALL-001: a patient's own cancel is written to the log with their role", async () => {
  const { data: seeded, error } = await db
    .from("appointments")
    .insert({
      patient_id: patientId,
      slot_time: new Date(Date.now() + 5 * 24 * 3_600_000).toISOString(),
      status: "requested",
      payment_status: "unpaid",
      duration_minutes: 30,
      visit_mode: "online",
      concern: `${MARKER} cancel`,
    })
    .select("id")
    .single();
  expect(error).toBeNull();

  const res = await patient.post(`${BASE}/api/appointments/cancel`, { data: { appointmentId: seeded!.id } });
  expect(res.status()).toBe(200);

  const { data: entry } = await db
    .from("user_activity_log")
    .select("actor_role, actor_id, action, patient_id, patient_name, summary")
    .eq("appointment_id", seeded!.id)
    .eq("action", "appointment.cancelled")
    .single();
  expect(entry).toMatchObject({ actor_role: "patient", actor_id: patientId, patient_id: patientId });
  expect(entry!.summary).toContain("cancelled a session");
});

test("ALL-002: the Patient filter finds it in All Logs, chip and all, and narrows the list", async ({ page }) => {
  test.setTimeout(90_000);
  await openLogs(page, `&al_role=patient&al_pat=${encodeURIComponent(patientName)}`);

  const rows = page.locator("tbody tr").filter({ visible: true });
  const mine = rows.filter({ hasText: "Cancelled a session" }).first();
  await expect(mine).toBeVisible();
  await expect(mine).toContainText("Patient");
  await expect(mine).toContainText(patientName);

  // Every row left is a patient's: the role filter is applied, not decorative.
  const roleChips = rows.locator("span", { hasText: /^(Admin|Therapist|Hospital|System)$/ });
  await expect(roleChips).toHaveCount(0);

  // A patient nobody has heard of leaves nothing, and says so.
  const patientBox = page.getByLabel("Filter by patient").filter({ visible: true });
  await patientBox.fill("Nobody Atall Zzz");
  await expect(page.getByText("Nothing matches these filters").filter({ visible: true })).toBeVisible();
  await expect(page).toHaveURL(/al_pat=Nobody/);
});

test("ALL-003: the Programme ID filter finds an entry by its ID, case and underscores aside", async ({ page }) => {
  test.setTimeout(90_000);
  const { error } = await db.from("user_activity_log").upsert(
    {
      actor_role: "therapist",
      actor_name: "E2E Therapist",
      action: "care_plan.recommended",
      summary: "E2E Therapist recommended a programme (programme E2E_PKG999)",
      programme_code: FIXTURE_PROGRAMME,
      condition_name: "E2E Condition",
      dedupe_key: FIXTURE_KEY,
    },
    { onConflict: "dedupe_key", ignoreDuplicates: true }
  );
  expect(error).toBeNull();

  await openLogs(page, `&al_prog=${FIXTURE_PROGRAMME}`);
  const rows = page.locator("tbody tr").filter({ visible: true });
  const fixture = rows.filter({ hasText: FIXTURE_PROGRAMME }).first();
  await expect(fixture).toBeVisible();
  await expect(fixture).toContainText("Therapist");
  await expect(fixture).toContainText("Recommended a programme");

  // Typed the way a person types it.
  const box = page.getByLabel("Filter by programme ID").filter({ visible: true });
  await box.fill("e2e pkg999");
  await expect(rows.filter({ hasText: FIXTURE_PROGRAMME }).first()).toBeVisible();
  await box.fill("ZZZ_PKG404");
  await expect(page.getByText("Nothing matches these filters").filter({ visible: true })).toBeVisible();
});
