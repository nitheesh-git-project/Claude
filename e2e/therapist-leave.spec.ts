// A therapist going on leave through their own route
// (/api/therapist/set-on-leave): who may, what a malformed request gets,
// and what leave does -- an admin can no longer give them a new session
// (409 with the leave named, dates and all), while the session they already
// hold stays exactly where it was and their roster is not touched. Coming
// back clears the dates and the same assignment goes through, which is what
// proves the leave was the only thing in the way.
//
// The roster screen's own leave controls are therapist-roster.spec.ts; the
// patient's /book picker deliberately ignores the roster (R-B02 there), so
// "new bookings" here means the ones the clinic hands out. The therapist and
// the patient are accounts of their own, so putting one on leave cannot
// change what another spec's therapist is offered.
import { test, expect, type APIRequestContext, request as playwrightRequest } from "@playwright/test";
import {
  BASE,
  QA_EMAILS,
  adminClient,
  clinicSlot,
  cookieHeaderFor,
  createFixtureAccount,
  deleteFixtureAccount,
  openTherapistHour,
  rlsClientFor,
} from "./helpers";
import { formatClinicDate } from "../src/lib/formatDateTime";

test.describe.configure({ mode: "serial" });

const db = adminClient();
const MARKER = `E2E therapist-leave ${Date.now()}`;

let therapist: { id: string; email: string; name: string };
let patient: { id: string; email: string; name: string };
let heldId = "";
let newId = "";
let heldSlot = "";
let leaveFrom = "";
let leaveTo = "";
const contexts: APIRequestContext[] = [];
const cleanups: (() => Promise<void>)[] = [];

async function as(email?: string) {
  const ctx = await playwrightRequest.newContext({
    baseURL: BASE,
    extraHTTPHeaders: email ? { Cookie: await cookieHeaderFor(email) } : {},
  });
  contexts.push(ctx);
  return ctx;
}

/** The clinic's calendar date (IST) of an instant, as the roster keys it. */
function clinicDateKeyOf(iso: string) {
  return new Date(new Date(iso).getTime() + 5.5 * 3_600_000).toISOString().slice(0, 10);
}

async function leaveRow() {
  const { data, error } = await db
    .from("profiles")
    .select("on_leave, on_leave_from, on_leave_to, on_leave_reason")
    .eq("id", therapist.id)
    .single();
  if (error) throw new Error(`could not read the therapist's leave: ${error.message}`);
  return data;
}

async function session(id: string) {
  const { data, error } = await db
    .from("appointments")
    .select("therapist_id, slot_time, status")
    .eq("id", id)
    .single();
  if (error) throw new Error(`could not read session ${id}: ${error.message}`);
  return data;
}

async function rosterExceptions() {
  const { data } = await db
    .from("therapist_availability_override")
    .select("date, hour, available")
    .eq("therapist_id", therapist.id)
    .order("date")
    .order("hour");
  return data ?? [];
}

function assign(ctx: APIRequestContext) {
  return ctx.post("/api/admin/assign-appointment", { data: { appointmentId: newId, therapistId: therapist.id } });
}

function setLeave(ctx: APIRequestContext, data: unknown) {
  return ctx.post("/api/therapist/set-on-leave", { data: data as Record<string, unknown> });
}

test.beforeAll(async () => {
  therapist = await createFixtureAccount("leave therapist", { role: "therapist" });
  patient = await createFixtureAccount("leave patient");

  // Two hours on one far-off day at a random hour, both opened on the
  // roster as an admin would: one the therapist already holds a session in,
  // one an admin will try to give them.
  const day = 90 + Math.floor(Math.random() * 120);
  const hour = 8 + Math.floor(Math.random() * 10);
  heldSlot = clinicSlot(day, hour);
  const newSlot = clinicSlot(day, hour + 2);
  cleanups.push(await openTherapistHour(db, therapist.id, heldSlot));
  cleanups.push(await openTherapistHour(db, therapist.id, newSlot));
  leaveFrom = clinicDateKeyOf(new Date().toISOString());
  leaveTo = clinicDateKeyOf(newSlot);

  const base = {
    patient_id: patient.id,
    payment_status: "paid",
    amount_paid_paise: 100_000,
    visit_mode: "online",
    duration_minutes: 60,
    concern: MARKER,
  };
  const held = await db
    .from("appointments")
    .insert({ ...base, therapist_id: therapist.id, slot_time: heldSlot, status: "confirmed" })
    .select("id")
    .single();
  if (held.error || !held.data) throw new Error(`could not seed the held session: ${held.error?.message}`);
  heldId = held.data.id;
  const waiting = await db
    .from("appointments")
    .insert({ ...base, slot_time: newSlot, status: "requested" })
    .select("id")
    .single();
  if (waiting.error || !waiting.data) throw new Error(`could not seed the new session: ${waiting.error?.message}`);
  newId = waiting.data.id;
});

