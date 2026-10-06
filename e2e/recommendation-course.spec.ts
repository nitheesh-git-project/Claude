// A recommendation is a condition and a number of sessions, priced at that
// condition's per-session price times the count (src/lib/carePlans.ts).
// "Needs hands-on treatment" is the one switch between video sessions and
// home visits, and only a home-visit plan asks the patient where to come --
// where a new address now takes a pincode, without which paying always
// said "Add the address these visits should come to".
//
// Writes append-only care-plan versions and reviews, so it runs on a
// disposable project only (the same opt-in clinical-continuity uses).
import { test, expect, request, type APIRequestContext } from "@playwright/test";
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
const MARKER = "E2E recommendation-course";

let patientId = "";
let therapistId = "";
let categoryId = "";
let perSessionPaise = 0;
let appointmentId = "";
let therapist: APIRequestContext;
let adminCtx: APIRequestContext;

test.skip(
  process.env.E2E_ALLOW_APPEND_ONLY_WRITES !== "1" && process.env.CI_LOCAL_STACK !== "1",
  "writes append-only care-plan rows; set E2E_ALLOW_APPEND_ONLY_WRITES=1 on a disposable project"
);

async function clearOpenPlans() {
  await db
    .from("care_plans")
    .update({ status: "withdrawn" })
    .eq("patient_id", patientId)
    .in("status", ["active", "pending_review"]);
}

async function recommendAndApprove(body: Record<string, unknown>) {
  await clearOpenPlans();
  const res = await therapist.post(`${BASE}/api/therapist/care-plan/submit`, {
    data: { patientId, appointmentId, categoryId, frequencyPerWeek: 2, clinicalRationale: MARKER, instructions: "", ...body },
  });
  expect(res.status(), await res.text()).toBe(200);
  const created = await res.json();
  const review = await adminCtx.post(`${BASE}/api/admin/review-care-plan`, {
    data: { carePlanId: created.carePlanId, decision: "approved" },
  });
  expect(review.status(), await review.text()).toBe(200);
  const { data: version } = await db
    .from("care_plan_versions")
    .select("offer_kind, offer_snapshot, session_package_id, home_visit_package_id")
    .eq("id", created.versionId)
    .single();
  return { ...created, version };
}

test.beforeAll(async () => {
  patientId = await profileIdFor(db, QA_EMAILS.patientB);
  therapistId = await profileIdFor(db, QA_EMAILS.therapistA);
  await markDashboardTourSeen(QA_EMAILS.patientB);
  const { data: cat } = await db
    .from("treatment_categories")
    .select("id, price_paise")
    .eq("title", CONDITION)
    .single();
  categoryId = cat!.id;
  perSessionPaise = cat!.price_paise;

  const { data: existing } = await db
    .from("appointments")
    .select("id")
    .eq("concern", MARKER)
    .eq("status", "completed")
    .limit(1)
    .maybeSingle();
  if (existing) {
    appointmentId = existing.id;
  } else {
    const slot = new Date(Date.now() - 9 * 86_400_000);
    slot.setUTCHours(4, 30, 0, 0);
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
        payment_status: "paid",
        amount_paid_paise: perSessionPaise,
        visit_mode: "online",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    appointmentId = data.id;
  }
  therapist = await request.newContext({ extraHTTPHeaders: { Cookie: await cookieHeaderFor(QA_EMAILS.therapistA) } });
  adminCtx = await request.newContext({ extraHTTPHeaders: { Cookie: await cookieHeaderFor(QA_EMAILS.admin) } });
});

test.afterAll(async () => {
  await clearOpenPlans();
  await therapist?.dispose();
  await adminCtx?.dispose();
});

test("RC-001: video sessions are priced per session times the count", async () => {
  const { version } = await recommendAndApprove({ sessionCount: 4, handsOnRequired: false });
  expect(version.offer_kind).toBe("session_package");
  const snap = version.offer_snapshot as Record<string, unknown>;
  expect(snap.course).toBe(true);
  expect(snap.sessionCount).toBe(4);
  expect(snap.perSessionPaise).toBe(perSessionPaise);
  expect(snap.pricePaise).toBe(perSessionPaise * 4);
  expect(snap.title).toBe(CONDITION);
});

test("RC-002: a count outside 1-30 is refused", async () => {
  await clearOpenPlans();
  for (const sessionCount of [0, 31]) {
    const res = await therapist.post(`${BASE}/api/therapist/care-plan/submit`, {
      data: { patientId, appointmentId, categoryId, sessionCount, handsOnRequired: false },
    });
    expect(res.status()).toBe(400);
  }
});

test("RC-003: the patient's video plan shows its photo and count, and no address", async ({ page }) => {
  await recommendAndApprove({ sessionCount: 4, handsOnRequired: false });
  await page.context().addCookies(await browserCookiesFor(QA_EMAILS.patientB));
  await page.goto(`${BASE}/patient/dashboard/suggested`);
  await waitForSplashToClear(page);
  const card = page.locator("#recommendation");
  await expect(card.getByRole("heading", { name: CONDITION })).toBeVisible();
  await expect(card.getByTestId("care-plan-image")).toBeVisible();
  await expect(card.getByText(/4 × ₹/)).toBeVisible();
  await expect(card.getByText("Video sessions")).toBeVisible();
  await expect(card.getByText("Where should we come?")).toHaveCount(0);
  await card.screenshot({ path: "test-results/recommendation-video.png" });
});

