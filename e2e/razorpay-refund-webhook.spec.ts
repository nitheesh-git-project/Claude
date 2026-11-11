import crypto from "node:crypto";
import { test, expect, type APIRequestContext } from "@playwright/test";
import { BASE, QA_EMAILS, adminClient, profileIdFor } from "./helpers";

/**
 * Refunds reach the app from Razorpay (src/lib/razorpayRefundSync.ts).
 *
 * A refund made on the Razorpay website used to be invisible to the app --
 * the session went on reading Paid -- and a refund the app started was never
 * told when the bank failed it. These post signed `refund.*` webhooks, as
 * Razorpay does, against fixture bookings, and read what the app recorded.
 *
 * Needs the dev server's RAZORPAY_WEBHOOK_SECRET to sign with; no gateway
 * is called.
 */

const secret = process.env.RAZORPAY_WEBHOOK_SECRET ?? "";
const tag = Date.now().toString(36);
const ids = { session: `pay_e2eRfS${tag}`, app: `pay_e2eRfA${tag}`, programme: `pay_e2eRfP${tag}` };

function refundEvent(type: string, refundId: string, paymentId: string, amount: number, status: string) {
  return {
    entity: "event",
    event: type,
    contains: ["refund", "payment"],
    payload: {
      refund: {
        entity: { id: refundId, entity: "refund", amount, currency: "INR", payment_id: paymentId, status, speed_processed: "normal", created_at: Math.floor(Date.now() / 1000) },
      },
      payment: { entity: { id: paymentId, entity: "payment", amount, status: "refunded", order_id: `order_e2e${tag}` } },
    },
    created_at: Math.floor(Date.now() / 1000),
  };
}

async function send(request: APIRequestContext, body: unknown, eventId: string, sign = secret) {
  const raw = JSON.stringify(body);
  return request.post(`${BASE}/api/razorpay/webhook`, {
    headers: {
      "content-type": "application/json",
      "x-razorpay-signature": crypto.createHmac("sha256", sign).update(raw).digest("hex"),
      "x-razorpay-event-id": eventId,
    },
    data: raw,
  });
}

