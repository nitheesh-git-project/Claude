// CS: the Pay tap reaches the Razorpay sheet in one round trip, and how long
// it took is recorded.
//
// /api/appointments/create used to answer with an id and nothing else; the
// wizard then re-quoted the booking and called create-order, two more trips
// between the tap and the sheet. It now hands back the quote and, when the
// gateway is how the booking settles, the order -- through the same
// `mintAppointmentOrder` create-order uses. These pin the response shape and
// the rows it writes, and the measurement route the wizards report to.
import { test, expect } from "@playwright/test";
import { adminClient, BASE, cookieHeaderFor, profileIdFor, QA_EMAILS, wholeHourFromNow } from "./helpers";

async function post(path: string, cookie: string | null, body: unknown) {
  return fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body),
  });
}

test.describe("create answers with the quote and the order", () => {
  test("CS-001: withQuote + startPayment returns the quote and create-order's answer", async () => {
    const admin = adminClient();
    const patientId = await profileIdFor(admin, QA_EMAILS.patientB);
    const cookie = await cookieHeaderFor(QA_EMAILS.patientB);
    const { data: category } = await admin
      .from("treatment_categories")
      .select("id")
      .eq("active", true)
      .limit(1)
      .single();

    let createdId: string | undefined;
    try {
      const res = await post("/api/appointments/create", cookie, {
        categoryId: category!.id,
        slotTime: wholeHourFromNow(96),
        timezone: "Asia/Kolkata",
        withQuote: true,
        startPayment: "default",
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      createdId = body.appointmentId;
      expect(createdId).toBeTruthy();

      // The same body /api/appointments/quote answers with.
      expect(body.quote).toBeTruthy();
      expect(["gateway", "free", "pay_later"]).toContain(body.quote.settlement);
      expect(typeof body.quote.totalPaise).toBe("number");

      if (body.quote.settlement === "gateway") {
        // create-order's own body plus its status. Without Razorpay keys in
        // this environment the mint answers 500 -- still create-order's
        // answer, which the wizard handles exactly as before.
        expect(body.order).toBeTruthy();
        expect(typeof body.order.status).toBe("number");
        if (body.order.status === 200) {
          expect(body.order.orderId).toBeTruthy();
          const { data: row } = await admin
            .from("appointments")
            .select("razorpay_order_id, payment_status")
            .eq("id", createdId!)
            .single();
          expect(row!.razorpay_order_id).toBe(body.order.orderId);
          expect(row!.payment_status).toBe("unpaid");
        }
      } else {
        // Free and pay-later bookings never mint an order.
        expect(body.order).toBeNull();
      }
    } finally {
      if (createdId) await admin.from("appointments").delete().eq("id", createdId);
      await admin.from("profiles").update({ approved: true }).eq("id", patientId);
    }
  });

  test("CS-002: without withQuote the response carries neither", async () => {
    const admin = adminClient();
    const cookie = await cookieHeaderFor(QA_EMAILS.patientB);
    const { data: category } = await admin
      .from("treatment_categories")
      .select("id")
      .eq("active", true)
      .limit(1)
      .single();
    let createdId: string | undefined;
    try {
      const res = await post("/api/appointments/create", cookie, {
        categoryId: category!.id,
        slotTime: wholeHourFromNow(100),
        timezone: "Asia/Kolkata",
        startPayment: "default",
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      createdId = body.appointmentId;
      expect(body.quote).toBeNull();
      expect(body.order).toBeNull();
    } finally {
      if (createdId) await admin.from("appointments").delete().eq("id", createdId);
    }
  });
});

test.describe("checkout timing", () => {
  test("CS-003: refuses an anonymous caller", async () => {
    const res = await post("/api/razorpay/checkout-timing", null, {
      flow: "online",
      outcome: "opened",
      totalMs: 1200,
    });
    expect(res.status).toBe(401);
  });

  test("CS-004: refuses a measurement that cannot be real", async () => {
    const cookie = await cookieHeaderFor(QA_EMAILS.patientA);
    for (const body of [
      { flow: "online", outcome: "opened", totalMs: -5 },
      { flow: "online", outcome: "opened", totalMs: 10_000_000 },
      { flow: "somewhere", outcome: "opened", totalMs: 1200 },
      { flow: "online", outcome: "teleported", totalMs: 1200 },
    ]) {
      const res = await post("/api/razorpay/checkout-timing", cookie, body);
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
  });

  test("CS-005: records a valid measurement and nothing about who sent it", async () => {
    const admin = adminClient();
    const cookie = await cookieHeaderFor(QA_EMAILS.patientA);
    const marker = 54_321; // an unlikely total, so this row is findable
    const res = await post("/api/razorpay/checkout-timing", cookie, {
      flow: "online",
      newAccount: false,
      outcome: "opened",
      totalMs: marker,
      stagesMs: { create: 30_000, order: 24_321 },
    });
    expect(res.status).toBe(204);
    const { data } = await admin
      .from("checkout_timings")
      .select("id, flow, outcome, total_ms, create_ms, order_ms, signup_ms")
      .eq("total_ms", marker)
      .order("created_at", { ascending: false })
      .limit(1);
    expect(data?.[0]).toMatchObject({
      flow: "online",
      outcome: "opened",
      create_ms: 30_000,
      order_ms: 24_321,
      signup_ms: null,
    });
    if (data?.[0]) await admin.from("checkout_timings").delete().eq("id", data[0].id);
  });
});
