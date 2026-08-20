// Therapist-suggested sessions, end to end.
//
// The feature's whole reason for existing is that a suggestion is *not* a
// booking: nothing is scheduled and no package session is spent until the
// patient accepts. Most of this suite exists to prove that stays true under
// the conditions that normally break it -- the same request arriving twice,
// two people answering at once, a connection that drops mid-request, and a
// slot that goes stale while someone is looking at it.
import { test, expect, type APIRequestContext } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  BASE,
  QA_EMAILS,
  adminClient,
  browserCookiesFor,
  cookieHeaderFor,
  profileIdFor,
} from "./helpers";

const CATEGORY_TITLE = "QA Suggestion Programme";
const PACKAGE_TITLE = "QA Suggestion Package";

let categoryId = "";
let packageId = "";
let therapistId = "";
let patientId = "";
let therapistCookie = "";
let patientCookie = "";

/** A slot comfortably outside the 12-hour booking lead time. */
function slotInDays(days: number, hour = 10): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

async function freshPurchase(admin: SupabaseClient, sessionCount = 4) {
  const { data } = await admin
    .from("patient_package_purchases")
    .insert({
      patient_id: patientId,
      package_id: packageId,
      category_id: categoryId,
      session_count: sessionCount,
      sessions_used: 0,
      amount_paid_paise: 400000,
      payment_status: "paid",
      status: "active",
      locked_therapist_id: therapistId,
      expires_at: slotInDays(120),
    })
    .select("id")
    .single();
  return data?.id as string;
}

async function suggest(
  request: APIRequestContext,
  body: Record<string, unknown>,
  cookie = therapistCookie
) {
  return request.post(`${BASE}/api/therapist/suggest-session`, {
    headers: { cookie, "content-type": "application/json" },
    data: body,
  });
}

async function respond(
  request: APIRequestContext,
  body: Record<string, unknown>,
  cookie = patientCookie
) {
  return request.post(`${BASE}/api/patient/respond-suggestion`, {
    headers: { cookie, "content-type": "application/json" },
    data: body,
  });
}