test.describe("Razorpay refunds reach the app", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(!secret, "needs RAZORPAY_WEBHOOK_SECRET (the dev server's) to sign a webhook");

  let patientId = "";
  let categoryId = "";
  const created: { appointments: string[]; purchases: string[] } = { appointments: [], purchases: [] };

  test.beforeAll(async () => {
    const admin = adminClient();
    patientId = await profileIdFor(admin, QA_EMAILS.patientB);
    const { data } = await admin.from("treatment_categories").select("id").eq("active", true).limit(1).single();
    categoryId = data!.id;
  });

  test.afterAll(async () => {
    const admin = adminClient();
    await admin.from("razorpay_refunds").delete().in("razorpay_payment_id", Object.values(ids));
    if (created.appointments.length) await admin.from("appointments").delete().in("id", created.appointments);
    if (created.purchases.length) await admin.from("patient_package_purchases").delete().in("id", created.purchases);
  });

  async function paidSession(paymentId: string, extra: Record<string, unknown> = {}) {
    const { data, error } = await adminClient()
      .from("appointments")
      .insert({
        patient_id: patientId,
        category_id: categoryId,
        slot_time: new Date(Date.now() - 3 * 86_400_000).toISOString(),
        status: "cancelled",
        payment_status: "paid",
        amount_paid_paise: 49900,
        razorpay_payment_id: paymentId,
        concern: "RFD fixture",
        ...extra,
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    created.appointments.push(data!.id);
    return data!.id as string;
  }

  test("RFD-001 a refund made on the Razorpay website is recorded on the session, once, and never moves back", async ({ request }) => {
    const sessionId = await paidSession(ids.session);
    const refundId = `rfnd_e2eS${tag}`;

    const processed = await send(request, refundEvent("refund.processed", refundId, ids.session, 49900, "processed"), `evt_rfd1a_${tag}`);
    expect(processed.status(), await processed.text()).toBe(200);
    expect(await processed.json()).toMatchObject({ processed: true, source: "razorpay", applied: "applied" });

    const admin = adminClient();
    const { data: session } = await admin
      .from("appointments")
      .select("refund_status, refund_amount_paise, refund_id, refund_reason, refunded_at")
      .eq("id", sessionId)
      .single();
    expect(session).toMatchObject({ refund_status: "processed", refund_amount_paise: 49900, refund_id: refundId });
    expect(session!.refund_reason).toContain("Refunded on Razorpay");

    // The same refund, delivered again under a new event id: nothing changes.
    const again = await send(request, refundEvent("refund.processed", refundId, ids.session, 49900, "processed"), `evt_rfd1b_${tag}`);
    expect(await again.json()).toMatchObject({ applied: "already" });
    // And a late `created` does not move it back.
    await send(request, refundEvent("refund.created", refundId, ids.session, 49900, "created"), `evt_rfd1c_${tag}`);
    const { data: mirror } = await admin.from("razorpay_refunds").select("status, source, applied, appointment_id, patient_id").eq("razorpay_refund_id", refundId).single();
    expect(mirror).toMatchObject({ status: "processed", source: "razorpay", appointment_id: sessionId, patient_id: patientId });
  });

  test("RFD-002 a refund the app started that the bank then failed turns the session's refund to Failed", async ({ request }) => {
    const refundId = `rfnd_e2eA${tag}`;
    const sessionId = await paidSession(ids.app, {
      refund_status: "processed",
      refund_amount_paise: 49900,
      refund_id: refundId,
      refunded_at: new Date().toISOString(),
    });
    const failed = await send(request, refundEvent("refund.failed", refundId, ids.app, 49900, "failed"), `evt_rfd2_${tag}`);
    expect(await failed.json()).toMatchObject({ processed: true, source: "app", applied: "applied" });
    const { data } = await adminClient().from("appointments").select("refund_status, refund_reason").eq("id", sessionId).single();
    expect(data!.refund_status).toBe("failed");
    expect(data!.refund_reason).toContain("could not complete");
  });

  test("RFD-003 a refund against a programme is left for a person to decide, not applied", async ({ request }) => {
    const admin = adminClient();
    const { data: pkg } = await admin.from("treatment_category_packages").select("id, category_id").limit(1).single();
    test.skip(!pkg, "no programme in the catalogue to fixture a purchase against");
    const { data: purchase, error } = await admin
      .from("patient_package_purchases")
      .insert({
        patient_id: patientId,
        package_id: pkg!.id,
        category_id: pkg!.category_id,
        session_count: 4,
        payment_status: "paid",
        amount_paid_paise: 160000,
        razorpay_payment_id: ids.programme,
        status: "active",
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    created.purchases.push(purchase!.id);
    const res = await send(request, refundEvent("refund.processed", `rfnd_e2eP${tag}`, ids.programme, 40000, "processed"), `evt_rfd3_${tag}`);
    expect(await res.json()).toMatchObject({ applied: "needs_review", subject: "package_purchase" });
    const { data: after } = await admin.from("patient_package_purchases").select("payment_status, status").eq("id", purchase!.id).single();
    expect(after).toMatchObject({ payment_status: "paid", status: "active" });
  });

  test("RFD-004 a refund event with a wrong signature changes nothing", async ({ request }) => {
    const res = await send(request, refundEvent("refund.processed", `rfnd_e2eX${tag}`, ids.session, 100, "processed"), `evt_rfd4_${tag}`, "not-the-secret");
    expect(res.status()).toBe(400);
    const { count } = await adminClient().from("razorpay_refunds").select("razorpay_refund_id", { count: "exact", head: true }).eq("razorpay_refund_id", `rfnd_e2eX${tag}`);
    expect(count).toBe(0);
  });
});
