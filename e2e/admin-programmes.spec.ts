// Suite PRG -- Programmes, the admin section that follows one programme
// from the therapist's recommendation to its last session.
//
// A programme used to be two screens that never met (Sessions ->
// Recommendations, Catalog -> Purchases) under two codes (none, then
// SP0001 / HS0001). It is one row now, under one ID minted by the database
// (`next_programme_code()` in schema.sql): <condition code>_PKG<n> for video
// sessions, _HV<n> for home visits, shown with completed/bought appended --
// PED_PKG001-2/6. What only a browser can check is that the pipeline counts
// and filters the list, the ID moves when a session is completed, both the
// new ID and the old code find the row, and the drawer tells the story.
//
// Writes append-only care-plan versions and reviews, so it runs on a
// disposable project only (the same opt-in recommendation-course uses).
import { test, expect, request, type APIRequestContext, type Page } from "@playwright/test";
import {
  BASE,
  QA_EMAILS,
  adminClient,
  browserCookiesFor,
  cookieHeaderFor,
  markDashboardTourSeen,
  pageUntilVisible,
  profileIdFor,
  waitForSplashToClear,
} from "./helpers";

const db = adminClient();
const CONDITION = "Spine Conditions";
const MARKER = "E2E admin-programmes";
const SESSIONS = 5;

let patientId = "";
let therapistId = "";
let categoryId = "";
let perSessionPaise = 0;
let sourceAppointmentId = "";
let therapist: APIRequestContext;
let adminCtx: APIRequestContext;

// What the tests share: one approved recommendation, the purchase it
// became, and one completed session drawn from it.
const fixture = {
  carePlanId: "",
  versionId: "",
  programmeCode: "",
  purchaseId: "",
  legacyCode: "",
  sessionId: "",
  sessionCode: "",
};

test.skip(
  process.env.E2E_ALLOW_APPEND_ONLY_WRITES !== "1" && process.env.CI_LOCAL_STACK !== "1",
  "writes append-only care-plan rows; set E2E_ALLOW_APPEND_ONLY_WRITES=1 on a disposable project"
);

// The suite's own order matters (PRG-002 completes a session the later
// tests read), so it runs as one serial group.
test.describe.configure({ mode: "serial" });

async function clearOpenPlans() {
  await db
    .from("care_plans")
    .update({ status: "withdrawn" })
    .eq("patient_id", patientId)
    .in("status", ["active", "pending_review"]);
}

async function openProgrammes(page: Page, query = "") {
  await page.context().addCookies(await browserCookiesFor(QA_EMAILS.admin));
  const q = query ? `&pg_q=${encodeURIComponent(query)}` : "";
  await page.goto(`${BASE}/admin/dashboard?section=programmes&tab=all${q}`);
  await waitForSplashToClear(page);
  await expect(page.getByRole("heading", { name: "Where every programme is" }).filter({ visible: true })).toBeVisible({
    timeout: 60_000,
  });
}

function programmeRow(page: Page, code: string) {
  return page.locator(`li[data-programme-row="${code}"]`).filter({ visible: true });
}

test.beforeAll(async () => {
  test.setTimeout(120_000);
  patientId = await profileIdFor(db, QA_EMAILS.patientB);
  therapistId = await profileIdFor(db, QA_EMAILS.therapistA);
  await markDashboardTourSeen(QA_EMAILS.patientB);

  // Found or made, like recommendation-course: a disposable stack starts
  // with an empty catalogue.
  let { data: cat } = await db.from("treatment_categories").select("id, price_paise").eq("title", CONDITION).maybeSingle();
  if (!cat) {
    const { data: created, error } = await db
      .from("treatment_categories")
      .insert({
        title: CONDITION,
        description: "A condition seeded by the admin-programmes spec.",
        points: ["Back and neck pain"],
        price_paise: 49900,
        duration_minutes: 60,
        active: true,
        // The same photo recommendation-course and programme-checkout seed it
        // with: whichever spec creates it first, theirs check the cover.
        image_url: "/photos/care-back.jpg",
      })
      .select("id, price_paise")
      .single();
    if (error) throw new Error(`could not seed "${CONDITION}": ${error.message}`);
    cat = created;
  }
  categoryId = cat!.id;
  perSessionPaise = cat!.price_paise;

  // The completed session the recommendation is written against. A shared
  // QA therapist's diary is never assumed free: walk the hours of a past
  // day until one takes.
  const { data: existing } = await db
    .from("appointments")
    .select("id")
    .eq("concern", MARKER)
    .eq("status", "completed")
    .is("package_purchase_id", null)
    .limit(1)
    .maybeSingle();
  if (existing) {
    sourceAppointmentId = existing.id;
  } else {
    sourceAppointmentId = await insertCompletedSession(null, 11);
  }

  therapist = await request.newContext({ extraHTTPHeaders: { Cookie: await cookieHeaderFor(QA_EMAILS.therapistA) } });
  adminCtx = await request.newContext({ extraHTTPHeaders: { Cookie: await cookieHeaderFor(QA_EMAILS.admin) } });

  // The recommendation, approved by the clinic.
  await clearOpenPlans();
  const res = await therapist.post(`${BASE}/api/therapist/care-plan/submit`, {
    data: {
      patientId,
      appointmentId: sourceAppointmentId,
      categoryId,
      sessionCount: SESSIONS,
      handsOnRequired: false,
      frequencyPerWeek: 2,
      clinicalRationale: MARKER,
      instructions: "",
    },
  });
  expect(res.status(), await res.text()).toBe(200);
  const created = await res.json();
  fixture.carePlanId = created.carePlanId;
  fixture.versionId = created.versionId;
  const { data: planBefore } = await db.from("care_plans").select("status").eq("id", fixture.carePlanId).single();
  if (planBefore!.status === "pending_review") {
    const review = await adminCtx.post(`${BASE}/api/admin/review-care-plan`, {
      data: { carePlanId: fixture.carePlanId, decision: "approved" },
    });
    expect(review.status(), await review.text()).toBe(200);
  }
  const { data: plan } = await db.from("care_plans").select("programme_code").eq("id", fixture.carePlanId).single();
  fixture.programmeCode = (plan as { programme_code: string | null }).programme_code ?? "";
});

