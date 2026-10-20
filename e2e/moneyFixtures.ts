// Fixtures the money-flow specs share: their own accounts, bookings in free
// slots, and a session paid the way a patient pays for one (create-order ->
// the fake gateway captures -> a signed verify). Every account is made per
// run, so nothing another spec leaves on the shared QA fixtures can stand in
// for a step these files are meant to prove, and nothing these files leave
// can collide with another spec on the same stack.
import { expect, request, type APIRequestContext } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  BASE,
  QA_EMAILS,
  TEST_PASSWORD,
  clinicSlot,
  cookieHeaderFor,
  insertPastFixtureAppointment,
  markDashboardTourSeen,
  profileIdFor,
} from "./helpers";
import { checkoutSignature, gateway, type FakePayment } from "./fakeGateway";

export type FixtureAccount = { id: string; email: string; name: string };

/** A new, approved, active account for this run only (`@example.test`). */
export async function createFixtureAccount(
  db: SupabaseClient,
  role: "patient" | "therapist" | "hospital",
  label: string,
  profile: Record<string, unknown> = {}
): Promise<FixtureAccount> {
  const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const email = `qa.${label}.${stamp}@example.test`;
  const name = `QA ${label} ${stamp.slice(-6)}`;
  const { data, error } = await db.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
    user_metadata: { role, full_name: name },
  });
  if (error || !data.user) throw new Error(`could not create ${email}: ${error?.message}`);
  const { error: profileError } = await db
    .from("profiles")
    .update({ role, full_name: name, approved: true, active: true, ...profile })
    .eq("id", data.user.id);
  if (profileError) throw new Error(`could not set up ${email}: ${profileError.message}`);
  // A new account: the first-visit tutorial would open over its dashboard.
  await markDashboardTourSeen(email);
  return { id: data.user.id, email, name };
}

export async function apiAs(email: string): Promise<APIRequestContext> {
  return request.newContext({ extraHTTPHeaders: { Cookie: await cookieHeaderFor(email) } });
}

/**
 * An unpaid online booking in the first free whole hour from `daysAhead`
 * onwards. Free for the patient (appointments_patient_no_overlap) and, when
 * one is named, the therapist (appointments_one_therapist_per_slot).
 */
export async function insertBooking(
  db: SupabaseClient,
  row: Record<string, unknown> & { patient_id: string },
  { daysAhead = 45, slotTime }: { daysAhead?: number; slotTime?: string } = {}
): Promise<{ id: string; slotTime: string }> {
  let last = "";
  for (let attempt = 0; attempt < 60; attempt++) {
    const slot = slotTime ?? clinicSlot(daysAhead + Math.floor(attempt / 12), 9 + (attempt % 12));
    const { data, error } = await db
      .from("appointments")
      .insert({
        category_id: null,
        concern: "E2E money flows",
        timezone: "Asia/Kolkata",
        duration_minutes: 45,
        status: "requested",
        payment_status: "unpaid",
        visit_mode: "online",
        ...row,
        slot_time: slot,
      })
      .select("id")
      .single();
    if (data) return { id: data.id as string, slotTime: slot };
    if ((error?.code === "23505" || error?.code === "23P01") && !slotTime) {
      last = error.message;
      continue;
    }
    throw new Error(`seeded booking: ${error?.message ?? "no row"}`);
  }
  throw new Error(`no free slot for the fixture booking: ${last}`);
}

export type PaidSession = { appointmentId: string; orderId: string; amount: number; payment: FakePayment };

/** create-order as the patient: the order the server priced. */
export async function createSessionOrder(
  patient: APIRequestContext,
  appointmentId: string
): Promise<{ orderId: string; amount: number }> {
  const res = await patient.post(`${BASE}/api/razorpay/create-order`, { data: { appointmentId } });
  const body = await res.json();
  expect(res.status(), JSON.stringify(body)).toBe(200);
  expect(body.orderId, JSON.stringify(body)).toMatch(/^order_/);
  return { orderId: body.orderId as string, amount: Number(body.amount) };
}

