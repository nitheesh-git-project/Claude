// The debug bar's simulated clock and the server gates it may move:
// /api/appointments/complete-session's "has this session started yet", and
// the gates the same session card reaches through it -- the session note
// (DC-003), "Show number" (DC-004) and the Pain Map exam Done requires
// (DC-005).
//
// The bar keeps its offset in the browser; the completion buttons send it as
// `x-debug-now-offset-ms`, and the route honours it whenever the debug bar is
// on (isDebugNavVisible, via src/lib/debugClock.ts). Before that, a tester who
// simulated "an hour after the session" saw Done, tapped it and was told the
// session had not started.
//
// Every case here asserts a REFUSAL, on purpose. A completion that succeeds
// writes `session_settlements`, which is append-only, so a passing success
// case would leave a permanent fixture row behind. Each branch instead picks
// the direction that proves the header was (or was not) read without
// completing anything:
//
//   bar on:  a session that started two hours ago, with the clock wound
//            back four hours, is refused as "not started yet" -- only the
//            header can have produced that answer.
//   bar off: a session three hours away, with the clock wound forward four
//            hours, is still refused -- the header was ignored.
//
// The branch follows NEXT_PUBLIC_SHOW_DEBUG_NAV in the environment the suite
// runs in (on unless exactly "false"), which is the environment the
// `webServer` block starts `npm run dev` with. Against a server started
// separately, keep the two in step.
import { test, expect, request, type APIRequestContext } from "@playwright/test";
import {
  BASE,
  QA_EMAILS,
  adminClient,
  cookieHeaderFor,
  createFixtureAccount,
  deleteFixtureAccount,
  profileIdFor,
} from "./helpers";
import { SESSION_NOTE_FIELDS } from "../src/lib/sessionNotes";

const db = adminClient();
const MARKER = "E2E debug-clock";
const HEADER = "x-debug-now-offset-ms";
const HOUR = 60 * 60 * 1000;
const BAR_ON = process.env.NEXT_PUBLIC_SHOW_DEBUG_NAV !== "false";

let patientId: string;
let therapistId: string;
let therapist: APIRequestContext;

async function seedPaidSession(slotMs: number) {
  const slot = new Date(slotMs);
  slot.setMinutes(0, 0, 0);
  const { data, error } = await db
    .from("appointments")
    .insert({
      patient_id: patientId,
      therapist_id: therapistId,
      slot_time: slot.toISOString(),
      status: "confirmed",
      payment_status: "paid",
      duration_minutes: 30,
      visit_mode: "online",
      concern: MARKER,
    })
    .select("id")
    .single();
  if (error) throw new Error(`could not seed a session: ${error.message}`);
  return data.id as string;
}

async function complete(appointmentId: string, offsetMs?: number) {
  return therapist.post(`${BASE}/api/appointments/complete-session`, {
    headers: offsetMs === undefined ? {} : { [HEADER]: String(offsetMs) },
    data: { appointmentId },
  });
}

async function statusOf(appointmentId: string) {
  const { data } = await db.from("appointments").select("status").eq("id", appointmentId).single();
  return data?.status;
}

test.beforeAll(async () => {
  patientId = await profileIdFor(db, QA_EMAILS.patientA);
  therapistId = await profileIdFor(db, QA_EMAILS.therapistA);
  await db.from("appointments").delete().eq("concern", MARKER);
  therapist = await request.newContext({
    extraHTTPHeaders: { Cookie: await cookieHeaderFor(QA_EMAILS.therapistA) },
  });
});

// The database refuses two sessions for one patient in overlapping slots, so
// each case starts from none of this spec's own.
test.beforeEach(async () => {
  await db.from("appointments").delete().eq("concern", MARKER);
});

test.afterAll(async () => {
  await db.from("appointments").delete().eq("concern", MARKER);
  await therapist?.dispose();
});

test("DC-001: a session that has not started is refused on the real clock", async () => {
  const id = await seedPaidSession(Date.now() + 3 * HOUR);
  const res = await complete(id);
  expect(res.status()).toBe(409);
  expect((await res.json()).notYet).toBe(true);
  expect(await statusOf(id)).toBe("confirmed");
});

