// A recommendation is a condition and a number of sessions, priced at that
// condition's per-session price times the count (src/lib/carePlans.ts).
// "Needs hands-on treatment" is the one switch between video sessions and
// home visits, and only a home-visit plan asks the patient where to come --
// on the Review & pay page now (e2e/programme-checkout.spec.ts covers the
// rest of it), where a new address takes a pincode, without which paying
// always said "Add the address these visits should come to".
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
  waitForSplashToClear, insertPastFixtureAppointment
} from "./helpers";

const db = adminClient();
const CONDITION = "Spine Conditions";
const MARKER = "E2E recommendation-course";

let patientId = "";
let therapistId = "";
let categoryId = "";
let perSessionPaise = 0;
let categoryImage = "";
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
  // Found or made: a long-lived project has this condition already, but the
  // gate's disposable stack starts with an empty catalog, and the first run
  // there failed reading `.id` of null. Created active, priced and with a
  // photo (RC-003 checks the card shows one). Not deleted afterwards:
  // append-only care-plan versions go on pointing at it, and on a
  // disposable stack nothing outlives the run anyway.
  let { data: cat } = await db
    .from("treatment_categories")
    .select("id, price_paise")
    .eq("title", CONDITION)
    .maybeSingle();
  if (!cat) {
    const { data: created, error } = await db
      .from("treatment_categories")
      .insert({
        title: CONDITION,
        description: "A condition seeded by the recommendation-course spec.",
        points: ["Back and neck pain", "Posture"],
        price_paise: 49900,
        duration_minutes: 60,
        active: true,
        image_url: "/photos/care-back.jpg",
      })
      .select("id, price_paise")
      .single();
    if (error) throw new Error(`could not seed "${CONDITION}": ${error.message}`);
    cat = created;
  }
  categoryId = cat!.id;
  perSessionPaise = cat!.price_paise;
  const { data: cover } = await db.from("treatment_categories").select("image_url").eq("id", categoryId).single();
  categoryImage = cover?.image_url ?? "";

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
    appointmentId = await insertPastFixtureAppointment(
      db,
      {
        patient_id: patientId,
        therapist_id: therapistId,
        category_id: categoryId,
        concern: MARKER,
        duration_minutes: 60,
        status: "completed",
        payment_status: "paid",
        amount_paid_paise: perSessionPaise,
        visit_mode: "online",
      },
      { daysAgo: 9 }
    );
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
  // The photo is drawn whole over a blurred copy of itself, never cropped
  // into a strip (ProgrammeCover).
  const cover = card.getByTestId("care-plan-image");
  await expect(cover).toBeVisible();
  const photo = cover.locator('img[data-cover="photo"]');
  await expect(photo).toHaveAttribute("src", categoryImage);
  expect(await photo.evaluate((el) => getComputedStyle(el).objectFit)).toBe("contain");
  expect((await cover.boundingBox())!.height).toBeGreaterThanOrEqual(200);
  await expect(card.getByText(/4 × ₹/)).toBeVisible();
  await expect(card.getByText("Video sessions")).toBeVisible();
  await expect(card.getByText("Where should we come?")).toHaveCount(0);
  // Accept & pay leads to the review page rather than opening Razorpay.
  await expect(card.getByRole("link", { name: /^Accept & pay/ })).toHaveAttribute(
    "href",
    /\/patient\/dashboard\/suggested\/checkout\?plan=/
  );
  await card.screenshot({ path: "test-results/recommendation-video.png" });
});

test("RC-004: hands-on makes it home visits, and a new address with a pincode goes through on Review & pay", async ({ page }) => {
  // Recommend, approve, two pages and three priced round trips: past 30s.
  test.setTimeout(90_000);
  const { version, versionId } = await recommendAndApprove({ sessionCount: 3, handsOnRequired: true });
  expect(version.offer_kind).toBe("home_visit_package");
  expect((version.offer_snapshot as Record<string, unknown>).sessionCount).toBe(3);

  const { data: area } = await db.from("home_visit_areas").select("pincode").eq("active", true).limit(1).single();
  // Razorpay's sheet is a stand-in that closes at once: the order is real,
  // nothing is paid, and no browser egress is needed to reach it.
  await page.route("https://checkout.razorpay.com/**", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `window.Razorpay = function (options) {
        this.on = function () {};
        this.open = function () { setTimeout(function () { options.modal && options.modal.ondismiss && options.modal.ondismiss(); }, 200); };
      };`,
    })
  );
  await page.context().addCookies(await browserCookiesFor(QA_EMAILS.patientB));
  await page.goto(`${BASE}/patient/dashboard/suggested`);
  await waitForSplashToClear(page);
  const card = page.locator("#recommendation");
  // The address moved to the review page: the card only links there.
  await expect(card.getByText("Where should we come?")).toHaveCount(0);
  const accept = card.getByRole("link", { name: /^Accept & pay/ });
  await expect(accept).toHaveAttribute("href", new RegExp(`/patient/dashboard/suggested/checkout\\?plan=${versionId}`));
  await accept.click();
  await page.waitForURL(/\/patient\/dashboard\/suggested\/checkout/);
  await waitForSplashToClear(page);

  await expect(page.getByText("Where should we come?")).toBeVisible();
  const elsewhere = page.getByLabel("Somewhere else");
  if (await elsewhere.count()) await elsewhere.check();
  await page.getByLabel("Pincode").fill(area!.pincode);
  await page.getByLabel("Flat / house number and street").fill("12A Test Street");
  const breakdown = page.getByTestId("programme-breakdown");
  await expect(breakdown.getByTestId("breakdown-travel")).not.toContainText("Needs your address");
  await expect(breakdown.getByTestId("breakdown-total")).toContainText("₹");

  const order = page.waitForResponse((r) => r.url().includes("/api/care-plan/create-order"));
  await page.getByRole("button", { name: /^Pay ₹/ }).click();
  const res = await order;
  const body = await res.json().catch(() => ({}));
  // The address reached the server and was accepted; only Razorpay's own
  // window is left, which this spec does not drive.
  expect(body.error ?? "").not.toContain("address");
  expect(res.status(), JSON.stringify(body)).toBe(200);
  await expect(page.getByText("Add the address these visits should come to.")).toHaveCount(0);
  await page.screenshot({ path: "test-results/recommendation-home.png" });
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

