// A session's therapist, end to end through the routes: an admin assigns,
// reassigns (and is refused a therapist already booked then), each move is
// logged, and the session follows the assignment into the therapist's own
// RLS; then the therapist who ran it records a no-show -- not before the
// late-arrival grace, never on somebody else's session, and once -- and an
// admin records one through the same route, for any therapist.
//
// The refusal for an hour a therapist does not work is assign-availability
// (AV-001); the races are concurrency.spec.ts and
// therapist-slot-sql-checks.sql. The patient here is an account of its own,
// so the per-patient overlap trigger cannot meet another spec's booking.
// The no-show writes an append-only settlement row, so that case runs only
// on the gate's disposable stack or with E2E_ALLOW_APPEND_ONLY_WRITES=1.
import { test, expect, type APIRequestContext, request as playwrightRequest } from "@playwright/test";
import {
  BASE,
  QA_EMAILS,
  adminClient,
  clinicSlot,
  cookieHeaderFor,
  createFixtureAccount,
  deleteFixtureAccount,
  insertPastFixtureAppointment,
  openTherapistHour,
  profileIdFor,
  rlsClientFor,
} from "./helpers";

const db = adminClient();
const MARKER = `E2E session-assignment ${Date.now()}`;
const appendOnlyAllowed =
  process.env.E2E_ALLOW_APPEND_ONLY_WRITES === "1" || process.env.CI_LOCAL_STACK === "1";

let patient: { id: string; email: string; name: string };
let therapistA = "";
let therapistB = "";
let adminId = "";
const contexts: APIRequestContext[] = [];
const cleanups: (() => Promise<void>)[] = [];
const extraAppointments: string[] = [];

async function as(email?: string) {
  const ctx = await playwrightRequest.newContext({
    baseURL: BASE,
    extraHTTPHeaders: email ? { Cookie: await cookieHeaderFor(email) } : {},
  });
  contexts.push(ctx);
  return ctx;
}

