// Every programme session goes through the admin.
//
// A session booked against a programme used to assign itself: the purchase's
// locked therapist (or the therapist who suggested the time) was reserved and
// the session confirmed with a Meet link the moment the patient booked, so no
// person ever looked at it. The owner's call: every programme session --
// booked from the patient's credits (book-package-sessions), a therapist's
// suggestion the patient accepted (respond-suggestion), and a visit on a
// home-visit programme (book-visits) -- lands `requested` and unassigned in
// "Sessions with no therapist", with the programme's therapist pre-picked.
// One tap on "Assign <name>" in the session drawer assigns and confirms it
// through /api/admin/assign-appointment. See docs/rules/programmes.md.
//
// Fixtures are this spec's own category, package and purchases, inserted
// directly (no entitlement, so no append-only ledger rows), and removed in
// afterAll. The QA therapist's hours are opened as one-off exceptions for
// exactly the slots used and closed again.
import { test, expect, request as playwrightRequest, type APIRequestContext } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  BASE,
  E2E_MARKERS,
  QA_EMAILS,
  adminClient,
  browserCookiesFor,
  clinicSlot,
  cookieHeaderFor,
  deleteHomeVisitFixturePurchases,
  openTherapistHour,
  profileIdFor,
  waitForSplashToClear,
} from "./helpers";

const CATEGORY_TITLE = "QA Programme Via Admin Condition";
const PACKAGE_TITLE = "QA Programme Via Admin Package";

let admin: SupabaseClient;
let patientId = "";
let therapistId = "";
let therapistName = "";
let categoryId = "";
let packageId = "";
let suggestionsWereOn: boolean | null = null;
const purchaseIds: string[] = [];
const homeVisitPurchaseIds: string[] = [];
const addressIds: string[] = [];
const closeHours: Array<() => Promise<void>> = [];

// Far out and spread, so no two runs (or two tests) share an hour on the QA
// therapist's diary, and the booking lead time never gets in the way.
let dayCursor = 50 + Math.floor(Math.random() * 200);
function nextSlot(hour = 11): string {
  dayCursor += 3;
  return clinicSlot(dayCursor, hour);
}

async function contextFor(email: string): Promise<APIRequestContext> {
  return playwrightRequest.newContext({ extraHTTPHeaders: { cookie: await cookieHeaderFor(email) } });
}

async function lockedPurchase(): Promise<string> {
  const { data, error } = await admin
    .from("patient_package_purchases")
    .insert({
      patient_id: patientId,
      package_id: packageId,
      category_id: categoryId,
      session_count: 4,
      sessions_used: 0,
      amount_paid_paise: 400000,
      payment_status: "paid",
      status: "active",
      paid_at: new Date().toISOString(),
      locked_therapist_id: therapistId,
      expires_at: new Date(Date.now() + 2 * 365 * 86_400_000).toISOString(),
    })
    .select("id")
    .single();
  expect(error?.message ?? null, "seeded purchase").toBeNull();
  purchaseIds.push(data!.id as string);
  return data!.id as string;
}

async function expectWaitingForAdmin(appointmentId: string) {
  const { data: row } = await admin
    .from("appointments")
    .select("status, therapist_id, payment_status")
    .eq("id", appointmentId)
    .single();
  expect(row?.status, "waits for the admin's assign").toBe("requested");
  expect(row?.therapist_id, "nobody is put on it by the booking").toBeNull();
  return row;
}

