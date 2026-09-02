// What happens after a patient pays for a recommended programme.
//
// The money is the easy half and it was already covered. This is the half
// that was silently costing the clinic delivered treatment: a patient can
// pay and then never book, in which case the clinic has been paid for care
// it will not give. So these tests are about the credits actually turning
// into appointments -- the proposal the scheduler opens with, the rules the
// server re-checks underneath it, and the nudge that keeps asking.
import { test, expect, request as playwrightRequest } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  BASE,
  QA_EMAILS,
  adminClient,
  browserCookiesFor,
  cookieHeaderFor,
  profileIdFor,
} from "./helpers";

const SCHEDULE_CATEGORY_TITLE = "QA Scheduling Condition";
const SCHEDULE_PACKAGE_TITLE = "QA Scheduling Programme";

test.describe("Booking the sessions a patient paid for", () => {
  let admin: SupabaseClient;
  let patientId = "";
  let categoryId = "";
  let packageId = "";
  let purchaseId = "";

  /** A slot a comfortable distance past the 12-hour lead time. */
  function futureSlot(daysAhead: number, hour: number): string {
    const d = new Date();
    d.setDate(d.getDate() + daysAhead);
    d.setHours(hour, 0, 0, 0);
    return d.toISOString();
  }

  test.beforeAll(async () => {
    admin = adminClient();
    patientId = await profileIdFor(admin, QA_EMAILS.patientB);

    // Found-or-created, like the care-plan fixtures: an entitlement or a
    // booked appointment pointing at any of these makes it undeletable, so
    // a cleanup would fail quietly and the next run would collide with its
    // own leftovers.
    const { data: category } = await admin
      .from("treatment_categories")
      .select("id")
      .eq("title", SCHEDULE_CATEGORY_TITLE)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    categoryId =
      category?.id ??
      (
        await admin
          .from("treatment_categories")
          .insert({
            title: SCHEDULE_CATEGORY_TITLE,
            points: [],
            price_paise: 120000,
            duration_minutes: 45,
            active: true,
          })
          .select("id")
          .single()
      ).data?.id ??
      "";

    const { data: pkg } = await admin
      .from("treatment_category_packages")
      .select("id")
      .eq("title", SCHEDULE_PACKAGE_TITLE)
      .eq("category_id", categoryId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    packageId =
      pkg?.id ??
      (
        await admin
          .from("treatment_category_packages")
          .insert({
            category_id: categoryId,
            title: SCHEDULE_PACKAGE_TITLE,
            session_count: 5,
            price_paise: 500000,
            // The two rules the proposal has to respect and the server
            // re-checks: 48 hours apart, at most two in a calendar week.
            min_gap_hours: 48,
            max_sessions_per_week: 2,
            validity_days: 120,
            active: true,
            recommendable: true,
            therapist_locked: true,
          })
          .select("id")
          .single()
      ).data?.id ??
      "";

    expect(categoryId, "seeded category").not.toBe("");
    expect(packageId, "seeded package").not.toBe("");
  });

  /** A fresh paid purchase of 5 sessions, with nothing booked against it. */
  async function freshPurchase(): Promise<string> {
    const { data } = await admin
      .from("patient_package_purchases")
      .insert({
        patient_id: patientId,
        package_id: packageId,
        category_id: categoryId,
        session_count: 5,
        sessions_used: 0,
        amount_paid_paise: 500000,
        payment_status: "paid",
        status: "active",
        paid_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 120 * 86_400_000).toISOString(),
      })
      .select("id")
      .single();
    expect(data?.id, "seeded purchase").toBeTruthy();
    return data!.id as string;
  }

  /** Cancels everything booked against a purchase and returns its credits,
   *  so each test starts from five unspent sessions. */
  async function resetPurchase(id: string) {
    await admin
      .from("appointments")
      .update({ status: "cancelled" })
      .eq("package_purchase_id", id)
      .neq("status", "cancelled");
    await admin.from("patient_package_purchases").update({ sessions_used: 0 }).eq("id", id);
  }

  test.beforeEach(async () => {
    purchaseId = await freshPurchase();
  });

  test("SCH-001: five sessions book in one request", async () => {
    const ctx = await playwrightRequest.newContext({
      extraHTTPHeaders: { cookie: await cookieHeaderFor(QA_EMAILS.patientB) },
    });
    // Spaced 3 days apart across three calendar weeks, so neither the
    // 48-hour gap nor the two-a-week cap is in the way.
    const slots = [
      { slotDateTime: futureSlot(2, 10) },
      { slotDateTime: futureSlot(5, 10) },
      { slotDateTime: futureSlot(9, 10) },
      { slotDateTime: futureSlot(12, 10) },
      { slotDateTime: futureSlot(16, 10) },
    ];
    const res = await ctx.post(`${BASE}/api/appointments/book-package-sessions`, {
      data: { packagePurchaseId: purchaseId, slots },
    });
    expect(res.status(), await res.text()).toBe(200);
    const body = await res.json();
    expect(body.results.filter((r: { success: boolean }) => r.success).length).toBe(5);

    const { data: purchase } = await admin
      .from("patient_package_purchases")
      .select("sessions_used")
      .eq("id", purchaseId)
      .single();
    expect(purchase?.sessions_used, "every session is claimed").toBe(5);

    await resetPurchase(purchaseId);
    await ctx.dispose();
  });

  test("SCH-002: the programme's own rules are enforced server-side", async () => {
    // The proposal in the browser respects these too, but the browser is
    // not what makes them true. A patient posting their own payload has to
    // meet the same rules.
    const ctx = await playwrightRequest.newContext({
      extraHTTPHeaders: { cookie: await cookieHeaderFor(QA_EMAILS.patientB) },
    });
    const res = await ctx.post(`${BASE}/api/appointments/book-package-sessions`, {
      data: {
        packagePurchaseId: purchaseId,
        slots: [
          { slotDateTime: futureSlot(2, 10) },
          // 24 hours later: inside the programme's 48-hour minimum gap.
          { slotDateTime: futureSlot(3, 10) },
          // Same calendar week as the first, which is already at the cap
          // once the second is refused.
          { slotDateTime: futureSlot(4, 10) },
        ],
      },
    });
    expect(res.status(), await res.text()).toBe(200);
    const body = await res.json();
    const failures = body.results.filter((r: { success: boolean }) => !r.success);
    expect(failures.length, "the too-close slot is refused").toBeGreaterThan(0);
    expect(
      failures.some((f: { error?: string }) => /gap/i.test(f.error ?? "")),
      "and the refusal says why"
    ).toBe(true);

    // Partial success is the point: the slots that were fine are booked,
    // and only the ones that clashed come back for another try.
    const booked = body.results.filter((r: { success: boolean }) => r.success).length;
    const { data: purchase } = await admin
      .from("patient_package_purchases")
      .select("sessions_used")
      .eq("id", purchaseId)
      .single();
    expect(purchase?.sessions_used, "only what was booked is spent").toBe(booked);

    await resetPurchase(purchaseId);
    await ctx.dispose();
  });

  test("SCH-003: a slot inside the lead time is refused outright", async () => {
    const ctx = await playwrightRequest.newContext({
      extraHTTPHeaders: { cookie: await cookieHeaderFor(QA_EMAILS.patientB) },
    });
    const inTwoHours = new Date(Date.now() + 2 * 3_600_000).toISOString();
    const res = await ctx.post(`${BASE}/api/appointments/book-package-sessions`, {
      data: { packagePurchaseId: purchaseId, slots: [{ slotDateTime: inTwoHours }] },
    });
    const body = await res.json().catch(() => ({}));
    const refused =
      res.status() >= 400 ||
      (body.results ?? []).every((r: { success: boolean }) => !r.success);
    expect(refused, "nothing books inside the 12-hour lead time").toBe(true);

    await resetPurchase(purchaseId);
    await ctx.dispose();
  });

  test("SCH-004: a patient cannot schedule against someone else's programme", async () => {
    const ctx = await playwrightRequest.newContext({
      extraHTTPHeaders: { cookie: await cookieHeaderFor(QA_EMAILS.patientA) },
    });
    const res = await ctx.post(`${BASE}/api/appointments/book-package-sessions`, {
      data: {
        packagePurchaseId: purchaseId,
        slots: [{ slotDateTime: futureSlot(3, 11) }],
      },
    });
    expect(res.status(), "another patient's purchase is not found for them").toBe(404);

    const { data: purchase } = await admin
      .from("patient_package_purchases")
      .select("sessions_used")
      .eq("id", purchaseId)
      .single();
    expect(purchase?.sessions_used, "and nothing was spent").toBe(0);
    await ctx.dispose();
  });

  test("SCH-005: sessions cannot be booked past the programme's expiry", async () => {
    await admin
      .from("patient_package_purchases")
      .update({ expires_at: new Date(Date.now() + 3 * 86_400_000).toISOString() })
      .eq("id", purchaseId);

    const ctx = await playwrightRequest.newContext({
      extraHTTPHeaders: { cookie: await cookieHeaderFor(QA_EMAILS.patientB) },
    });
    const res = await ctx.post(`${BASE}/api/appointments/book-package-sessions`, {
      data: {
        packagePurchaseId: purchaseId,
        slots: [{ slotDateTime: futureSlot(30, 10) }],
      },
    });
    const body = await res.json().catch(() => ({}));
    const refused =
      res.status() >= 400 ||
      (body.results ?? []).every((r: { success: boolean }) => !r.success);
    expect(refused, "a slot past the validity is refused").toBe(true);

    await resetPurchase(purchaseId);
    await ctx.dispose();
  });

  test("SCH-006: the dashboard keeps asking until the sessions are in the diary", async ({
    browser,
  }) => {
    // The nudge is the whole reason this flow does not quietly lose people:
    // paying is done, and the only thing between the patient and their
    // treatment is a calendar step on a screen they have to think to visit.
    const ctx = await browser.newContext();
    await ctx.addCookies(await browserCookiesFor(QA_EMAILS.patientB));
    const page = await ctx.newPage();

    await page.goto(`${BASE}/patient/dashboard`);
    await expect(page.getByText(/still to book/i).first()).toBeVisible({ timeout: 30_000 });

    await ctx.close();
  });
});