test("DC-002: the simulated clock moves the completion gate while the debug bar is on", async () => {
  if (BAR_ON) {
    // Started two hours ago by the real clock; the header winds "now" back
    // four hours, so the route must answer as though it has not started.
    const id = await seedPaidSession(Date.now() - 2 * HOUR);
    const res = await complete(id, -4 * HOUR);
    expect(res.status(), "the server ignored the simulated clock").toBe(409);
    expect((await res.json()).notYet).toBe(true);
    expect(await statusOf(id)).toBe("confirmed");
  } else {
    // Three hours away; the header claims it is four hours later. With the
    // bar off the server must still refuse.
    const id = await seedPaidSession(Date.now() + 3 * HOUR);
    const res = await complete(id, 4 * HOUR);
    expect(res.status(), "the server honoured a debug clock with the bar off").toBe(409);
    expect((await res.json()).notYet).toBe(true);
    expect(await statusOf(id)).toBe("confirmed");
  }
});

// The two therapist gates the card offers on the simulated clock and that
// used to refuse on the real one: writing the session note (Done opens it),
// and "Show number". Refusal direction again -- a saved note or a reveal-log
// row would be a fixture left behind.
test("DC-003: the session note's 'has it started' gate follows the simulated clock", async () => {
  test.skip(!BAR_ON, "the header is ignored with the debug bar off (DC-002)");
  // Started two hours ago; the header winds "now" back four hours.
  const id = await seedPaidSession(Date.now() - 2 * HOUR);
  const res = await therapist.post(`${BASE}/api/therapist/session-notes/submit`, {
    headers: { [HEADER]: String(-4 * HOUR) },
    // Every required field filled, so the only thing left to refuse on is
    // the clock.
    data: {
      appointmentId: id,
      data: Object.fromEntries(SESSION_NOTE_FIELDS.map((f) => [f.key, "e2e"])),
      freeText: "e2e",
    },
  });
  expect(res.status(), "the note route ignored the simulated clock").toBe(400);
  // Names the time rather than "once the session has taken place".
  expect((await res.json()).error).toMatch(/^You can write the note from .+, when the session starts\.$/);
});

test("DC-004: 'Show number' follows the simulated clock and says when it opens", async () => {
  test.skip(!BAR_ON, "the header is ignored with the debug bar off (DC-002)");
  const { data: settings } = await db.from("site_settings").select("contact_masking_enabled").maybeSingle();
  test.skip(settings?.contact_masking_enabled === false, "masking is off, so nothing is refused");
  // In progress by the real clock; four hours earlier by the header.
  const id = await seedPaidSession(Date.now());
  const res = await therapist.post(`${BASE}/api/therapist/reveal-contact`, {
    headers: { [HEADER]: String(-4 * HOUR) },
    data: { appointmentId: id },
  });
  expect(res.status(), "the reveal route ignored the simulated clock").toBe(403);
  expect((await res.json()).error).toMatch(/^You can see this number from .+ on .+\.$/);
});

// The Pain Map exam Done requires. Its "has a session with them started"
// gate read the real clock through a Date.now() default, so on staging a
// tester who simulated past a session's end was let through the completion
// dialog and then refused the exam it asked for. Refusal direction again --
// pain_assessments is append-only -- and against a patient of the spec's
// own, since any completed session between the shared QA pair would answer
// "started" whatever the clock said.
test("DC-005: the Pain Map exam's 'has a session started' gate follows the simulated clock", async () => {
  test.setTimeout(90_000);
  const patient = await createFixtureAccount("debug clock exam");
  try {
    const slotMs = BAR_ON ? Date.now() - 2 * HOUR : Date.now() + 3 * HOUR;
    const slot = new Date(slotMs);
    slot.setMinutes(0, 0, 0);
    const { error } = await db.from("appointments").insert({
      patient_id: patient.id,
      therapist_id: therapistId,
      slot_time: slot.toISOString(),
      status: "confirmed",
      payment_status: "paid",
      duration_minutes: 30,
      visit_mode: "online",
      concern: MARKER,
    });
    if (error) throw new Error(`could not seed a session: ${error.message}`);
    const res = await therapist.post(`${BASE}/api/therapist/pain-assessments/submit`, {
      // Bar on: started two hours ago, wound back four -- only the header can
      // make it "not started". Bar off: three hours away, wound forward four
      // -- the header must be ignored.
      headers: { [HEADER]: String(BAR_ON ? -4 * HOUR : 4 * HOUR) },
      data: { patientId: patient.id, region: "knee", side: "left", painPercent: 50, answers: [] },
    });
    expect(res.status(), BAR_ON ? "the exam gate ignored the simulated clock" : "the exam gate honoured a debug clock with the bar off").toBe(409);
    expect((await res.json()).error).toMatch(/session you've started/);
    const { count } = await db
      .from("pain_assessments")
      .select("id", { count: "exact", head: true })
      .eq("patient_id", patient.id);
    expect(count ?? 0).toBe(0);
  } finally {
    await deleteFixtureAccount(patient.id);
  }
});
