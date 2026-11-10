// The clinic's Health Profile layout (profileWidgets.ts) and the patient's
// order (B2), plus the diary's "I saved this by mistake" (E1).
//
// Written, not run in the build that added it: it needs a Supabase project
// the destructive-tooling rules allow. Fixtures: one throwaway orthopaedic
// patient and one throwaway neurological patient, each with a completed
// session with QA Therapist A. The layout rows are settings (deleted again
// at the end); the diary rows are append-only, so this runs on disposable
// projects only (E2E_ALLOW_APPEND_ONLY_WRITES=1 or the local stack).
import { test, expect, type APIRequestContext, type Browser } from "@playwright/test";
import {
  BASE,
  QA_EMAILS,
  adminClient,
  browserCookiesFor,
  cookieHeaderFor,
  createFixtureAccount,
  deleteFixtureAccount,
  insertPastFixtureAppointment,
  profileIdFor,
} from "./helpers";

test.skip(
  process.env.E2E_ALLOW_APPEND_ONLY_WRITES !== "1" && process.env.CI_LOCAL_STACK !== "1",
  "writes append-only diary rows; set E2E_ALLOW_APPEND_ONLY_WRITES=1 on a disposable project"
);
test.describe.configure({ mode: "serial" });
test.setTimeout(240_000);

const db = adminClient();
const SEEN = { timeout: 60_000 };
let ortho: { id: string; email: string; name: string } | undefined;
let neuro: { id: string; email: string; name: string } | undefined;

async function post(request: APIRequestContext, path: string, email: string, data: unknown) {
  return request.post(`${BASE}${path}`, { headers: { cookie: await cookieHeaderFor(email), "content-type": "application/json" }, data });
}

async function pageAs(browser: Browser, email: string, path: string) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addCookies(await browserCookiesFor(email));
  const page = await context.newPage();
  await page.goto(`${BASE}${path}`);
  return { page, context };
}

test.beforeAll(async () => {
  const therapistAId = await profileIdFor(db, QA_EMAILS.therapistA);
  ortho = await createFixtureAccount("Layout Ortho");
  neuro = await createFixtureAccount("Layout Neuro");
  for (const [p, specialty, data] of [
    [ortho, "ortho", { chief_complaint: "Right knee pain, E2E layout" }],
    [neuro, "neuro", { neuro_independence: "6" }],
  ] as const) {
    const { error } = await db.from("patient_condition_profiles").insert({ patient_id: p.id, specialty, status: "active", data });
    expect(error, error?.message).toBeNull();
    await insertPastFixtureAppointment(db, {
      patient_id: p.id,
      therapist_id: therapistAId,
      status: "completed",
      payment_status: "paid",
      visit_mode: "online",
      duration_minutes: 30,
      concern: "E2E layout",
    });
  }
});

test.afterAll(async () => {
  if (ortho) await db.from("patient_profile_widget_overrides").delete().eq("patient_id", ortho.id);
  await db.from("profile_widget_kind_settings").delete().eq("profile_kind", "ortho").eq("widget_key", "care_plan_history");
  await deleteFixtureAccount(ortho?.id);
  await deleteFixtureAccount(neuro?.id);
});

test("HPL-001: the routes refuse a locked section, an unknown one and a caller outside the scope", async ({ request }) => {
  const locked = await post(request, "/api/admin/profile-widgets/patient", QA_EMAILS.admin, { patientId: ortho!.id, widgetKey: "status_header", visible: false });
  expect(locked.status()).toBe(400);
  expect((await locked.json()).code).toBe("locked_widget");
  const otherKind = await post(request, "/api/admin/profile-widgets/patient", QA_EMAILS.admin, { patientId: ortho!.id, widgetKey: "fall_risk", visible: false });
  expect(otherKind.status()).toBe(400);
  expect((await otherKind.json()).code).toBe("unknown_widget");
  const kindLocked = await post(request, "/api/admin/profile-widgets/kind", QA_EMAILS.admin, { profileKind: "geriatric", widgetKey: "fall_risk", visible: false });
  expect(kindLocked.status()).toBe(400);
  for (const email of [QA_EMAILS.patientA, QA_EMAILS.therapistA]) {
    expect((await post(request, "/api/admin/profile-widgets/patient", email, { patientId: ortho!.id, widgetKey: "reports_scans", visible: false })).status()).toBe(403);
    expect((await post(request, "/api/admin/profile-widgets/kind", email, { profileKind: "ortho", widgetKey: "reports_scans", visible: false })).status()).toBe(403);
  }
  // A malformed body is a 400, not a 500.
  const bad = await request.post(`${BASE}/api/admin/profile-widgets/kind`, {
    headers: { cookie: await cookieHeaderFor(QA_EMAILS.admin), "content-type": "application/json" },
    data: "{not json",
  });
  expect(bad.status()).toBe(400);
});