async function seedSession(fields: Record<string, unknown>) {
  const { data, error } = await db
    .from("appointments")
    .insert({
      patient_id: patient.id,
      payment_status: "paid",
      amount_paid_paise: 100_000,
      visit_mode: "online",
      duration_minutes: 60,
      concern: MARKER,
      ...fields,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`could not seed a session: ${error?.message}`);
  return data.id as string;
}

async function current(id: string) {
  const { data } = await db
    .from("appointments")
    .select("therapist_id, status, slot_time, no_show, completed_at")
    .eq("id", id)
    .single();
  return data!;
}

test.beforeAll(async () => {
  patient = await createFixtureAccount("session assignment");
  therapistA = await profileIdFor(db, QA_EMAILS.therapistA);
  therapistB = await profileIdFor(db, QA_EMAILS.therapistB);
  adminId = await profileIdFor(db, QA_EMAILS.admin);
});

test.afterAll(async () => {
  for (const ctx of contexts) await ctx.dispose();
  for (const close of cleanups) await close();
  if (extraAppointments.length) await db.from("appointments").delete().in("id", extraAppointments);
  await deleteFixtureAccount(patient?.id);
});

test("AS-001: an admin assigns, reassigns and is refused a therapist already booked; each move is logged and the session follows it", async () => {
  test.setTimeout(90_000);
  // Far out and at a random hour, so no other spec's booking is on either
  // therapist then; both hours opened on the roster, as an admin would.
  const slot = clinicSlot(120 + Math.floor(Math.random() * 120), 7 + Math.floor(Math.random() * 14));
  cleanups.push(await openTherapistHour(db, therapistA, slot));
  cleanups.push(await openTherapistHour(db, therapistB, slot));
  const sessionId = await seedSession({ slot_time: slot, status: "requested" });

  const adminCtx = await as(QA_EMAILS.admin);
  const assign = (ctx: APIRequestContext, therapistId: string) =>
    ctx.post("/api/admin/assign-appointment", { data: { appointmentId: sessionId, therapistId } });

  // Nobody outside the Sessions desk: not the patient, not a therapist
  // assigning themselves, not a stranger.
  expect((await assign(await as(), therapistA)).status()).toBe(403);
  expect((await assign(await as(patient.email), therapistA)).status()).toBe(403);
  expect((await assign(await as(QA_EMAILS.therapistA), therapistA)).status()).toBe(403);
  // A patient is not a therapist.
  expect((await assign(adminCtx, patient.id)).status()).toBe(400);
  expect((await current(sessionId)).therapist_id).toBeNull();

  // Assigned: a paid session is confirmed by it.
  const first = await assign(adminCtx, therapistA);
  expect(first.status(), await first.text()).toBe(200);
  expect(await current(sessionId)).toMatchObject({ therapist_id: therapistA, status: "confirmed", slot_time: expect.any(String) });

  // The therapist's own RLS now reads it; the other therapist's does not.
  const rlsA = await rlsClientFor(QA_EMAILS.therapistA);
  const rlsB = await rlsClientFor(QA_EMAILS.therapistB);
  const readsIt = async (client: typeof rlsA) =>
    ((await client.from("appointments").select("id").eq("id", sessionId)).data ?? []).length === 1;
  expect(await readsIt(rlsA)).toBe(true);
  expect(await readsIt(rlsB)).toBe(false);

  // Reassigned to B: the session moves, keeps its time and status.
  const second = await assign(adminCtx, therapistB);
  expect(second.status(), await second.text()).toBe(200);
  expect(await current(sessionId)).toMatchObject({ therapist_id: therapistB, status: "confirmed" });
  expect(await readsIt(rlsA)).toBe(false);
  expect(await readsIt(rlsB)).toBe(true);

  // Every move is on the reassignment log, by this admin, in order.
  const { data: moves } = await db
    .from("appointment_reassignment_log")
    .select("old_therapist_id, new_therapist_id, changed_by")
    .eq("appointment_id", sessionId)
    .order("changed_at", { ascending: true });
  expect(moves).toEqual([
    { old_therapist_id: null, new_therapist_id: therapistA, changed_by: adminId },
    { old_therapist_id: therapistA, new_therapist_id: therapistB, changed_by: adminId },
  ]);
  // ...and on the admin's own activity trail.
  const { data: trail } = await db
    .from("admin_activity_log")
    .select("action, details")
    .eq("target_id", sessionId)
    .eq("action", "session.assign");
  expect((trail ?? []).map((r) => (r.details as { therapistId?: string })?.therapistId).sort()).toEqual(
    [therapistA, therapistB].sort()
  );

  // A busy therapist is refused with the reason, and nothing moves. A wants
  // the session back, but now holds another at the same hour.
  const clash = await db
    .from("appointments")
    .insert({
      patient_id: await profileIdFor(db, QA_EMAILS.patientB),
      therapist_id: therapistA,
      slot_time: slot,
      status: "confirmed",
      payment_status: "paid",
      visit_mode: "online",
      duration_minutes: 60,
      concern: MARKER,
    })
    .select("id")
    .single();
  expect(clash.error, clash.error?.message).toBeNull();
  extraAppointments.push(clash.data!.id);
  const busy = await assign(adminCtx, therapistA);
  expect(busy.status()).toBe(409);
  const body = await busy.json();
  expect(body.code).toBe("therapist_unavailable");
  expect(body.reasons.map((r: { code: string }) => r.code)).toContain("already_booked");
  expect((await current(sessionId)).therapist_id).toBe(therapistB);
});

test("AS-002: the therapist records a no-show only after the late grace, only on their own session, and only once", async () => {
  test.setTimeout(90_000);
  const noShow = (ctx: APIRequestContext, appointmentId: string) =>
    ctx.post("/api/appointments/complete-session", { data: { appointmentId, noShow: true } });
  const therapistCtx = await as(QA_EMAILS.therapistA);

  // Started five minutes ago: the patient may still turn up.
  const justStarted = new Date(Date.now() - 5 * 60_000);
  justStarted.setSeconds(0, 0);
  const early = await seedSession({ slot_time: justStarted.toISOString(), therapist_id: therapistA, status: "confirmed", duration_minutes: 30 });
  const tooSoon = await noShow(therapistCtx, early);
  expect(tooSoon.status()).toBe(409);
  expect((await tooSoon.json()).notYet).toBe(true);
  // Not their session, and not the patient's call to make.
  expect((await noShow(await as(QA_EMAILS.therapistB), early)).status()).toBe(403);
  expect((await noShow(await as(patient.email), early)).status()).toBe(403);
  expect((await noShow(await as(), early)).status()).toBe(403);
  expect(await current(early)).toMatchObject({ status: "confirmed", no_show: false, completed_at: null });

  // The recorded no-show writes a settlement row, which nothing can delete.
  test.skip(!appendOnlyAllowed, "a no-show writes an append-only settlement row; disposable project only");

  // Hours past, on the shared QA patient: the settlement row keeps the
  // session for good, and the fixture account must stay deletable.
  const patientA = await profileIdFor(db, QA_EMAILS.patientA);
  const missed = await insertPastFixtureAppointment(
    db,
    {
      patient_id: patientA,
      therapist_id: therapistA,
      status: "confirmed",
      payment_status: "paid",
      amount_paid_paise: 100_000,
      visit_mode: "online",
      duration_minutes: 30,
      concern: `${MARKER} no-show`,
    },
    { daysAgo: 2 }
  );
  const recorded = await noShow(therapistCtx, missed);
  expect(recorded.status(), await recorded.text()).toBe(200);
  const after = await current(missed);
  expect(after).toMatchObject({ status: "completed", no_show: true });
  expect(after.completed_at).toBeTruthy();
  const { data: settlement } = await db.from("session_settlements").select("appointment_id").eq("appointment_id", missed);
  expect(settlement ?? []).toHaveLength(1);
  await expect
    .poll(async () => {
      const { data } = await db
        .from("user_activity_log")
        .select("actor_role, note:summary")
        .eq("appointment_id", missed)
        .eq("action", "session.completed");
      return (data ?? []).map((r) => r.actor_role);
    })
    .toEqual(["therapist"]);

  // Once: a second tap finds nothing left to close and changes nothing.
  const again = await noShow(therapistCtx, missed);
  expect(again.status()).toBe(400);
  const { data: settlements } = await db.from("session_settlements").select("appointment_id").eq("appointment_id", missed);
  expect(settlements ?? []).toHaveLength(1);
});

test("AS-003: an admin records a no-show through the same route, on any therapist's session, and once", async () => {
  test.setTimeout(90_000);
  test.skip(!appendOnlyAllowed, "a no-show writes an append-only settlement row; disposable project only");
  const noShow = (ctx: APIRequestContext, appointmentId: string) =>
    ctx.post("/api/appointments/complete-session", { data: { appointmentId, noShow: true } });

  // Therapist B's session, on the shared QA patient for the same reason as
  // AS-002: the settlement row keeps it for good.
  const patientA = await profileIdFor(db, QA_EMAILS.patientA);
  const missed = await insertPastFixtureAppointment(
    db,
    {
      patient_id: patientA,
      therapist_id: therapistB,
      status: "confirmed",
      payment_status: "paid",
      amount_paid_paise: 100_000,
      visit_mode: "online",
      duration_minutes: 30,
      concern: `${MARKER} admin no-show`,
    },
    { daysAgo: 3 }
  );

  // Therapist A did not run it, so it is not theirs to close.
  expect((await noShow(await as(QA_EMAILS.therapistA), missed)).status()).toBe(403);
  expect(await current(missed)).toMatchObject({ status: "confirmed", no_show: false, completed_at: null });

  // The Sessions desk may, for whoever ran it.
  const adminCtx = await as(QA_EMAILS.admin);
  const recorded = await noShow(adminCtx, missed);
  expect(recorded.status(), await recorded.text()).toBe(200);
  const after = await current(missed);
  expect(after).toMatchObject({ status: "completed", no_show: true, therapist_id: therapistB });
  expect(after.completed_at).toBeTruthy();
  const { data: settlement } = await db
    .from("session_settlements")
    .select("appointment_id, therapist_id")
    .eq("appointment_id", missed);
  expect(settlement).toEqual([{ appointment_id: missed, therapist_id: therapistB }]);

  // Once, from the admin's side too.
  const again = await noShow(adminCtx, missed);
  expect(again.status()).toBe(400);
  expect((await again.json()).error).toBe("Only confirmed sessions can be marked completed.");
});