/** A completed session for the QA therapist on a past day, at the first hour
 *  their diary takes. */
async function insertCompletedSession(purchaseId: string | null, daysAgo: number): Promise<string> {
  for (let hour = 3; hour <= 14; hour++) {
    const slot = new Date(Date.now() - daysAgo * 86_400_000);
    slot.setUTCHours(hour, 30, 0, 0);
    const { data, error } = await db
      .from("appointments")
      .insert({
        patient_id: patientId,
        therapist_id: therapistId,
        category_id: categoryId,
        concern: MARKER,
        slot_time: slot.toISOString(),
        duration_minutes: 60,
        status: "completed",
        completed_at: new Date(slot.getTime() + 3_600_000).toISOString(),
        payment_status: "paid",
        amount_paid_paise: perSessionPaise,
        visit_mode: "online",
        ...(purchaseId ? { package_purchase_id: purchaseId } : {}),
      })
      .select("id")
      .single();
    if (!error && data) return data.id;
  }
  throw new Error("no free hour for a fixture session on the QA therapist's diary");
}

test.afterAll(async () => {
  // The session and the purchase are ordinary rows; the recommendation's
  // versions are append-only, so the thread is closed rather than deleted
  // and never sits in anybody's pipeline as an open programme.
  if (fixture.sessionId) await db.from("appointments").delete().eq("id", fixture.sessionId);
  if (fixture.purchaseId) await db.from("patient_package_purchases").delete().eq("id", fixture.purchaseId);
  if (fixture.carePlanId) await db.from("care_plans").update({ status: "withdrawn" }).eq("id", fixture.carePlanId);
  await therapist?.dispose();
  await adminCtx?.dispose();
});

test("PRG-001: a recommendation carries its programme ID from the start, and the pipeline filters to it", async ({ page }) => {
  test.setTimeout(150_000);
  // Minted by the database from the condition's code, on publish.
  const { data: cat } = await db.from("treatment_categories").select("short_code").eq("id", categoryId).single();
  const prefix = (cat as { short_code: string | null }).short_code;
  expect(prefix, "the condition was given a code").toMatch(/^[A-Z]{2,4}$/);
  expect(fixture.programmeCode).toMatch(new RegExp(`^${prefix}_PKG\\d{3,}$`));

  await openProgrammes(page, fixture.programmeCode);
  const row = programmeRow(page, fixture.programmeCode);
  await expect(row).toBeVisible({ timeout: 30_000 });
  await expect(row).toContainText(`${fixture.programmeCode}-0/${SESSIONS}`);
  await expect(row).toContainText("With patient");

  // The stage tile filters, says so, and writes itself into the URL.
  const withPatient = page.getByRole("button", { name: /With patient/ }).filter({ visible: true }).first();
  await withPatient.click();
  await expect(withPatient).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => new URL(page.url()).searchParams.get("pg_stage")).toBe("with_patient");
  await expect(row).toBeVisible();
  const completed = page.getByRole("button", { name: /^\d?\s*Completed/ }).filter({ visible: true }).first();
  await completed.click();
  await expect(row).toHaveCount(0);
  await expect(page.getByText("No programme matches these filters").filter({ visible: true })).toBeVisible();
});