test("RC-004: hands-on makes it home visits, and a new address with a pincode goes through", async ({ page }) => {
  const { version } = await recommendAndApprove({ sessionCount: 3, handsOnRequired: true });
  expect(version.offer_kind).toBe("home_visit_package");
  expect((version.offer_snapshot as Record<string, unknown>).sessionCount).toBe(3);

  const { data: area } = await db.from("home_visit_areas").select("pincode").eq("active", true).limit(1).single();
  await page.context().addCookies(await browserCookiesFor(QA_EMAILS.patientB));
  await page.goto(`${BASE}/patient/dashboard/suggested`);
  await waitForSplashToClear(page);
  const card = page.locator("#recommendation");
  await expect(card.getByText("Where should we come?")).toBeVisible();
  const elsewhere = card.getByLabel("Somewhere else");
  if (await elsewhere.count()) await elsewhere.check();
  await card.getByLabel("Pincode").fill(area!.pincode);
  await card.getByLabel("Flat / house number and street").fill("12A Test Street");
  await expect(card.getByText("Total")).toBeVisible();

  const order = page.waitForResponse((r) => r.url().includes("/api/care-plan/create-order"));
  await card.getByRole("button", { name: /^Accept & pay/ }).click();
  const res = await order;
  const body = await res.json().catch(() => ({}));
  // The address reached the server and was accepted; only Razorpay's own
  // window is left, which this spec does not drive.
  expect(body.error ?? "").not.toContain("address");
  expect(res.status(), JSON.stringify(body)).toBe(200);
  await expect(card.getByText("Add the address these visits should come to.")).toHaveCount(0);
  await card.screenshot({ path: "test-results/recommendation-home.png" });
});

test("RC-005: the therapist's picker takes a number and shows the total live", async ({ page }) => {
  await clearOpenPlans();
  const slot = new Date(Date.now() - 60 * 60_000);
  slot.setMinutes(0, 0, 0);
  const { data: live, error } = await db
    .from("appointments")
    .insert({
      patient_id: patientId,
      therapist_id: therapistId,
      category_id: categoryId,
      concern: `${MARKER} live`,
      slot_time: slot.toISOString(),
      duration_minutes: 30,
      status: "confirmed",
      payment_status: "paid",
      visit_mode: "online",
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  try {
    await markDashboardTourSeen(QA_EMAILS.therapistA);
    await page.context().addCookies(await browserCookiesFor(QA_EMAILS.therapistA));
    await page.goto(`${BASE}/therapist/dashboard/sessions`);
    await waitForSplashToClear(page);
    const card = page.locator("div.rounded-xl", { hasText: `${MARKER} live` }).first();
    expect(await pageUntilVisible(page, "sessions", card)).toBe(true);
    await card.getByRole("button", { name: "Done", exact: true }).click();
    const dialog = page.getByRole("dialog").first();
    await dialog.getByRole("button", { name: "Add a recommendation" }).click();
    await expect(dialog.getByLabel("Condition", { exact: true })).toHaveValue(categoryId);
    const count = dialog.getByLabel("How many sessions", { exact: true });
    await count.fill("8");
    const total = dialog.getByTestId("care-plan-total");
    const inr = (p: number) => `₹${(p / 100).toLocaleString("en-IN")}`;
    await expect(total).toContainText(inr(perSessionPaise * 8));
    await dialog.getByLabel("Needs hands-on treatment").check();
    await expect(dialog.getByLabel("How many visits", { exact: true })).toHaveValue("8");
    await expect(dialog.getByText("Delivered as home visits")).toBeVisible();
    await total.scrollIntoViewIfNeeded();
    await dialog.screenshot({ path: "test-results/recommendation-picker.png" });
  } finally {
    await db.from("appointments").delete().eq("id", live!.id);
  }
});

test("RC-006: every other patient screen carries a short link to the recommendation", async ({ page }) => {
  test.setTimeout(120_000);
  await recommendAndApprove({ sessionCount: 4, handsOnRequired: false });
  await page.context().addCookies(await browserCookiesFor(QA_EMAILS.patientB));
  for (const path of ["/patient/dashboard", "/patient/dashboard/sessions", "/patient/dashboard/payments"]) {
    await page.goto(`${BASE}${path}`);
    await waitForSplashToClear(page);
    const teaser = page.getByTestId("suggested-teaser");
    await expect(teaser, path).toBeVisible();
    await expect(teaser).toContainText(`${CONDITION} - 4 sessions`);
    // The Suggested entry stays in the sidebar on every screen too.
    await expect(page.getByRole("link", { name: /Suggested/ }).first()).toBeVisible();
  }
  await page.screenshot({ path: "test-results/recommendation-teaser.png" });
  await page.getByTestId("suggested-teaser").click();
  await page.waitForURL(/\/patient\/dashboard\/suggested/);
  await expect(page.getByTestId("suggested-teaser")).toHaveCount(0);
  await expect(page.locator("#recommendation")).toBeVisible({ timeout: 30_000 });
});