test("HPL-002: the patient's page is in the patient's order, the extra blocks closed", async ({ browser }) => {
  const { page, context } = await pageAs(browser, ortho!.email, "/patient/dashboard/health-profile");
  const root = page.getByTestId("ortho-profile");
  await expect(root).toBeVisible(SEEN);
  // The graph is open; the measures and reports are closed blocks below it.
  await expect(page.locator('section[aria-label="Progress"]')).toBeVisible(SEEN);
  for (const id of ["details-measures", "details-picture", "details-answers", "details-reports"]) {
    const block = page.getByTestId(id);
    await expect(block).toBeVisible(SEEN);
    await expect(block).not.toHaveAttribute("open", /.*/);
  }
  // Exercises come before the graph, the graph before the closed blocks.
  const order = await page.evaluate(() => {
    const at = (sel: string) => {
      const el = document.querySelector(sel);
      return el ? el.getBoundingClientRect().top + window.scrollY : Number.NaN;
    };
    return { graph: at('section[aria-label="Progress"]'), measures: at('[data-testid="details-measures"]'), share: at('[data-testid="share-profile-card"]') };
  });
  expect(order.graph).toBeLessThan(order.measures);
  expect(order.measures).toBeLessThan(order.share);
  // No duplicate snapshot strip on the orthopaedic page.
  await expect(page.getByTestId("specialty-snapshot-strip")).toHaveCount(0);
  await context.close();
});

test("HPL-003: a section hidden for one patient leaves their page, stays on the clinicians'", async ({ browser, request }) => {
  const hide = await post(request, "/api/admin/profile-widgets/patient", QA_EMAILS.admin, { patientId: ortho!.id, widgetKey: "reports_scans", visible: false, reason: "E2E" });
  expect(hide.status(), await hide.text()).toBe(200);

  const own = await pageAs(browser, ortho!.email, "/patient/dashboard/health-profile");
  await expect(own.page.getByTestId("ortho-profile")).toBeVisible(SEEN);
  await expect(own.page.getByTestId("details-reports")).toHaveCount(0);
  // The safety card is never hidden.
  await expect(own.page.getByText(/Where things stand/i).first()).toBeVisible(SEEN);
  await own.context.close();

  const chart = await pageAs(browser, QA_EMAILS.therapistA, `/therapist/dashboard/health-profile/${ortho!.id}`);
  await expect(chart.page.getByTestId("hidden-for-patient")).toContainText("1 section hidden for this patient", SEEN);
  await expect(chart.page.getByText("Test reports and scans").first()).toBeVisible(SEEN);
  await chart.context.close();

  const admin = await pageAs(browser, QA_EMAILS.admin, `/admin/dashboard/conditions/${ortho!.id}`);
  await expect(admin.page.getByTestId("admin-hidden-for-patient")).toContainText("Reports and scans", SEEN);
  await expect(admin.page.getByTestId("profile-widget-patient-panel")).toContainText("of", SEEN);
  await admin.context.close();

  // Reset to the condition default brings it back.
  const reset = await post(request, "/api/admin/profile-widgets/patient", QA_EMAILS.admin, { patientId: ortho!.id, widgetKey: "reports_scans", visible: null });
  expect(reset.status()).toBe(200);
  const again = await pageAs(browser, ortho!.email, "/patient/dashboard/health-profile");
  await expect(again.page.getByTestId("details-reports")).toBeVisible(SEEN);
  await again.context.close();

  // The audit trail names both changes.
  const { data: log } = await db
    .from("admin_activity_log")
    .select("action")
    .eq("action", "profile_widgets.set_patient")
    .eq("target_id", ortho!.id);
  expect((log ?? []).length).toBeGreaterThanOrEqual(2);
});