// A paid recommendation is bought against a hidden course package with no
// photo and an internal title, so Your Programmes showed a placeholder block
// and "<condition> - recommended course". It now carries the condition's
// photo and name (src/lib/programmeDisplay.ts). The purchase is seeded paid
// directly - no payment, no ledger - and deleted afterwards.
test("RC-007: a paid recommendation keeps its condition's photo and name on Your Programmes", async ({ page }) => {
  const { versionId, version } = await recommendAndApprove({ sessionCount: 4, handsOnRequired: false });
  const { data: purchase, error } = await db
    .from("patient_package_purchases")
    .insert({
      patient_id: patientId,
      package_id: version.session_package_id,
      category_id: categoryId,
      session_count: 4,
      amount_paid_paise: perSessionPaise * 4,
      payment_status: "paid",
      paid_at: new Date().toISOString(),
      care_plan_version_id: versionId,
      locked_therapist_id: therapistId,
    })
    .select("id")
    .single();
  if (error) throw new Error(`could not seed a purchase: ${error.message}`);
  try {
    await page.context().addCookies(await browserCookiesFor(QA_EMAILS.patientB));
    await page.goto(`${BASE}/patient/dashboard/packages`);
    await waitForSplashToClear(page);
    const card = page.locator("#your-packages div.rounded-xl", { hasText: `${CONDITION} programme` }).first();
    await expect(card).toBeVisible();
    await expect(card.getByText("recommended course")).toHaveCount(0);
    await expect(card.getByTestId("programme-cover").locator('img[data-cover="photo"]')).toHaveAttribute("src", categoryImage);
    await card.screenshot({ path: "test-results/recommendation-programme-card.png" });
  } finally {
    await db.from("patient_package_purchases").delete().eq("id", purchase.id);
  }
});

// Today's Recommendations card (src/lib/recommendationPulse.ts): a new
// recommendation is pinned there as waiting for approval, and once approved
// it reads as with the patient - both dated from the row, the first linking
// to Programmes -> Recommendations (the approval queue).
test("RC-008: admin Today shows a recommendation waiting for approval, then with the patient", async ({ page }) => {
  // The admin dashboard is the heaviest page in the app, loaded twice.
  test.setTimeout(150_000);
  await clearOpenPlans();
  const { data: patient } = await db.from("profiles").select("full_name").eq("id", patientId).single();
  const name = patient!.full_name as string;
  const res = await therapist.post(`${BASE}/api/therapist/care-plan/submit`, {
    data: { patientId, appointmentId, categoryId, sessionCount: 5, handsOnRequired: false, frequencyPerWeek: 2, clinicalRationale: MARKER, instructions: "" },
  });
  expect(res.status(), await res.text()).toBe(200);
  const created = await res.json();
  const { data: plan } = await db.from("care_plans").select("status").eq("id", created.carePlanId).single();

  await page.context().addCookies(await browserCookiesFor(QA_EMAILS.admin));
  await page.goto(`${BASE}/admin/dashboard`);
  await waitForSplashToClear(page);
  const card = page.locator("#today-recommendations");
  await expect(card).toBeVisible();
  await expect(card.getByTestId("recommendation-pulse-counts")).toContainText("Waiting for approval");

  if (plan!.status === "pending_review") {
    const row = card.getByRole("link", { name: new RegExp(`waiting for your approval - ${name}`) }).first();
    await expect(row).toBeVisible();
    await expect(row).toContainText("Needs you");
    await expect(row).toContainText(`5 sessions of ${CONDITION}`);
    // Programmes -> Recommendations is the approval queue now, and the row
    // leads with the recommendation's programme ID (…_PKG…-0/5).
    await expect(row).toHaveAttribute("href", /section=programmes&tab=review/);
    await expect(row).toContainText(/[A-Z]{2,4}_PKG\d{3,}-0\/5/);
    await card.screenshot({ path: "test-results/recommendation-pulse-pending.png" });
    const review = await adminCtx.post(`${BASE}/api/admin/review-care-plan`, {
      data: { carePlanId: created.carePlanId, decision: "approved" },
    });
    expect(review.status(), await review.text()).toBe(200);
  }
  // The approval reaches Today through the realtime refresh; a reload racing
  // that refresh can abort, so look again until it shows.
  const sent = page.locator("#today-recommendations").getByText(`Recommendation with ${name} - waiting on their answer`).first();
  await expect(async () => {
    if (!(await sent.isVisible())) await page.goto(`${BASE}/admin/dashboard`).catch(() => {});
    await expect(sent).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout: 45_000 });
  await page.locator("#today-recommendations").screenshot({ path: "test-results/recommendation-pulse-sent.png" });
});