test("PRG-002: completing a session moves the ID from -0/5 to -1/5", async ({ page }) => {
  test.setTimeout(150_000);
  const { data: version } = await db
    .from("care_plan_versions")
    .select("session_package_id")
    .eq("id", fixture.versionId)
    .single();
  // Bought, seeded paid directly (no payment, no ledger), like RC-007.
  const { data: purchase, error } = await db
    .from("patient_package_purchases")
    .insert({
      patient_id: patientId,
      package_id: version!.session_package_id,
      category_id: categoryId,
      session_count: SESSIONS,
      amount_paid_paise: perSessionPaise * SESSIONS,
      payment_status: "paid",
      paid_at: new Date().toISOString(),
      care_plan_version_id: fixture.versionId,
      locked_therapist_id: therapistId,
    })
    .select("id, purchase_code")
    .single();
  if (error) throw new Error(`could not seed a purchase: ${error.message}`);
  fixture.purchaseId = purchase.id;
  fixture.legacyCode = purchase.purchase_code ?? "";

  // The purchase carries its recommendation's ID, never a second one.
  const { data: bought } = await db.from("patient_package_purchases").select("programme_code").eq("id", purchase.id).single();
  expect((bought as { programme_code: string | null }).programme_code).toBe(fixture.programmeCode);

  await openProgrammes(page, fixture.programmeCode);
  const row = programmeRow(page, fixture.programmeCode);
  await expect(row).toContainText(`${fixture.programmeCode}-0/${SESSIONS}`, { timeout: 30_000 });
  await expect(row).toContainText("Paid - nothing booked");

  fixture.sessionId = await insertCompletedSession(purchase.id, 1);
  const { data: session } = await db.from("appointments").select("session_code").eq("id", fixture.sessionId).single();
  fixture.sessionCode = (session as { session_code: string | null }).session_code ?? "";

  await page.reload();
  await expect(row).toContainText(`${fixture.programmeCode}-1/${SESSIONS}`, { timeout: 60_000 });
  await expect(row).toContainText("In progress");

  // ...and every session drawn from it says which programme it is part of.
  await page.goto(`${BASE}/admin/dashboard?section=sessions&tab=all&view=${encodeURIComponent(`programme:${fixture.programmeCode}`)}`);
  const programmeFilter = page.getByRole("textbox", { name: "Filter by programme ID" }).filter({ visible: true });
  await expect(programmeFilter).toHaveValue(fixture.programmeCode, { timeout: 60_000 });
  const sessionRow = page.locator("tr", { hasText: fixture.sessionCode }).filter({ visible: true }).first();
  await expect(sessionRow).toBeVisible();
  await expect(sessionRow).toContainText(`${fixture.programmeCode}-1/${SESSIONS}`);
  await sessionRow.click();
  const drawer = page.getByRole("dialog").filter({ hasText: "Session Details" });
  await expect(drawer).toContainText("Part of");
  await expect(drawer).toContainText(`${fixture.programmeCode}-1/${SESSIONS}`);
});

test("PRG-003: the new ID, a copied ID with old progress, and the old code all find it", async ({ page }) => {
  test.setTimeout(150_000);
  await openProgrammes(page);
  const search = page.getByRole("searchbox", { name: "Search programmes" }).filter({ visible: true });
  const row = programmeRow(page, fixture.programmeCode);
  for (const query of [fixture.programmeCode, `${fixture.programmeCode}-0/${SESSIONS}`, fixture.legacyCode]) {
    if (!query) continue;
    await search.fill(query);
    expect(await pageUntilVisible(page, "programmes", row, { timeout: 20_000 }), `searching ${query}`).toBe(true);
  }
  // The search is in the URL, so the filtered list is a link to itself.
  await expect.poll(() => new URL(page.url()).searchParams.get("pg_q")).toBe(fixture.legacyCode || `${fixture.programmeCode}-0/${SESSIONS}`);
  await search.fill("NOPE_PKG999");
  await expect(row).toHaveCount(0);
});

test("PRG-004: the drawer tells the programme's story", async ({ page }) => {
  test.setTimeout(150_000);
  await openProgrammes(page, fixture.programmeCode);
  const row = programmeRow(page, fixture.programmeCode);
  await row.click();
  const drawer = page.getByRole("dialog").filter({ hasText: "What happened" });
  await expect(drawer).toBeVisible();
  await expect(drawer).toContainText(`${fixture.programmeCode}-1/${SESSIONS}`);
  await expect(drawer).toContainText(`1 of ${SESSIONS} sessions done`);
  // The timeline, oldest first: written, approved and sent, paid, the
  // session booked and completed.
  await expect(drawer).toContainText("Recommended by");
  await expect(drawer).toContainText("Paid");
  if (fixture.sessionCode) {
    await expect(drawer).toContainText(`${fixture.sessionCode} completed`);
    await expect(drawer.getByText(fixture.sessionCode).first()).toBeVisible();
  }
  // Money is a Master Admin's to read here.
  await expect(drawer).toContainText("List price");
  // The controls that belong to a bought programme.
  await expect(drawer.getByRole("button", { name: "Change therapist or extend expiry" })).toBeVisible();
  await expect(drawer.getByRole("button", { name: "Refund what is left" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);
});