test("HPL-004: a condition-kind choice applies to every patient of the kind, and a patient override beats it", async ({ browser, request }) => {
  expect((await post(request, "/api/admin/profile-widgets/kind", QA_EMAILS.admin, { profileKind: "ortho", widgetKey: "care_plan_history", visible: false })).status()).toBe(200);
  const own = await pageAs(browser, ortho!.email, "/patient/dashboard/health-profile");
  await expect(own.page.getByTestId("ortho-profile")).toBeVisible(SEEN);
  await expect(own.page.getByTestId("details-recommendations")).toHaveCount(0);
  await own.context.close();
  expect((await post(request, "/api/admin/profile-widgets/kind", QA_EMAILS.admin, { profileKind: "ortho", widgetKey: "care_plan_history", visible: null })).status()).toBe(200);
});

test("HPL-005: a fall saved by mistake is withdrawn, kept, and no longer counted", async ({ browser, request }) => {
  const added = await post(request, "/api/patient/diary/add", neuro!.email, {
    kind: "fall",
    occurredAt: new Date(Date.now() - 60 * 60_000).toISOString(),
    details: { injured: false },
  });
  expect(added.status(), await added.text()).toBe(200);
  const entry = (await added.json()).entry as { id: string };

  // Someone else cannot withdraw it.
  expect((await post(request, "/api/patient/diary/correct", QA_EMAILS.patientA, { entryId: entry.id })).status()).toBe(404);
  const fixed = await post(request, "/api/patient/diary/correct", neuro!.email, { entryId: entry.id });
  expect(fixed.status(), await fixed.text()).toBe(200);
  expect((await fixed.json()).duplicate).toBe(false);
  const twice = await post(request, "/api/patient/diary/correct", neuro!.email, { entryId: entry.id });
  expect((await twice.json()).duplicate).toBe(true);

  // Nothing was deleted: the entry and its correction are both rows.
  const { data: rows } = await db.from("patient_diary_entries").select("id, kind").eq("patient_id", neuro!.id);
  expect((rows ?? []).map((r) => r.kind).sort()).toEqual(["correction", "fall"]);

  // The therapist cannot confirm a withdrawn entry, and sees it marked.
  const confirm = await post(request, "/api/therapist/diary/confirm", QA_EMAILS.therapistA, { entryId: entry.id });
  expect(confirm.status()).toBe(409);
  const chart = await pageAs(browser, QA_EMAILS.therapistA, `/therapist/dashboard/health-profile/${neuro!.id}`);
  await expect(chart.page.getByTestId("diary-corrected").first()).toContainText("Withdrawn by the patient", SEEN);
  await expect(chart.page.getByTestId("neuro-profile").getByText("Needs attention")).toHaveCount(0);
  await chart.context.close();
});

test("HPL-006: logging a fall where they were hurt shows the 108 box and reads the fall back before saving", async ({ browser }) => {
  const { page, context } = await pageAs(browser, neuro!.email, "/patient/dashboard/health-profile");
  await page.getByTestId("diary-log-button").click();
  await page.getByText("Yes, I was hurt").click();
  await expect(page.getByTestId("fall-urgent-box")).toContainText("call 108", SEEN);
  await page.getByRole("button", { name: "Check and save" }).click();
  await expect(page.getByTestId("fall-review")).toContainText("Your physiotherapist will see it", SEEN);
  // Closed without saving: nothing written by this test.
  await page.getByRole("button", { name: "Cancel" }).click();
  await context.close();
});