test.describe("Programme sessions go through the admin, with the programme's therapist pre-picked", () => {
  test.beforeAll(async () => {
    admin = adminClient();
    patientId = await profileIdFor(admin, QA_EMAILS.patientB);
    therapistId = await profileIdFor(admin, QA_EMAILS.therapistA);
    const { data: therapist } = await admin.from("profiles").select("full_name").eq("id", therapistId).single();
    therapistName = therapist?.full_name as string;

    const { data: category } = await admin
      .from("treatment_categories")
      .insert({ title: CATEGORY_TITLE, points: [], price_paise: 100000, duration_minutes: 60, active: true })
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

    const { data: toggle } = await admin.from("site_settings").select("therapist_suggestions_enabled").maybeSingle();
    suggestionsWereOn = toggle?.therapist_suggestions_enabled ?? null;
    await admin.from("site_settings").update({ therapist_suggestions_enabled: true }).not("id", "is", null);
  });

  test.afterAll(async () => {
    for (const close of closeHours.splice(0)) await close();
    for (const id of purchaseIds) {
      await admin.from("appointments").delete().eq("package_purchase_id", id);
    }
    if (purchaseIds.length) await admin.from("patient_package_purchases").delete().in("id", purchaseIds);
    await deleteHomeVisitFixturePurchases(admin, homeVisitPurchaseIds.splice(0));
    if (addressIds.length) await admin.from("patient_addresses").delete().in("id", addressIds);
    if (packageId) await admin.from("treatment_category_packages").delete().eq("id", packageId);
    if (categoryId) await admin.from("treatment_categories").delete().eq("id", categoryId);
    if (suggestionsWereOn !== null) {
      await admin
        .from("site_settings")
        .update({ therapist_suggestions_enabled: suggestionsWereOn })
        .not("id", "is", null);
    }
  });

  test("PSA-001: sessions booked from a locked programme wait unassigned for the admin", async () => {
    const purchaseId = await lockedPurchase();
    const ctx = await contextFor(QA_EMAILS.patientB);
    try {
      const res = await ctx.post(`${BASE}/api/appointments/book-package-sessions`, {
        data: { packagePurchaseId: purchaseId, slots: [{ slotDateTime: nextSlot() }, { slotDateTime: nextSlot() }] },
      });
      expect(res.status(), await res.text()).toBe(200);
      const body = await res.json();
      const booked = body.results.filter((r: { success: boolean }) => r.success);
      expect(booked.length).toBe(2);
      for (const r of booked) {
        const row = await expectWaitingForAdmin(r.appointmentId);
        expect(row?.payment_status, "paid from the programme").toBe("paid");
      }
    } finally {
      await ctx.dispose();
    }
  });

  test("PSA-002: an accepted suggestion waits unassigned for the admin too", async () => {
    const purchaseId = await lockedPurchase();
    const slot = nextSlot(12);
    // A therapist may only suggest inside their own working hours.
    closeHours.push(await openTherapistHour(admin, therapistId, slot));
    const therapistCtx = await contextFor(QA_EMAILS.therapistA);
    const patientCtx = await contextFor(QA_EMAILS.patientB);
    try {
      const suggested = await therapistCtx.post(`${BASE}/api/therapist/suggest-session`, {
        data: { purchaseId, slotTime: slot },
      });
      expect(suggested.status(), await suggested.text()).toBe(200);
      const { suggestionId } = await suggested.json();

      const accepted = await patientCtx.post(`${BASE}/api/patient/respond-suggestion`, {
        data: { suggestionId, answer: "accept" },
      });
      expect(accepted.status(), await accepted.text()).toBe(200);
      const { appointmentId } = await accepted.json();
      expect(appointmentId).toBeTruthy();
      await expectWaitingForAdmin(appointmentId);
    } finally {
      await therapistCtx.dispose();
      await patientCtx.dispose();
    }
  });

  test("PSA-003: a visit booked on a locked home-visit programme waits unassigned for the admin", async () => {
    const { data: pkg } = await admin
      .from("home_visit_packages")
      .select("id")
      .eq("title", "4-Visit Home Recovery Programme")
      .single();
    const { data: area } = await admin
      .from("home_visit_areas")
      .select("id, travel_fee_paise")
      .eq("pincode", "600017")
      .single();
    const { data: address } = await admin
      .from("patient_addresses")
      .insert({
        patient_id: patientId,
        line1: E2E_MARKERS.savedAddressLine1,
        pincode: "600017",
        area_id: area!.id,
        is_default: false,
      })
      .select("id")
      .single();
    addressIds.push(address!.id);
    const { data: purchase } = await admin
      .from("home_visit_package_purchases")
      .insert({
        patient_id: patientId,
        package_id: pkg!.id,
        visit_count: 4,
        visits_used: 0,
        travel_fee_paise: area!.travel_fee_paise,
        payment_mode: "prepaid",
        payment_status: "paid",
        status: "active",
        default_address_id: address!.id,
        locked_therapist_id: therapistId,
        expires_at: new Date(Date.now() + 2 * 365 * 86_400_000).toISOString(),
      })
      .select("id")
      .single();
    homeVisitPurchaseIds.push(purchase!.id);

    const ctx = await contextFor(QA_EMAILS.patientB);
    try {
      const res = await ctx.post(`${BASE}/api/home-visit/book-visits`, {
        data: { homeVisitPurchaseId: purchase!.id, slots: [{ slotDateTime: nextSlot(10) }] },
      });
      expect(res.status(), await res.text()).toBe(200);
      const body = await res.json();
      const booked = body.results.filter((r: { success: boolean }) => r.success);
      expect(booked.length, JSON.stringify(body.results)).toBe(1);
      const row = await expectWaitingForAdmin(booked[0].appointmentId);
      expect(row?.payment_status, "a prepaid visit stays paid").toBe("paid");
    } finally {
      await ctx.dispose();
    }
  });

  test("PSA-004: the queue row names the programme therapist and one tap assigns and confirms", async ({ browser }) => {
    test.setTimeout(90_000);
    const purchaseId = await lockedPurchase();
    const slot = nextSlot(15);
    // Open the hour first: the pre-pick is offered as one tap only while the
    // roster says the therapist can take it, and the assign route checks too.
    closeHours.push(await openTherapistHour(admin, therapistId, slot));
    const patientCtx = await contextFor(QA_EMAILS.patientB);
    let appointmentId = "";
    try {
      const res = await patientCtx.post(`${BASE}/api/appointments/book-package-sessions`, {
        data: { packagePurchaseId: purchaseId, slots: [{ slotDateTime: slot }] },
      });
      expect(res.status(), await res.text()).toBe(200);
      appointmentId = (await res.json()).results[0].appointmentId;
      expect(appointmentId).toBeTruthy();
    } finally {
      await patientCtx.dispose();
    }
    const { data: appt } = await admin.from("appointments").select("session_code").eq("id", appointmentId).single();
    const sessionCode = appt!.session_code as string;

    const context = await browser.newContext();
    await context.addCookies(await browserCookiesFor(QA_EMAILS.admin));
    const page = await context.newPage();
    try {
      await page.goto(`${BASE}/admin/dashboard?section=sessions&tab=all&view=unassigned`);
      await waitForSplashToClear(page);
      await page.getByPlaceholder("Session ID").filter({ visible: true }).first().fill(sessionCode);
      const row = page.locator("tr", { hasText: sessionCode }).filter({ visible: true }).first();
      await expect(row).toBeVisible({ timeout: 60_000 });
      await expect(row).toContainText(`Tap to assign · ${therapistName}`);

      await row.click();
      const drawer = page.getByRole("dialog").filter({ visible: true }).filter({ hasText: sessionCode });
      await expect(drawer.getByTestId("programme-pick")).toContainText(`Programme therapist: ${therapistName}`);
      await drawer.getByRole("button", { name: `Assign ${therapistName}`, exact: true }).click();

      await expect(async () => {
        const { data: after } = await admin
          .from("appointments")
          .select("status, therapist_id")
          .eq("id", appointmentId)
          .single();
        expect(after?.therapist_id, "the programme's therapist").toBe(therapistId);
        expect(after?.status, "a paid session confirms on assign").toBe("confirmed");
      }).toPass({ timeout: 60_000 });
    } finally {
      await context.close();
    }
  });

  test("PSA-005: a pre-picked therapist who is no longer free is named, not offered as one tap", async ({ browser }) => {
    test.setTimeout(90_000);
    const purchaseId = await lockedPurchase();
    const slot = nextSlot(16);
    const patientCtx = await contextFor(QA_EMAILS.patientB);
    let appointmentId = "";
    try {
      const res = await patientCtx.post(`${BASE}/api/appointments/book-package-sessions`, {
        data: { packagePurchaseId: purchaseId, slots: [{ slotDateTime: slot }] },
      });
      expect(res.status(), await res.text()).toBe(200);
      appointmentId = (await res.json()).results[0].appointmentId;
    } finally {
      await patientCtx.dispose();
    }
    // Nothing is held for the therapist while the session waits: close the
    // hour on their roster (a one-off exception wins over any template).
    const ist = new Date(new Date(slot).getTime() + 5.5 * 3_600_000);
    const date = ist.toISOString().slice(0, 10);
    const hour = ist.getUTCHours();
    await admin
      .from("therapist_availability_override")
      .upsert({ therapist_id: therapistId, date, hour, available: false, note: "e2e" }, { onConflict: "therapist_id,date,hour" });
    const { data: appt } = await admin.from("appointments").select("session_code").eq("id", appointmentId).single();
    const sessionCode = appt!.session_code as string;

    const context = await browser.newContext();
    await context.addCookies(await browserCookiesFor(QA_EMAILS.admin));
    const page = await context.newPage();
    try {
      await page.goto(`${BASE}/admin/dashboard?section=sessions&tab=all&view=unassigned`);
      await waitForSplashToClear(page);
      await page.getByPlaceholder("Session ID").filter({ visible: true }).first().fill(sessionCode);
      const row = page.locator("tr", { hasText: sessionCode }).filter({ visible: true }).first();
      await expect(row).toBeVisible({ timeout: 60_000 });
      await expect(row).toContainText(`${therapistName} not free`);

      await row.click();
      const drawer = page.getByRole("dialog").filter({ visible: true }).filter({ hasText: sessionCode });
      await expect(drawer.getByTestId("programme-pick-warning")).toContainText(
        `${therapistName} is no longer free at this time - pick someone else or move it.`
      );
      await expect(drawer.getByRole("button", { name: `Assign ${therapistName}`, exact: true })).toHaveCount(0);
      await expectWaitingForAdmin(appointmentId);
    } finally {
      await context.close();
      await admin
        .from("therapist_availability_override")
        .delete()
        .eq("therapist_id", therapistId)
        .eq("date", date)
        .eq("hour", hour)
        .eq("note", "e2e");
    }
  });
});