test.describe("Therapist-suggested sessions", () => {
  test.beforeAll(async () => {
    const admin = adminClient();
    therapistId = await profileIdFor(admin, QA_EMAILS.therapistA);
    patientId = await profileIdFor(admin, QA_EMAILS.patientA);
    therapistCookie = await cookieHeaderFor(QA_EMAILS.therapistA);
    patientCookie = await cookieHeaderFor(QA_EMAILS.patientA);

    const { data: category } = await admin
      .from("treatment_categories")
      .insert({
        title: CATEGORY_TITLE,
        points: [],
        price_paise: 120000,
        duration_minutes: 60,
        active: true,
      })
      .select("id")
      .single();
    categoryId = category?.id ?? "";

    const { data: pkg } = await admin
      .from("treatment_category_packages")
      .insert({
        category_id: categoryId,
        title: PACKAGE_TITLE,
        session_count: 4,
        price_paise: 400000,
        active: true,
        therapist_locked: true,
      })
      .select("id")
      .single();
    packageId = pkg?.id ?? "";

    expect(categoryId, "seeded category").not.toBe("");
    expect(packageId, "seeded package").not.toBe("");

    await admin
      .from("site_settings")
      .update({ therapist_suggestions_enabled: true })
      .not("id", "is", null);
  });

  test.afterAll(async () => {
    const admin = adminClient();
    // Purchases cascade their suggestions; appointments created by accepted
    // ones are removed first so nothing is left pointing at them.
    const { data: purchases } = await admin
      .from("patient_package_purchases")
      .select("id")
      .eq("package_id", packageId);
    for (const p of purchases ?? []) {
      await admin.from("appointments").delete().eq("package_purchase_id", p.id);
    }
    await admin.from("patient_package_purchases").delete().eq("package_id", packageId);
    if (packageId) await admin.from("treatment_category_packages").delete().eq("id", packageId);
    if (categoryId) await admin.from("treatment_categories").delete().eq("id", categoryId);
    await admin
      .from("site_settings")
      .update({ therapist_suggestions_enabled: false })
      .not("id", "is", null);
  });

  // ---------------------------------------------------------------- happy path

  test("SS-001: suggesting spends nothing; accepting is what books", async ({ request }) => {
    const admin = adminClient();
    const purchaseId = await freshPurchase(admin);

    const created = await suggest(request, { purchaseId, slotTime: slotInDays(3) });
    expect(created.status()).toBe(200);
    const { suggestionId } = await created.json();

    // The claim this whole design rests on: a suggestion is not a claim.
    const { data: afterSuggest } = await admin
      .from("patient_package_purchases")
      .select("sessions_used")
      .eq("id", purchaseId)
      .single();
    expect(afterSuggest?.sessions_used, "suggesting must not consume a session").toBe(0);
    const { count: apptCount } = await admin
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("package_purchase_id", purchaseId);
    expect(apptCount, "suggesting must not create an appointment").toBe(0);

    const accepted = await respond(request, { suggestionId, answer: "accept" });
    expect(accepted.status()).toBe(200);
    const acceptedBody = await accepted.json();
    expect(acceptedBody.appointmentId).toBeTruthy();

    const { data: afterAccept } = await admin
      .from("patient_package_purchases")
      .select("sessions_used")
      .eq("id", purchaseId)
      .single();
    expect(afterAccept?.sessions_used, "accepting claims exactly one session").toBe(1);
  });

  test("SS-002: declining leaves the package untouched", async ({ request }) => {
    const admin = adminClient();
    const purchaseId = await freshPurchase(admin);
    const created = await suggest(request, { purchaseId, slotTime: slotInDays(4) });
    const { suggestionId } = await created.json();

    const declined = await respond(request, { suggestionId, answer: "decline" });
    expect(declined.status()).toBe(200);

    const { data: purchase } = await admin
      .from("patient_package_purchases")
      .select("sessions_used")
      .eq("id", purchaseId)
      .single();
    expect(purchase?.sessions_used).toBe(0);
    const { count } = await admin
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("package_purchase_id", purchaseId);
    expect(count).toBe(0);
  });

  // ------------------------------------------------------------ button spam

  test("SS-003: spamming Suggest creates exactly one pending suggestion", async ({ request }) => {
    const admin = adminClient();
    const purchaseId = await freshPurchase(admin);

    // Fired together, not in sequence -- a sequential loop would pass on a
    // SELECT-then-INSERT check that a real double tap defeats.
    const responses = await Promise.all(
      Array.from({ length: 6 }, () => suggest(request, { purchaseId, slotTime: slotInDays(5) }))
    );
    const ok = responses.filter((r) => r.status() === 200);
    const conflicts = responses.filter((r) => r.status() === 409);
    expect(ok, "exactly one suggestion should be created").toHaveLength(1);
    expect(conflicts, "the rest are refused as duplicates").toHaveLength(5);

    const { count } = await admin
      .from("session_suggestions")
      .select("id", { count: "exact", head: true })
      .eq("purchase_id", purchaseId)
      .eq("status", "pending");
    expect(count).toBe(1);
  });

  test("SS-004: spamming Accept books exactly one session", async ({ request }) => {
    const admin = adminClient();
    const purchaseId = await freshPurchase(admin);
    const created = await suggest(request, { purchaseId, slotTime: slotInDays(6) });
    const { suggestionId } = await created.json();

    const responses = await Promise.all(
      Array.from({ length: 6 }, () => respond(request, { suggestionId, answer: "accept" }))
    );
    // Every one succeeds -- a repeated accept is the same intent, not an
    // error the patient should have to read.
    for (const r of responses) expect(r.status()).toBe(200);

    const { data: purchase } = await admin
      .from("patient_package_purchases")
      .select("sessions_used")
      .eq("id", purchaseId)
      .single();
    expect(purchase?.sessions_used, "six taps must still spend one session").toBe(1);

    const { count } = await admin
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("package_purchase_id", purchaseId);
    expect(count, "six taps must still book one appointment").toBe(1);
  });

  test("SS-005: accept and decline racing each other settle on one answer", async ({
    request,
  }) => {
    const admin = adminClient();
    const purchaseId = await freshPurchase(admin);
    const created = await suggest(request, { purchaseId, slotTime: slotInDays(7) });
    const { suggestionId } = await created.json();

    await Promise.all([
      respond(request, { suggestionId, answer: "accept" }),
      respond(request, { suggestionId, answer: "decline" }),
    ]);

    const { data: row } = await admin
      .from("session_suggestions")
      .select("status, appointment_id")
      .eq("id", suggestionId)
      .single();
    expect(["accepted", "declined"]).toContain(row?.status);

    const { count } = await admin
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("package_purchase_id", purchaseId);
    // Whichever won, the two states must agree: an appointment exists if and
    // only if the suggestion says accepted.
    expect(count).toBe(row?.status === "accepted" ? 1 : 0);
    if (row?.status === "accepted") expect(row.appointment_id).toBeTruthy();
  });

  test("SS-006: withdraw racing accept never leaves a session half-booked", async ({
    request,
  }) => {
    const admin = adminClient();
    const purchaseId = await freshPurchase(admin);
    const created = await suggest(request, { purchaseId, slotTime: slotInDays(8) });
    const { suggestionId } = await created.json();

    await Promise.all([
      respond(request, { suggestionId, answer: "accept" }),
      request.post(`${BASE}/api/therapist/withdraw-suggestion`, {
        headers: { cookie: therapistCookie, "content-type": "application/json" },
        data: { suggestionId },
      }),
    ]);

    const { data: row } = await admin
      .from("session_suggestions")
      .select("status")
      .eq("id", suggestionId)
      .single();
    const { data: purchase } = await admin
      .from("patient_package_purchases")
      .select("sessions_used")
      .eq("id", purchaseId)
      .single();
    expect(purchase?.sessions_used).toBe(row?.status === "accepted" ? 1 : 0);
  });

  // ------------------------------------------------------- authorization

  test("SS-007: a therapist cannot suggest against someone else's programme", async ({
    request,
  }) => {
    const admin = adminClient();
    const purchaseId = await freshPurchase(admin);
    const otherCookie = await cookieHeaderFor(QA_EMAILS.therapistB);

    const res = await suggest(request, { purchaseId, slotTime: slotInDays(3) }, otherCookie);
    expect(res.status()).toBe(403);
  });

  test("SS-008: a patient cannot answer someone else's suggestion", async ({ request }) => {
    const admin = adminClient();
    const purchaseId = await freshPurchase(admin);
    const created = await suggest(request, { purchaseId, slotTime: slotInDays(3) });
    const { suggestionId } = await created.json();

    const otherCookie = await cookieHeaderFor(QA_EMAILS.patientB);
    const res = await respond(request, { suggestionId, answer: "accept" }, otherCookie);
    expect(res.status()).toBe(403);
  });

  test("SS-009: a patient cannot suggest, and a therapist cannot answer", async ({ request }) => {
    const admin = adminClient();
    const purchaseId = await freshPurchase(admin);

    const asPatient = await suggest(
      request,
      { purchaseId, slotTime: slotInDays(3) },
      patientCookie
    );
    expect(asPatient.status()).toBe(403);

    const created = await suggest(request, { purchaseId, slotTime: slotInDays(3) });
    const { suggestionId } = await created.json();
    const asTherapist = await respond(
      request,
      { suggestionId, answer: "accept" },
      therapistCookie
    );
    expect(asTherapist.status()).toBe(403);
  });

  test("SS-010: the admin switch refuses new suggestions", async ({ request }) => {
    const admin = adminClient();
    const purchaseId = await freshPurchase(admin);
    await admin
      .from("site_settings")
      .update({ therapist_suggestions_enabled: false })
      .not("id", "is", null);
    try {
      const res = await suggest(request, { purchaseId, slotTime: slotInDays(3) });
      expect(res.status()).toBe(403);
    } finally {
      await admin
        .from("site_settings")
        .update({ therapist_suggestions_enabled: true })
        .not("id", "is", null);
    }
  });

  // ------------------------------------------------------------ stale state

  test("SS-011: a slot inside the lead time is refused, at both ends", async ({ request }) => {
    const admin = adminClient();
    const purchaseId = await freshPurchase(admin);

    // Suggesting one is refused outright.
    const soon = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    const refused = await suggest(request, { purchaseId, slotTime: soon });
    expect(refused.status()).toBe(400);

    // And one that goes stale while the patient sits on it cannot be
    // accepted -- moved directly, since waiting out the lead time is not a
    // test.
    const created = await suggest(request, { purchaseId, slotTime: slotInDays(3) });
    const { suggestionId } = await created.json();
    await admin.from("session_suggestions").update({ slot_time: soon }).eq("id", suggestionId);

    const late = await respond(request, { suggestionId, answer: "accept" });
    expect(late.status()).toBe(409);

    const { data: purchase } = await admin
      .from("patient_package_purchases")
      .select("sessions_used")
      .eq("id", purchaseId)
      .single();
    expect(purchase?.sessions_used, "a lapsed accept must spend nothing").toBe(0);

    // Still pending, not silently rewritten -- nothing sweeps these.
    const { data: row } = await admin
      .from("session_suggestions")
      .select("status")
      .eq("id", suggestionId)
      .single();
    expect(row?.status).toBe("pending");
  });

  test("SS-012: an exhausted or expired programme cannot be suggested against", async ({
    request,
  }) => {
    const admin = adminClient();

    const exhausted = await freshPurchase(admin, 1);
    await admin
      .from("patient_package_purchases")
      .update({ sessions_used: 1 })
      .eq("id", exhausted);
    const noneLeft = await suggest(request, { purchaseId: exhausted, slotTime: slotInDays(3) });
    expect(noneLeft.status()).toBe(400);

    const expired = await freshPurchase(admin);
    await admin
      .from("patient_package_purchases")
      .update({ status: "expired" })
      .eq("id", expired);
    const gone = await suggest(request, { purchaseId: expired, slotTime: slotInDays(3) });
    expect(gone.status()).toBe(400);
  });

  test("SS-013: a slot after the programme expires is refused", async ({ request }) => {
    const admin = adminClient();
    const purchaseId = await freshPurchase(admin);
    await admin
      .from("patient_package_purchases")
      .update({ expires_at: slotInDays(2) })
      .eq("id", purchaseId);

    const res = await suggest(request, { purchaseId, slotTime: slotInDays(10) });
    expect(res.status()).toBe(400);
  });

  test("SS-014: garbage input is rejected without touching anything", async ({ request }) => {
    const admin = adminClient();
    const purchaseId = await freshPurchase(admin);

    for (const body of [
      {},
      { purchaseId },
      { purchaseId, slotTime: "not-a-date" },
      { purchaseId: "00000000-0000-4000-8000-000000000000", slotTime: slotInDays(3) },
      { purchaseId, slotTime: slotInDays(3), note: "x".repeat(501) },
    ]) {
      const res = await suggest(request, body);
      expect(res.status(), `${JSON.stringify(body)} should be rejected`).toBeGreaterThanOrEqual(
        400
      );
    }

    const { count } = await admin
      .from("session_suggestions")
      .select("id", { count: "exact", head: true })
      .eq("purchase_id", purchaseId);
    expect(count, "no bad request should have created a row").toBe(0);
  });

  // ------------------------------------------------------------------- UI

  test("SS-015: the patient sees the card, accepts it, and the package advances", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const admin = adminClient();
    const purchaseId = await freshPurchase(admin);
    await page.context().request.post(`${BASE}/api/therapist/suggest-session`, {
      headers: { cookie: therapistCookie, "content-type": "application/json" },
      data: { purchaseId, slotTime: slotInDays(9), note: "Same time next week" },
    });

    await page.context().addCookies(await browserCookiesFor(QA_EMAILS.patientA));
    await page.goto(`${BASE}/patient/dashboard`);
    await expect(page.getByText("Suggested by your therapist").first()).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByText("Same time next week")).toBeVisible();

    await page.getByRole("button", { name: /Accept this time/i }).first().click();
    await expect(page.getByText("Booked").first()).toBeVisible({ timeout: 60_000 });

    const { data: purchase } = await admin
      .from("patient_package_purchases")
      .select("sessions_used")
      .eq("id", purchaseId)
      .single();
    expect(purchase?.sessions_used).toBe(1);
  });

  test("SS-016: a dropped connection leaves the card answerable, and retry books once", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const admin = adminClient();
    const purchaseId = await freshPurchase(admin);
    await page.context().request.post(`${BASE}/api/therapist/suggest-session`, {
      headers: { cookie: therapistCookie, "content-type": "application/json" },
      data: { purchaseId, slotTime: slotInDays(11) },
    });

    await page.context().addCookies(await browserCookiesFor(QA_EMAILS.patientA));
    await page.goto(`${BASE}/patient/dashboard`);
    const accept = page.getByRole("button", { name: /Accept this time/i }).first();
    await expect(accept).toBeVisible({ timeout: 60_000 });

    // The first attempt never reaches the server.
    await page.route("**/api/patient/respond-suggestion", (route) => route.abort("failed"));
    await accept.click();
    await expect(page.getByText(/Couldn't reach the server/i)).toBeVisible({ timeout: 30_000 });
    // The card must still be answerable -- nothing was hidden optimistically.
    await expect(page.getByRole("button", { name: /Accept this time/i }).first()).toBeVisible();

    const { data: mid } = await admin
      .from("patient_package_purchases")
      .select("sessions_used")
      .eq("id", purchaseId)
      .single();
    expect(mid?.sessions_used, "a failed request must book nothing").toBe(0);

    // Connection returns; the retry books exactly one session.
    await page.unroute("**/api/patient/respond-suggestion");
    await page.getByRole("button", { name: /Accept this time/i }).first().click();
    await expect(page.getByText("Booked").first()).toBeVisible({ timeout: 60_000 });

    const { count } = await admin
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("package_purchase_id", purchaseId);
    expect(count).toBe(1);
  });

  test("SS-017: a slow response cannot be double-submitted from the UI", async ({ page }) => {
    test.setTimeout(180_000);
    const admin = adminClient();
    const purchaseId = await freshPurchase(admin);
    await page.context().request.post(`${BASE}/api/therapist/suggest-session`, {
      headers: { cookie: therapistCookie, "content-type": "application/json" },
      data: { purchaseId, slotTime: slotInDays(12) },
    });

    await page.context().addCookies(await browserCookiesFor(QA_EMAILS.patientA));
    await page.goto(`${BASE}/patient/dashboard`);

    // Held long enough that a person would tap again, and counted at the
    // network so the assertion is about requests sent, not clicks handled.
    let sent = 0;
    await page.route("**/api/patient/respond-suggestion", async (route) => {
      sent += 1;
      await new Promise((r) => setTimeout(r, 2500));
      await route.continue();
    });

    // The locator matches the busy label too. Matching only the idle label
    // would stop resolving the moment the button says "Booking…", so each
    // retry would wait for the previous request to *finish* and then fire a
    // legitimate second one -- measuring patience, not the double-tap guard.
    const accept = page
      .locator("button")
      .filter({ hasText: /Accept this time|Booking…/ })
      .first();
    await expect(accept).toBeVisible({ timeout: 60_000 });
    await accept.click();
    // Inside the held response, which is what a real double tap looks like.
    for (let i = 0; i < 4; i++) {
      await accept.click({ force: true, timeout: 250 }).catch(() => {});
    }
    await expect(page.getByText("Booked").first()).toBeVisible({ timeout: 60_000 });

    expect(sent, "five taps should send one request").toBe(1);
    const { count } = await admin
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("package_purchase_id", purchaseId);
    expect(count).toBe(1);
  });

  test("SS-018: the therapist sees the waiting state and can withdraw it", async ({ page }) => {
    test.setTimeout(180_000);
    const admin = adminClient();
    const purchaseId = await freshPurchase(admin);
    await page.context().request.post(`${BASE}/api/therapist/suggest-session`, {
      headers: { cookie: therapistCookie, "content-type": "application/json" },
      data: { purchaseId, slotTime: slotInDays(13) },
    });

    await page.context().addCookies(await browserCookiesFor(QA_EMAILS.therapistA));
    await page.goto(`${BASE}/therapist/dashboard`);
    await expect(page.getByText("Waiting on the patient").first()).toBeVisible({
      timeout: 60_000,
    });

    await page.getByRole("button", { name: /Withdraw suggestion/i }).first().click();
    await expect(page.getByText("Waiting on the patient")).toHaveCount(0, { timeout: 60_000 });

    const { data: row } = await admin
      .from("session_suggestions")
      .select("status")
      .eq("purchase_id", purchaseId)
      .single();
    expect(row?.status).toBe("withdrawn");
  });
});
