// The debug bar's simulated clock and the one server gate it may move:
// /api/appointments/complete-session's "has this session started yet".
//
// The bar keeps its offset in the browser; the completion buttons send it as
// `x-debug-now-offset-ms`, and the route honours it only when the server has
// ALLOW_DEBUG_CLOCK=true (src/lib/debugClock.ts). Before that, a tester who
// simulated "an hour after the session" saw Done, tapped it and was told the
// session had not started.
//
// Every case here asserts a REFUSAL, on purpose. A completion that succeeds
// writes `session_settlements`, which is append-only, so a passing success
// case would leave a permanent fixture row behind. Each branch instead picks
// the direction that proves the header was (or was not) read without
// completing anything:
//
//   flag on:  a session that started two hours ago, with the clock wound
//             back four hours, is refused as "not started yet" -- only the
//             header can have produced that answer.
//   flag off: a session three hours away, with the clock wound forward four
//             hours, is still refused -- the header was ignored.
//
// The branch follows ALLOW_DEBUG_CLOCK in the environment the suite runs in,
// which is the environment the `webServer` block starts `npm run dev` with.
// Against a server started separately, keep the two in step.
import { test, expect, request, type APIRequestContext } from "@playwright/test";
import { BASE, QA_EMAILS, adminClient, cookieHeaderFor, profileIdFor } from "./helpers";

const db = adminClient();
const MARKER = "E2E debug-clock";
const HEADER = "x-debug-now-offset-ms";
const HOUR = 60 * 60 * 1000;
const FLAG_ON = process.env.ALLOW_DEBUG_CLOCK === "true";

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

test("DC-002: the simulated clock moves the completion gate only with ALLOW_DEBUG_CLOCK", async () => {
  if (FLAG_ON) {
    // Started two hours ago by the real clock; the header winds "now" back
    // four hours, so the route must answer as though it has not started.
    const id = await seedPaidSession(Date.now() - 2 * HOUR);
    const res = await complete(id, -4 * HOUR);
    expect(res.status(), "the server ignored the simulated clock").toBe(409);
    expect((await res.json()).notYet).toBe(true);
    expect(await statusOf(id)).toBe("confirmed");
  } else {
    // Three hours away; the header claims it is four hours later. A server
    // without the flag must still refuse.
    const id = await seedPaidSession(Date.now() + 3 * HOUR);
    const res = await complete(id, 4 * HOUR);
    expect(res.status(), "the server honoured a debug clock it was not told to").toBe(409);
    expect((await res.json()).notYet).toBe(true);
    expect(await statusOf(id)).toBe("confirmed");
  }
});