export async function verifySession(
  patient: APIRequestContext,
  appointmentId: string,
  orderId: string,
  paymentId: string,
  signature = checkoutSignature(orderId, paymentId)
) {
  const res = await patient.post(`${BASE}/api/razorpay/verify`, {
    data: { appointmentId, razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature },
  });
  return { status: res.status(), body: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}

/** A session the patient has paid for, end to end through the fake gateway. */
export async function payForSession(patient: APIRequestContext, appointmentId: string): Promise<PaidSession> {
  const { orderId, amount } = await createSessionOrder(patient, appointmentId);
  const payment = await gateway.pay(orderId);
  const verified = await verifySession(patient, appointmentId, orderId, payment.id);
  expect(verified.status, JSON.stringify(verified.body)).toBe(200);
  return { appointmentId, orderId, amount, payment };
}

/**
 * A recommended programme, approved and waiting for the patient to buy it:
 * a delivered session between the two (the therapist may only recommend to
 * their own patient), the therapist's recommendation, and the admin's
 * approval. Writes append-only care-plan rows -- callers gate on a
 * disposable project, as recommendation-course.spec.ts does.
 */
export async function recommendProgramme(
  db: SupabaseClient,
  patientId: string,
  { sessionCount = 3 }: { sessionCount?: number } = {}
): Promise<{ carePlanVersionId: string; pricePaise: number; sessionCount: number; categoryId: string }> {
  const therapistId = await profileIdFor(db, QA_EMAILS.therapistA);
  const categoryId = await programmeCondition(db);
  const visitId = await insertPastFixtureAppointment(
    db,
    {
      patient_id: patientId,
      therapist_id: therapistId,
      category_id: categoryId,
      concern: "E2E money flows",
      duration_minutes: 60,
      status: "completed",
      payment_status: "paid",
      amount_paid_paise: 49900,
      visit_mode: "online",
    },
    { daysAgo: 9 }
  );
  const therapist = await apiAs(QA_EMAILS.therapistA);
  const adminCtx = await apiAs(QA_EMAILS.admin);
  try {
    const res = await therapist.post(`${BASE}/api/therapist/care-plan/submit`, {
      data: {
        patientId,
        appointmentId: visitId,
        categoryId,
        sessionCount,
        handsOnRequired: false,
        frequencyPerWeek: 2,
        clinicalRationale: "E2E money flows",
        instructions: "",
      },
    });
    const created = await res.json();
    expect(res.status(), JSON.stringify(created)).toBe(200);
    const review = await adminCtx.post(`${BASE}/api/admin/review-care-plan`, {
      data: { carePlanId: created.carePlanId, decision: "approved" },
    });
    expect(review.status(), await review.text()).toBe(200);
    const { data: version, error } = await db
      .from("care_plan_versions")
      .select("offer_kind, offer_snapshot")
      .eq("id", created.versionId)
      .single();
    expect(error, error?.message).toBeNull();
    expect(version!.offer_kind).toBe("session_package");
    const snap = version!.offer_snapshot as { pricePaise: number; sessionCount: number };
    return { carePlanVersionId: created.versionId, pricePaise: snap.pricePaise, sessionCount: snap.sessionCount, categoryId };
  } finally {
    await therapist.dispose();
    await adminCtx.dispose();
  }
}

/**
 * The condition the programmes are recommended under. Found or made exactly
 * as recommendation-course.spec.ts makes it, so whichever spec runs first on
 * a stack, the catalogue ends up with the same one row.
 */
async function programmeCondition(db: SupabaseClient): Promise<string> {
  const title = "Spine Conditions";
  const { data: found } = await db.from("treatment_categories").select("id").eq("title", title).maybeSingle();
  if (found) return found.id as string;
  const { data, error } = await db
    .from("treatment_categories")
    .insert({
      title,
      description: "A condition seeded by the recommendation-course spec.",
      points: ["Back and neck pain", "Posture"],
      price_paise: 49900,
      duration_minutes: 60,
      active: true,
      image_url: "/photos/care-back.jpg",
    })
    .select("id")
    .single();
  if (error) throw new Error(`could not seed "${title}": ${error.message}`);
  return data.id as string;
}

export type ProgrammeOrder = { purchaseId: string; orderId: string; amount: number };

export async function createProgrammeOrder(
  patient: APIRequestContext,
  carePlanVersionId: string
): Promise<ProgrammeOrder> {
  const res = await patient.post(`${BASE}/api/care-plan/create-order`, { data: { carePlanVersionId } });
  const body = await res.json();
  expect(res.status(), JSON.stringify(body)).toBe(200);
  expect(body.offerKind).toBe("session_package");
  return { purchaseId: body.purchaseId as string, orderId: body.orderId as string, amount: Number(body.amount) };
}

export async function verifyProgramme(
  patient: APIRequestContext,
  order: ProgrammeOrder,
  paymentId: string,
  signature = checkoutSignature(order.orderId, paymentId)
) {
  const res = await patient.post(`${BASE}/api/care-plan/verify`, {
    data: {
      purchaseId: order.purchaseId,
      offerKind: "session_package",
      razorpay_order_id: order.orderId,
      razorpay_payment_id: paymentId,
      razorpay_signature: signature,
    },
  });
  return { status: res.status(), body: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}

/** The credits a programme purchase holds: its entitlement and the grant rows. */
export async function creditsFor(db: SupabaseClient, purchaseId: string) {
  const { data: entitlements, error } = await db
    .from("session_entitlements")
    .select("id, sessions_granted, granted_count, reserved_count, consumed_count, status")
    .eq("legacy_purchase_id", purchaseId);
  expect(error, error?.message).toBeNull();
  const ids = (entitlements ?? []).map((e) => e.id as string);
  const { data: ledger } = ids.length
    ? await db.from("session_credit_ledger").select("entry_type, delta_granted").in("entitlement_id", ids)
    : { data: [] as { entry_type: string; delta_granted: number }[] };
  return { entitlements: entitlements ?? [], ledger: ledger ?? [] };
}

export async function paymentsForOrder(db: SupabaseClient, orderId: string) {
  const { data, error } = await db
    .from("payments")
    .select("id, status, razorpay_payment_id, amount_paise, captured_amount_paise, target_appointment_id, target_package_purchase_id")
    .eq("razorpay_order_id", orderId);
  expect(error, error?.message).toBeNull();
  return data ?? [];
}

export async function refundAttemptsFor(db: SupabaseClient, column: "appointment_id" | "package_purchase_id", id: string) {
  const { data, error } = await db
    .from("refund_attempts")
    .select("status, amount_paise, razorpay_payment_id, razorpay_refund_id, failure_detail, created_at")
    .eq(column, id)
    .order("created_at", { ascending: true });
  expect(error, error?.message).toBeNull();
  return data ?? [];
}
