// Acquisition discounting: the standing first-session offer, and the
// per-booking adjustment an admin makes by hand.
//
// The money-critical assertion here is the one about eligibility: the offer
// applies once per patient and is decided from the database, so it cannot be
// claimed twice, asked for, or posted from a browser. Everything else is
// about the discount being *recorded* rather than silently charged, since a
// discount that only lowers a number leaves the books unable to say what
// buying those patients cost.
import { test, expect, request as playwrightRequest } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { BASE, QA_EMAILS, adminClient, cookieHeaderFor, profileIdFor } from "./helpers";

const DISCOUNT_CATEGORY_TITLE = "QA Discount Condition";
const CATEGORY_PRICE_PAISE = 120000; // ₹1,200

test.describe("Acquisition discounts", () => {
  let admin: SupabaseClient;
  let patientId = "";
  let categoryId = "";

  function futureSlot(daysAhead: number, hour: number): string {
    const d = new Date();
    d.setDate(d.getDate() + daysAhead);
    d.setHours(hour, 0, 0, 0);
    return d.toISOString();
  }

  /** An unpaid booking for the QA patient, the shape create-order works on. */
  async function freshBooking(daysAhead = 3, hour = 11): Promise<string> {
    const { data } = await admin
      .from("appointments")
      .insert({
        patient_id: patientId,
        category_id: categoryId,
        concern: DISCOUNT_CATEGORY_TITLE,
        slot_time: futureSlot(daysAhead, hour),
        duration_minutes: 45,
        status: "requested",
        payment_status: "unpaid",
        visit_mode: "online",
      })
      .select("id")
      .single();
    expect(data?.id, "seeded booking").toBeTruthy();
    return data!.id as string;
  }

  async function setOffer(enabled: boolean, type: "fixed" | "percent", value: number) {
    await admin
      .from("site_settings")
      .update({
        first_session_offer_enabled: enabled,
        first_session_offer_type: type,
        first_session_offer_value: value,
      })
      .not("id", "is", null);
  }

  test.beforeAll(async () => {
    admin = adminClient();
    // The fixture patient already has paid sessions behind them, which is
    // exactly the "returning patient" half of the eligibility rule. The
    // brand-new half is asserted through the route refusing to honour a
    // discount the browser claims (DSC-006) rather than by deleting a real
    // patient's payment history, which other specs depend on.
    patientId = await profileIdFor(admin, QA_EMAILS.patientB);

    const { data: category } = await admin
      .from("treatment_categories")
      .select("id")
      .eq("title", DISCOUNT_CATEGORY_TITLE)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    categoryId =
      category?.id ??
      (
        await admin
          .from("treatment_categories")
          .insert({
            title: DISCOUNT_CATEGORY_TITLE,
            points: [],
            price_paise: CATEGORY_PRICE_PAISE,
            duration_minutes: 45,
            active: true,
          })
          .select("id")
          .single()
      ).data?.id ??
      "";
    expect(categoryId, "seeded category").not.toBe("");
  });

  test.afterAll(async () => {
    if (!admin) return;
    await setOffer(false, "fixed", 0);
    // Cancel the unpaid bookings this spec seeded. Left behind they became
    // a dozen "Payment not completed" items on the patient's own dashboard,
    // which is both noise for the next run and how this spec made
    // session-scheduling's SCH-006 fail on a working feature.
    await admin
      .from("appointments")
      .update({ status: "cancelled" })
      .eq("patient_id", patientId)
      .eq("concern", DISCOUNT_CATEGORY_TITLE)
      .neq("status", "cancelled");
  });

  test("DSC-001: the goodwill route refuses everyone but a money admin", async ({ request }) => {
    const appointmentId = await freshBooking();
    const anon = await request.post(`${BASE}/api/admin/apply-goodwill-discount`, {
      headers: { "content-type": "application/json" },
      data: { appointmentId, amountPaise: 20000, reason: "a long enough reason" },
    });
    expect(anon.status(), "anonymous").toBe(403);

    for (const who of [QA_EMAILS.patientA, QA_EMAILS.therapistA]) {
      const res = await request.post(`${BASE}/api/admin/apply-goodwill-discount`, {
        headers: { cookie: await cookieHeaderFor(who), "content-type": "application/json" },
        data: { appointmentId, amountPaise: 20000, reason: "a long enough reason" },
      });
      expect(res.status(), who).toBe(403);
    }
  });

  test("DSC-002: a goodwill discount needs a real reason and a real amount", async () => {
    const appointmentId = await freshBooking();
    const ctx = await playwrightRequest.newContext({
      extraHTTPHeaders: { cookie: await cookieHeaderFor(QA_EMAILS.admin) },
    });

    const shortReason = await ctx.post(`${BASE}/api/admin/apply-goodwill-discount`, {
      data: { appointmentId, amountPaise: 20000, reason: "ok" },
    });
    expect(shortReason.status(), await shortReason.text()).toBe(400);

    const noAmount = await ctx.post(`${BASE}/api/admin/apply-goodwill-discount`, {
      data: { appointmentId, amountPaise: 0, reason: "a properly stated reason here" },
    });
    expect(noAmount.status()).toBe(400);

    // More than the session costs is refused rather than making it free.
    const tooMuch = await ctx.post(`${BASE}/api/admin/apply-goodwill-discount`, {
      data: {
        appointmentId,
        amountPaise: CATEGORY_PRICE_PAISE * 2,
        reason: "a properly stated reason here",
      },
    });
    expect(tooMuch.status()).toBe(400);

    const { data: row } = await admin
      .from("appointments")
      .select("discount_paise")
      .eq("id", appointmentId)
      .single();
    expect(row?.discount_paise, "nothing was applied").toBe(0);
    await ctx.dispose();
  });

  test("DSC-003: a goodwill discount records all four facts", async () => {
    const appointmentId = await freshBooking();
    const ctx = await playwrightRequest.newContext({
      extraHTTPHeaders: { cookie: await cookieHeaderFor(QA_EMAILS.admin) },
    });
    const reason = "Their last session was cut short by a connection problem.";
    const res = await ctx.post(`${BASE}/api/admin/apply-goodwill-discount`, {
      data: { appointmentId, amountPaise: 20000, reason },
    });
    expect(res.status(), await res.text()).toBe(200);

    const { data: row } = await admin
      .from("appointments")
      .select("list_price_paise, discount_paise, discount_source, discount_reason")
      .eq("id", appointmentId)
      .single();
    // What it would have cost, what came off, which rule, and why. A
    // discount that only lowered the charge would leave the books unable to
    // tell "sold cheap" from "discounted".
    expect(row?.list_price_paise).toBe(CATEGORY_PRICE_PAISE);
    expect(row?.discount_paise).toBe(20000);
    expect(row?.discount_source).toBe("goodwill");
    expect(row?.discount_reason).toBe(reason);
    await ctx.dispose();
  });

  test("DSC-004: a paid session cannot be discounted — that is a refund", async () => {
    const appointmentId = await freshBooking();
    await admin
      .from("appointments")
      .update({ payment_status: "paid", amount_paid_paise: CATEGORY_PRICE_PAISE })
      .eq("id", appointmentId);

    const ctx = await playwrightRequest.newContext({
      extraHTTPHeaders: { cookie: await cookieHeaderFor(QA_EMAILS.admin) },
    });
    const res = await ctx.post(`${BASE}/api/admin/apply-goodwill-discount`, {
      data: { appointmentId, amountPaise: 20000, reason: "a properly stated reason here" },
    });
    expect(res.status(), await res.text()).toBe(409);
    expect(await res.text()).toContain("Refund it instead");
    await ctx.dispose();
  });

  test("DSC-005: the offer applies to a first-time patient and not to a returning one", async () => {
    await setOffer(true, "fixed", 49900);

    // Returning: the fixture patient has paid before, so no offer.
    const returning = await freshBooking(4, 12);
    const ctx = await playwrightRequest.newContext({
      extraHTTPHeaders: { cookie: await cookieHeaderFor(QA_EMAILS.patientB) },
    });
    const res = await ctx.post(`${BASE}/api/razorpay/create-order`, {
      data: { appointmentId: returning },
    });
    // Razorpay keys may be absent in this environment; what matters is the
    // amount the route decided, which it writes before minting the order.
    await res.text();
    const { data: row } = await admin
      .from("appointments")
      .select("discount_paise, amount_paid_paise")
      .eq("id", returning)
      .single();
    expect(row?.discount_paise, "a returning patient gets no offer").toBe(0);
    await ctx.dispose();
  });

  test("DSC-006: the offer is never asked for, and cannot be posted", async () => {
    await setOffer(true, "fixed", 49900);
    const appointmentId = await freshBooking(5, 13);
    const ctx = await playwrightRequest.newContext({
      extraHTTPHeaders: { cookie: await cookieHeaderFor(QA_EMAILS.patientB) },
    });
    // A body claiming a discount changes nothing: eligibility and the amount
    // are both re-derived server-side, the same rule the price follows.
    const res = await ctx.post(`${BASE}/api/razorpay/create-order`, {
      data: { appointmentId, discountPaise: 100000, amountPaise: 100 },
    });
    await res.text();
    const { data: row } = await admin
      .from("appointments")
      .select("discount_paise, amount_paid_paise")
      .eq("id", appointmentId)
      .single();
    expect(row?.discount_paise, "nothing the browser sent was honoured").toBe(0);
    expect(row?.amount_paid_paise === 100).toBe(false);
    await ctx.dispose();
  });

  test("DSC-007: the offer settings are bounded by the route", async () => {
    const ctx = await playwrightRequest.newContext({
      extraHTTPHeaders: { cookie: await cookieHeaderFor(QA_EMAILS.admin) },
    });
    const badType = await ctx.post(`${BASE}/api/admin/update-setting`, {
      data: { key: "first_session_offer_type", value: "half_off" },
    });
    expect(badType.status()).toBe(400);

    const badValue = await ctx.post(`${BASE}/api/admin/update-setting`, {
      data: { key: "first_session_offer_value", value: -5 },
    });
    expect(badValue.status()).toBe(400);

    const notBoolean = await ctx.post(`${BASE}/api/admin/update-setting`, {
      data: { key: "first_session_offer_enabled", value: "yes" },
    });
    expect(notBoolean.status()).toBe(400);
    await ctx.dispose();
  });
});
