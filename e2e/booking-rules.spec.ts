import { test, expect } from "@playwright/test";
import {
  buildCalendarMonth,
  bookableHoursForDate,
  leadTimeMsFromHours,
  BOOKING_LEAD_TIME_MS,
} from "../src/lib/bookingSlots";
import { adminClient, cookieHeaderFor, profileIdFor, QA_EMAILS, BASE } from "./helpers";

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
        line1: "E2E Bulk Limit Test Address",
        pincode: "600017",
        area_id: area!.id,
        is_default: false,
      })
      .select("id")
      .single();

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

    // One more slot than allowed -- every slot spaced a week apart so the
    // package's own min-gap/max-per-week rules (if configured) can't be
    // the thing rejecting it; this test is purely about the bulk-count cap.
    const slots = Array.from({ length: bulkMax + 1 }, (_, i) => ({
      slotDateTime: new Date(Date.now() + (2000 + i * 200) * 3_600_000).toISOString(),
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
        slotTime: new Date(Date.now() + 72 * 3_600_000).toISOString(),
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
      slotTime: new Date(Date.now() + 3_600_000).toISOString(),
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
        slotTime: new Date(Date.now() + 96 * 3_600_000).toISOString(),
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