test.afterAll(async () => {
  for (const ctx of contexts) await ctx.dispose();
  for (const close of cleanups) await close();
  // The patient first: its sessions (and their reassignment rows) go with
  // it, and nothing then points at the therapist.
  await deleteFixtureAccount(patient?.id);
  await deleteFixtureAccount(therapist?.id);
});

test("TL-001: only an approved therapist sets their own leave, and a malformed request is refused with the reason", async () => {
  test.setTimeout(90_000);
  expect((await setLeave(await as(), { onLeave: true })).status()).toBe(403);
  // A patient is not a therapist, whatever the body says.
  expect((await setLeave(await as(QA_EMAILS.patientA), { onLeave: true })).status()).toBe(403);

  const self = await as(therapist.email);
  const malformed = await self.post("/api/therapist/set-on-leave", {
    headers: { "Content-Type": "application/json" },
    data: "{not json",
  });
  expect(malformed.status()).toBe(400);
  const cases: [unknown, string][] = [
    [{}, "Missing onLeave"],
    [{ onLeave: "yes" }, "Missing onLeave"],
    [{ onLeave: true, from: "2026-02-30" }, "Invalid leave date."],
    [{ onLeave: true, to: "next week" }, "Invalid leave date."],
    [{ onLeave: true, from: "2030-05-10", to: "2030-05-01" }, "Leave can't end before it starts."],
  ];
  for (const [body, error] of cases) {
    const refused = await setLeave(self, body);
    expect(refused.status(), JSON.stringify(body)).toBe(400);
    expect((await refused.json()).error).toBe(error);
  }
  expect(await leaveRow()).toMatchObject({ on_leave: false });
});

test("TL-002: on leave, a new session cannot be given to them, and the one they hold and their roster stay as they were", async () => {
  test.setTimeout(90_000);
  const rosterBefore = await rosterExceptions();
  const heldBefore = await session(heldId);
  expect(heldBefore).toMatchObject({ therapist_id: therapist.id, status: "confirmed" });

  const self = await as(therapist.email);
  const away = await setLeave(self, { onLeave: true, from: leaveFrom, to: leaveTo, reason: `  ${MARKER} conference  ` });
  expect(away.status(), await away.text()).toBe(200);
  expect(await away.json()).toMatchObject({ success: true, onLeave: true });
  expect(await leaveRow()).toEqual({
    on_leave: true,
    on_leave_from: leaveFrom,
    on_leave_to: leaveTo,
    on_leave_reason: `${MARKER} conference`,
  });

  // The clinic cannot hand them anything new: refused with every reason, the
  // leave first and with its dates, and the session stays unassigned.
  const refused = await assign(await as(QA_EMAILS.admin));
  expect(refused.status()).toBe(409);
  const body = await refused.json();
  expect(body.code).toBe("therapist_unavailable");
  expect(body.reasons).toEqual([
    { code: "on_leave", message: `On leave (${formatClinicDate(leaveFrom)} to ${formatClinicDate(leaveTo)}).` },
  ]);
  expect(await session(newId)).toMatchObject({ therapist_id: null, status: "requested" });

  // Leave moves nothing they already hold, and clears nothing on the roster.
  expect(await session(heldId)).toEqual(heldBefore);
  expect(await rosterExceptions()).toEqual(rosterBefore);
  const own = await rlsClientFor(therapist.email);
  const { data: stillTheirs } = await own.from("appointments").select("id").eq("id", heldId);
  expect(stillTheirs ?? []).toHaveLength(1);
});

test("TL-003: back from leave, the dates clear and the same assignment goes through", async () => {
  test.setTimeout(90_000);
  const heldBefore = await session(heldId);

  const back = await setLeave(await as(therapist.email), { onLeave: false, from: leaveFrom, reason: "ignored" });
  expect(back.status(), await back.text()).toBe(200);
  // Coming back clears the whole annotation, whatever was sent with it.
  expect(await leaveRow()).toEqual({ on_leave: false, on_leave_from: null, on_leave_to: null, on_leave_reason: null });

  const assigned = await assign(await as(QA_EMAILS.admin));
  expect(assigned.status(), await assigned.text()).toBe(200);
  expect(await session(newId)).toMatchObject({ therapist_id: therapist.id, status: "confirmed" });
  expect(await session(heldId)).toEqual(heldBefore);
});
