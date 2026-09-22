import { test, expect } from "@playwright/test";
import {
  buildCalendarMonth,
  bookableHoursForDate,
  leadTimeMsFromHours,
  BOOKING_LEAD_TIME_MS,
} from "../src/lib/bookingSlots";
import {
  adminClient,
  cookieHeaderFor,
  profileIdFor,
  QA_EMAILS,
  BASE,
  wholeHourFromNow,
  E2E_MARKERS,
  deleteHomeVisitFixturePurchases,
  browserCookiesFor,
} from "./helpers";

test.describe("home-visit lead time (regression for the bulk scheduler bug)", () => {
  // HomeVisitBulkScheduler.tsx used to call these helpers with no
  // leadTimeMs argument, silently falling back to the online session's
  // fixed 12h default instead of the admin-configured home-visit lead
  // time -- confirmed live via the picker offering a same-day slot only
  // ~12.5h out when home_visit_lead_time_hours was set to 24. These are
  // pure functions, so the regression is pinned here without needing a
  // browser or a server.
  test("a slot inside the online 12h window but outside a 24h home-visit window is excluded", () => {
    const now = new Date();
    now.setMinutes(0, 0, 0);
    const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
      now.getDate()
    ).padStart(2, "0")}`;
    const hour16FromNow = new Date(now.getTime() + 16 * 3_600_000).getHours();

    const homeVisitLeadTimeMs = leadTimeMsFromHours(24);
    const onlineHours = bookableHoursForDate(todayKey, now.getTime(), BOOKING_LEAD_TIME_MS);
    const homeVisitHours = bookableHoursForDate(todayKey, now.getTime(), homeVisitLeadTimeMs);

    // Sixteen hours out clears the online 12h lead time but not a 24h
    // home-visit one -- this is exactly the gap the bug let through.
    if (onlineHours.includes(hour16FromNow)) {
      expect(homeVisitHours, "a 16h-out slot must not be offered under a 24h home-visit lead time").not.toContain(
        hour16FromNow
      );
    }
  });

  test("buildCalendarMonth respects a passed-in leadTimeMs for same-day bookability", () => {
    const now = new Date();
    const calendarDefault = buildCalendarMonth(now.getFullYear(), now.getMonth(), now.getTime());
    const calendar48h = buildCalendarMonth(
      now.getFullYear(),
      now.getMonth(),
      now.getTime(),
      leadTimeMsFromHours(48)
    );
    const todayCellDefault = calendarDefault.cells.find((c) => c?.isToday);
    const todayCell48h = calendar48h.cells.find((c) => c?.isToday);
    // Today can only be bookable at all under the shorter default lead
    // time -- a 48h requirement can never clear "today" by definition, so
    // if the longer lead time still reports today as bookable, the
    // parameter was silently ignored.
    if (todayCellDefault?.bookable) {
      expect(todayCell48h?.bookable, "today must not be bookable once a 48h lead time is actually applied").toBe(
        false
      );
    }
  });
});

test.describe("home-visit area gating", () => {
  test("create-order rejects a pincode with no serviceable area, even for a signed-in patient", async () => {
    const admin = adminClient();
    const { data: pkg } = await admin
      .from("home_visit_packages")
      .select("id")
      .eq("title", "Single Home Visit")
      .single();
    const patientCookie = await cookieHeaderFor(QA_EMAILS.patientA);

    const res = await fetch(`${BASE}/api/home-visit/create-order`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: patientCookie },
      body: JSON.stringify({
        packageId: pkg!.id,
        address: { line1: "1 Nowhere Serviceable Street", pincode: "999999" },
      }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/don't currently visit|valid 6-digit pincode/i);
  });
});

test.describe("home-visit bulk scheduling limits", () => {
  // Registered as they are created and removed when this file finishes, so
  // a failed assertion still cleans up. A purchase written straight into the
  // database outlives the run otherwise, and Settings -> System Health reads
  // it as a real programme for ever. See E2E_MARKERS in helpers.ts.
  const fixturePurchaseIds: string[] = [];
  const fixtureAddressIds: string[] = [];

  test.afterAll(async () => {
    const admin = adminClient();
    await deleteHomeVisitFixturePurchases(admin, fixturePurchaseIds.splice(0));
    // Addresses go last: the purchase's default_address_id points at one and
    // carries no ON DELETE behaviour.
    const addressIds = fixtureAddressIds.splice(0);
    if (addressIds.length > 0) {
      await admin.from("patient_addresses").delete().in("id", addressIds);
    }
  });

  test("a batch larger than the admin-configured max is rejected outright, not partially fulfilled", async () => {
    const admin = adminClient();
    const patientId = await profileIdFor(admin, QA_EMAILS.patientB);
    const patientCookie = await cookieHeaderFor(QA_EMAILS.patientB);

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
    const { data: settingsRow } = await admin
      .from("site_settings")
      .select("home_visit_bulk_schedule_max")
      .maybeSingle();
    const bulkMax = settingsRow?.home_visit_bulk_schedule_max ?? 8;

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
    fixtureAddressIds.push(address!.id);

    const { data: purchase } = await admin
      .from("home_visit_package_purchases")
      .insert({
        patient_id: patientId,
        package_id: pkg!.id,
        visit_count: bulkMax + 5,
        visits_used: 0,
        travel_fee_paise: area!.travel_fee_paise,
        payment_mode: "prepaid",
        payment_status: "paid",
        status: "active",
        default_address_id: address!.id,
        expires_at: new Date(Date.now() + 60 * 86400000).toISOString(),
      })
      .select("id")
      .single();
    fixturePurchaseIds.push(purchase!.id);

    // One more slot than allowed -- every slot spaced a week apart so the
    // package's own min-gap/max-per-week rules (if configured) can't be
    // the thing rejecting it; this test is purely about the bulk-count cap.
    const slots = Array.from({ length: bulkMax + 1 }, (_, i) => ({
      slotDateTime: wholeHourFromNow(2000 + i * 200),
    }));

    const res = await fetch(`${BASE}/api/home-visit/book-visits`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: patientCookie },
      body: JSON.stringify({ homeVisitPurchaseId: purchase!.id, slots }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/at most \d+ visit/i);

    const { data: booked } = await admin
      .from("appointments")
      .select("id")
      .eq("home_visit_purchase_id", purchase!.id);
    expect(booked ?? [], "an over-limit batch must be rejected wholesale, not partially booked").toHaveLength(0);
  });
});

test.describe("online single-session booking (/api/appointments/create)", () => {
  // The wizard's pre-payment insert used to be a direct client-side insert
  // into appointments, validated only by the appointments_insert_own RLS
  // policy. A live database one schema.sql change behind the code failed it
  // outright -- in production, the policy still requiring approved = true
  // meant every self-signup patient's first booking died at the last step of
  // checkout showing the raw "new row violates row-level security policy"
  // string. These pin the rules the server route now owns instead.
  async function bookOnline(cookie: string, body: Record<string, unknown>) {
    return fetch(`${BASE}/api/appointments/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify(body),
    });
  }

  test("an unapproved (but active) patient can create their pre-payment booking", async () => {
    const admin = adminClient();
    const patientId = await profileIdFor(admin, QA_EMAILS.patientB);
    const cookie = await cookieHeaderFor(QA_EMAILS.patientB);
    const { data: category } = await admin
      .from("treatment_categories")
      .select("id, title, duration_minutes")
      .eq("active", true)
      .limit(1)
      .single();

    // Exactly the state a patient who just signed up in the wizard is in.
    await admin.from("profiles").update({ approved: false }).eq("id", patientId);
    let createdId: string | undefined;
    try {
      const res = await bookOnline(cookie, {
        categoryId: category!.id,
        slotTime: wholeHourFromNow(72),
        timezone: "Asia/Kolkata",
        notes: "e2e unapproved booking",
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      createdId = body.appointmentId;
      expect(createdId).toBeTruthy();

      const { data: row } = await admin
        .from("appointments")
        .select("status, payment_status, therapist_id, visit_mode, duration_minutes, concern")
        .eq("id", createdId!)
        .single();
      // Unpaid, unassigned and queued: the row grants nothing on its own,
      // which is why letting an unapproved patient create it is safe.
      expect(row!.status).toBe("requested");
      expect(row!.payment_status).toBe("unpaid");
      expect(row!.therapist_id).toBeNull();
      expect(row!.visit_mode).toBe("online");
      // Re-derived from the category row, never from the request body --
      // /book is ISR-cached, so the browser's copy of the catalogue can be
      // older than the one being scheduled against.
      expect(row!.duration_minutes).toBe(category!.duration_minutes);
      expect(row!.concern).toBe(category!.title);
    } finally {
      if (createdId) await admin.from("appointments").delete().eq("id", createdId);
      await admin.from("profiles").update({ approved: true }).eq("id", patientId);
    }
  });

  test("a slot inside the configured lead-time window is rejected, and nothing is written", async () => {
    const admin = adminClient();
    const patientId = await profileIdFor(admin, QA_EMAILS.patientA);
    const cookie = await cookieHeaderFor(QA_EMAILS.patientA);
    const { data: category } = await admin
      .from("treatment_categories")
      .select("id")
      .eq("active", true)
      .limit(1)
      .single();

    const { count: before } = await admin
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("patient_id", patientId);

    const res = await bookOnline(cookie, {
      categoryId: category!.id,
      slotTime: wholeHourFromNow(1),
      timezone: "Asia/Kolkata",
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/hours from now/i);

    const { count: after } = await admin
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("patient_id", patientId);
    expect(after).toBe(before);
  });

  test("the browser cannot name its own therapist, price or paid status", async () => {
    const admin = adminClient();
    const cookie = await cookieHeaderFor(QA_EMAILS.patientA);
    const therapistId = await profileIdFor(admin, QA_EMAILS.therapistA);
    const { data: category } = await admin
      .from("treatment_categories")
      .select("id, duration_minutes")
      .eq("active", true)
      .limit(1)
      .single();

    let createdId: string | undefined;
    try {
      const res = await bookOnline(cookie, {
        categoryId: category!.id,
        slotTime: wholeHourFromNow(96),
        timezone: "Asia/Kolkata",
        // None of these are fields the route reads -- an insert built from
        // the body would happily have taken them.
        therapist_id: therapistId,
        status: "confirmed",
        payment_status: "paid",
        amount_paid_paise: 1,
        duration_minutes: 5,
        visit_mode: "home_visit",
      });
      expect(res.status).toBe(200);
      createdId = (await res.json()).appointmentId;

      const { data: row } = await admin
        .from("appointments")
        .select("status, payment_status, therapist_id, amount_paid_paise, duration_minutes, visit_mode")
        .eq("id", createdId!)
        .single();
      expect(row!.status).toBe("requested");
      expect(row!.payment_status).toBe("unpaid");
      expect(row!.therapist_id).toBeNull();
      expect(row!.amount_paid_paise).toBeNull();
      expect(row!.duration_minutes).toBe(category!.duration_minutes);
      expect(row!.visit_mode).toBe("online");
    } finally {
      if (createdId) await admin.from("appointments").delete().eq("id", createdId);
    }
  });
});

/**
 * The cancellation notice on Step 3 -- the one line on this screen a patient
 * reads as a promise about their money.
 *
 * It had no guard at all. `e2e/pay-later.spec.ts` PL-UI-003 asserts the
 * *pay-later* branch and, beside it, that the page carries no `\d+hours`
 * collapse -- but that branch quotes no number, so the assertion could never
 * have failed there and the branch every ordinary patient sees was pinned by
 * nothing. Three regressions are invisible to every other test in this repo
 * and all three have happened or nearly happened:
 *
 *  1. The sentence rendered as "within 24hours of the slot", because a JSX
 *     text node carrying an entity loses its leading space when it wraps.
 *     `src/lib/jsxEntitySpacing.test.ts` now catches that shape in the
 *     source; this catches it in the pixels, which is where it was found.
 *  2. The number came from the `CANCELLATION_FULL_REFUND_HOURS` constant
 *     rather than `online_cancellation_refund_hours`, so a clinic that
 *     changed its window had the old one quoted back at every patient. That
 *     is the same defect AGENTS.md records for the patient card's no-refund
 *     hover, one screen over.
 *  3. The sentence claimed free cancellation to patients whose booking was
 *     already inside the window -- see below.
 *
 * It drives the browser rather than the route deliberately: none of the
 * three produces an error, a failed request or a wrong row.
 */
test.describe("the cancellation notice a patient is shown before paying", () => {
  const SHOTS = "e2e/screenshots/booking-rules";

  /** Sign in and walk an ordinary prepaid patient to Step 3. */
  async function reachStepThree(page: import("@playwright/test").Page) {
    const cookies = await browserCookiesFor(QA_EMAILS.patientA);
    await page.context().clearCookies();
    await page.context().addCookies(cookies);
    await page.goto(`${BASE}/book`);
    await page.waitForLoadState("networkidle");

    // Step 1 opens with a bookable day and hour already chosen.
    await page.getByRole("button", { name: /Continue to Medical Details/i }).click();
    await page.waitForTimeout(1200);

    const concern = page.locator("select").filter({
      has: page.locator("option", { hasText: /Select what you need help with/i }),
    });
    await concern.selectOption({ index: 1 });
    await page.getByRole("checkbox").first().check();
    await page.waitForTimeout(300);

    await page.getByRole("button", { name: /Review Booking/i }).click();
    // The quote is a server round trip, and on a cold dev server the route
    // compiles the first time it is called.
    await expect(page.getByText(/Free cancellation|so cancelling it isn't refunded/i)).toBeVisible({
      timeout: 30_000,
    });
    return (await page.textContent("body")) ?? "";
  }

  test.beforeAll(async () => {
    // A prepaid patient, explicitly. If Patient A were ever left on terms by
    // another run this whole block would assert the pay-later sentence and
    // fail describing a working product -- the exact trap PL-UI-003 fell into
    // the other way round.
    const admin = adminClient();
    await admin
      .from("profiles")
      .update({ pay_later_enabled: false })
      .eq("email", QA_EMAILS.patientA);
  });

  test("BR-CANCEL-001 it names a real deadline, in words, with its spaces intact", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const admin = adminClient();
    const { data: before } = await admin
      .from("site_settings")
      .select("online_cancellation_refund_hours")
      .maybeSingle();

    // 6 hours, so that every slot the picker can offer (12h lead time at the
    // least) is comfortably outside the window and the notice is the
    // deadline one. Anything longer and a same-day slot would legitimately
    // produce the "already inside" sentence instead, making this test's
    // subject depend on what hour it is run at.
    await admin.from("site_settings").update({ online_cancellation_refund_hours: 6 }).eq("id", true);
    try {
      const body = await reachStepThree(page);
      await page.screenshot({ path: `${SHOTS}/cancel-notice-deadline.png`, fullPage: true });

      expect(body).toContain("Free cancellation until");
      // A date, not a rule -- a deadline the patient cannot read off the
      // screen is exactly the thing this replaced. The month is 3-5 letters
      // because `en-IN` renders September as "Sept", which is one more than
      // formatDateTime's own doc comment implies: assert the shape, not a
      // spelling Intl owns.
      expect(body).toMatch(/Free cancellation until \d{1,2} \w{3,5} \d{4}, \d{1,2}:\d{2}\s?[ap]m/i);
      // The regression that was found by cropping a screenshot: a number and
      // its unit fused into one word.
      expect(body).not.toMatch(/\d+(hours|hour|minutes|days)\b/);
      // And the pay-later wording must not leak onto a prepaid checkout.
      expect(body).not.toContain("you won't owe anything for it");
    } finally {
      await admin
        .from("site_settings")
        .update({
          online_cancellation_refund_hours: before?.online_cancellation_refund_hours ?? 24,
        })
        .eq("id", true);
    }
  });

  test("BR-CANCEL-002 the window is the clinic's setting, not the built-in constant", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const admin = adminClient();
    const { data: before } = await admin
      .from("site_settings")
      .select("online_cancellation_refund_hours")
      .maybeSingle();

    // 720 hours -- 30 days. Deliberately far larger than any slot the picker
    // offers, so every booking is inside the window and the notice has to
    // quote the clinic's own number. CANCELLATION_FULL_REFUND_HOURS is 24, so
    // a screen still reading the constant renders a deadline instead and
    // fails here rather than passing on the default by coincidence.
    await admin
      .from("site_settings")
      .update({ online_cancellation_refund_hours: 720 })
      .eq("id", true);
    try {
      const body = await reachStepThree(page);
      await page.screenshot({ path: `${SHOTS}/cancel-notice-inside-window.png`, fullPage: true });

      expect(body).toContain("This slot is less than 720 hours away");
      expect(body).toContain("isn't refunded");
      // The point of the sentence: it tells them while they can still do
      // something about it.
      expect(body).toContain("Pick a later slot");
      expect(body).not.toContain("Free cancellation");
      expect(body).not.toMatch(/\d+(hours|hour|minutes|days)\b/);
    } finally {
      await admin
        .from("site_settings")
        .update({
          online_cancellation_refund_hours: before?.online_cancellation_refund_hours ?? 24,
        })
        .eq("id", true);
    }
  });
});
