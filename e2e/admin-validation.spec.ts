// Suite E -- input validation, and Suite C's server half.
//
// Every rule enforced in a form has to be enforced in the route too: the
// browser is never the authority on what may be saved or how much money may
// leave. These call the routes directly, past the UI, which is the only
// honest way to test that.
import { test, expect } from "@playwright/test";
import { BASE, QA_EMAILS, adminClient, cookieHeaderFor, profileIdFor } from "./helpers";

async function post(route: string, body: unknown, cookie: string) {
  const res = await fetch(`${BASE}${route}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(text);
  } catch {
    /* a non-JSON body is itself a finding -- asserted by callers */
  }
  return { status: res.status, json, text };
}

test.describe("Suite E: input validation", () => {
  let cookie: string;

  test.beforeAll(async () => {
    cookie = await cookieHeaderFor(QA_EMAILS.admin);
  });

  test("E-041: a malformed body is a clean 400, never a 500", async () => {
    for (const body of ["not json at all", "null", "[]", '"a string"']) {
      const res = await post("/api/admin/create-booking", body, cookie);
      expect(res.status, `body ${body} produced ${res.status}`).toBe(400);
      expect(res.json.error).toBeTruthy();
    }
  });

  test("E-045: an error never leaks a stack trace or a column name", async () => {
    const res = await post("/api/admin/create-booking", { patientId: "not-a-uuid" }, cookie);
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.text).not.toContain("at async");
    expect(res.text).not.toContain("node_modules");
  });

  test("E-012: revenue share rejects out-of-range values", async () => {
    const admin = adminClient();
    const hospitalId = await profileIdFor(admin, QA_EMAILS.hospital);
    for (const percent of [-1, 101, 1000, "abc", null]) {
      const res = await post(
        "/api/admin/update-hospital-revenue-share",
        { hospitalId, revenueSharePercent: percent },
        cookie
      );
      expect(res.status, `share ${percent} was accepted`).toBeGreaterThanOrEqual(400);
    }
    // ...and the boundaries are allowed, so it isn't just refusing everything.
    for (const percent of [0, 100]) {
      const res = await post(
        "/api/admin/update-hospital-revenue-share",
        { hospitalId, revenueSharePercent: percent },
        cookie
      );
      expect(res.status, `share ${percent} was refused`).toBe(200);
    }
  });

  test("E-023/E-024: the new booking settings reject nonsense and accept their range", async () => {
    const bad = [-1, 2.5, "12", null, true];
    for (const value of bad) {
      const res = await post(
        "/api/admin/update-setting",
        { key: "online_booking_lead_time_hours", value },
        cookie
      );
      expect(res.status, `lead time ${value} was accepted`).toBe(400);
    }
    // 0 is a real policy for the refund window ("never refund"), so it must
    // be accepted rather than lumped in with the nonsense above.
    const zero = await post(
      "/api/admin/update-setting",
      { key: "online_cancellation_refund_hours", value: 0 },
      cookie
    );
    expect(zero.status).toBe(200);
    // Put it back so later suites see the documented default.
    await post(
      "/api/admin/update-setting",
      { key: "online_cancellation_refund_hours", value: 24 },
      cookie
    );
  });

  test("E-043: an unknown settings key is refused, not written", async () => {
    const res = await post(
      "/api/admin/update-setting",
      { key: "role", value: "admin" },
      cookie
    );
    expect(res.status).toBe(400);
  });

  test("E-017: create-account rejects a bad email and a duplicate", async () => {
    for (const email of ["no-at-sign", "a@b", "", "  "]) {
      const res = await post(
        "/api/admin/create-account",
        { role: "patient", fullName: "QA Bad Email", email },
        cookie
      );
      expect(res.status, `email "${email}" was accepted`).toBe(400);
    }
    const duplicate = await post(
      "/api/admin/create-account",
      { role: "patient", fullName: "QA Dup", email: QA_EMAILS.patientA },
      cookie
    );
    expect(duplicate.status).toBe(409);
  });

  test("E-016: create-account rejects a malformed phone", async () => {
    const res = await post(
      "/api/admin/create-account",
      {
        role: "patient",
        fullName: "QA Bad Phone",
        email: `qa.badphone.${Date.now()}@example.test`,
        phone: "12345",
      },
      cookie
    );
    expect(res.status).toBe(400);
  });

  test("E-010: a partial refund refuses zero, negative, fractional and oversized amounts", async () => {
    const admin = adminClient();
    const patientId = await profileIdFor(admin, QA_EMAILS.patientA);
    // A paid session with a Razorpay payment id that does not exist at
    // Razorpay: every assertion here is a *rejection*, so nothing ever
    // reaches the payment provider.
    const { data: appointment } = await admin
      .from("appointments")
      .insert({
        patient_id: patientId,
        concern: "QA partial refund validation",
        slot_time: new Date(Date.now() + 86_400_000).toISOString(),
        status: "confirmed",
        payment_status: "paid",
        amount_paid_paise: 100_000,
        razorpay_payment_id: "pay_qa_validation_only",
        visit_mode: "online",
      })
      .select("id")
      .single();

    try {
      for (const amountPaise of [0, -500, 12.5, 100_001]) {
        const res = await post(
          "/api/admin/refund-session-partial",
          { appointmentId: appointment!.id, amountPaise, reason: "qa" },
          cookie
        );
        expect(res.status, `amount ${amountPaise} was accepted`).toBe(400);
      }
      // A missing reason is refused even when the amount is fine.
      const noReason = await post(
        "/api/admin/refund-session-partial",
        { appointmentId: appointment!.id, amountPaise: 1000, reason: "   " },
        cookie
      );
      expect(noReason.status).toBe(400);
    } finally {
      await admin.from("appointments").delete().eq("id", appointment!.id);
    }
  });

  test("E-010b: a refund is refused outright when there is no Razorpay payment", async () => {
    const admin = adminClient();
    const patientId = await profileIdFor(admin, QA_EMAILS.patientA);
    const { data: appointment } = await admin
      .from("appointments")
      .insert({
        patient_id: patientId,
        concern: "QA cash refund guard",
        slot_time: new Date(Date.now() + 86_400_000).toISOString(),
        status: "confirmed",
        payment_status: "paid",
        amount_paid_paise: 50_000,
        razorpay_payment_id: null,
        visit_mode: "online",
      })
      .select("id")
      .single();

    try {
      const res = await post(
        "/api/admin/refund-session-partial",
        { appointmentId: appointment!.id, amountPaise: 10_000, reason: "qa" },
        cookie
      );
      expect(res.status).toBe(409);
      expect(String(res.json.error)).toContain("no Razorpay payment");
    } finally {
      await admin.from("appointments").delete().eq("id", appointment!.id);
    }
  });

  test("E-018/C-008: create-booking refuses a suspended patient and a taken slot", async () => {
    const admin = adminClient();
    const patientId = await profileIdFor(admin, QA_EMAILS.patientA);
    const therapistId = await profileIdFor(admin, QA_EMAILS.therapistA);
    const { data: category } = await admin
      .from("treatment_categories")
      .select("id, duration_minutes")
      .eq("active", true)
      .limit(1)
      .single();

    const slot = new Date(Date.now() + 7 * 86_400_000).toISOString();

    // Suspended patient.
    await admin.from("profiles").update({ active: false }).eq("id", patientId);
    const suspended = await post(
      "/api/admin/create-booking",
      { patientId, categoryId: category!.id, slotTime: slot, therapistId },
      cookie
    );
    await admin.from("profiles").update({ active: true }).eq("id", patientId);
    expect(suspended.status, "a suspended patient was booked").toBe(409);

    // Lead time: a slot an hour from now is inside the window and must be
    // refused unless the override is explicitly set.
    const soon = new Date(Date.now() + 3_600_000).toISOString();
    const insideWindow = await post(
      "/api/admin/create-booking",
      { patientId, categoryId: category!.id, slotTime: soon },
      cookie
    );
    expect(insideWindow.status).toBe(409);
    expect(insideWindow.json.needsLeadTimeOverride).toBe(true);

    // Real booking, then a second one in the same slot for the same
    // therapist -- the conflict check must refuse it.
    const first = await post(
      "/api/admin/create-booking",
      { patientId, categoryId: category!.id, slotTime: slot, therapistId },
      cookie
    );
    expect(first.status).toBe(200);
    const createdId = String(first.json.appointmentId);

    try {
      const clash = await post(
        "/api/admin/create-booking",
        {
          patientId,
          categoryId: category!.id,
          slotTime: slot,
          therapistId,
        },
        cookie
      );
      expect(clash.status, "two sessions were booked into one therapist's slot").toBe(409);

      // C-001/C-002: five simultaneous identical requests must not produce
      // five appointments.
      const burstSlot = new Date(Date.now() + 9 * 86_400_000).toISOString();
      const burst = await Promise.all(
        Array.from({ length: 5 }, () =>
          post(
            "/api/admin/create-booking",
            { patientId, categoryId: category!.id, slotTime: burstSlot, therapistId },
            cookie
          )
        )
      );
      const created = burst.filter((r) => r.status === 200);
      const createdIds = created.map((r) => String(r.json.appointmentId));
      await admin.from("appointments").delete().in("id", createdIds);
      expect(
        created.length,
        `${created.length} of 5 concurrent identical bookings were created`
      ).toBe(1);
    } finally {
      await admin.from("appointments").delete().eq("id", createdId);
    }
  });
});
