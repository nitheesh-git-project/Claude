// The guided check's phase 2 on the patient's side and the start screen:
// the get-ready list before a video session and its "I'm ready", the
// physiotherapist's start screen saying so, and the recap card the week
// after a session.
//
// Fixtures: two throwaway patients of their own. The first has a knee
// (orthopaedic) profile, one confirmed video session with QA Therapist A
// about a day ahead, one cancelled video session about a day ahead, and one
// completed video session last week with a shared summary. The second has
// nothing; it is only the "someone else" for the route's ownership check.
//
// What is asserted: the Overview lists the knee check's things to have ready
// (the chair, the towel, the path) with one "I'm ready" button, which saves
// once and says so; the route refuses a malformed body (400), another
// patient's session (404, never 403 or a hint it exists) and a cancelled
// session (409 not_open), and a second tap answers the first time unchanged; the
// physiotherapist's start screen says the patient is ready; the recap card
// shows the shared summary and the next session.
import { test, expect } from "@playwright/test";
import {
  BASE,
  QA_EMAILS,
  adminClient,
  browserCookiesFor,
  cookieHeaderFor,
  createFixtureAccount,
  deleteFixtureAccount,
  insertPastFixtureAppointment,
  profileIdFor,
  waitForSplashToClear,
} from "./helpers";

test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

const db = adminClient();
const SEEN = { timeout: 60_000 };
const MARKER = "E2E session prep";
let patient: { id: string; email: string; name: string } | undefined;
let other: { id: string; email: string; name: string } | undefined;
let videoId = "";
let cancelledId = "";

/** A confirmed future session about `hoursAhead` from now, on the first free
 *  hour (the therapist's sessions may not overlap). */
async function futureAppointment(row: Record<string, unknown>, hoursAhead: number): Promise<string> {
  let last = "";
  for (let attempt = 0; attempt < 40; attempt++) {
    const slot = new Date(Date.now() + (hoursAhead + attempt) * 3_600_000);
    slot.setUTCMinutes(attempt % 2 === 0 ? 0 : 30, 0, 0);
    const { data, error } = await db.from("appointments").insert({ ...row, slot_time: slot.toISOString() }).select("id").single();
    if (data) return data.id as string;
    if (error?.code === "23505" || error?.code === "23P01") {
      last = error.message;
      continue;
    }
    throw new Error(error?.message ?? "could not create the fixture appointment");
  }
  throw new Error(`no free hour for the fixture appointment: ${last}`);
}

async function ready(email: string, appointmentId: unknown, request: import("@playwright/test").APIRequestContext) {
  return request.post(`${BASE}/api/patient/session-ready`, {
    headers: { cookie: await cookieHeaderFor(email), "content-type": "application/json" },
    data: { appointmentId },
  });
}

test.beforeAll(async () => {
  const therapistAId = await profileIdFor(db, QA_EMAILS.therapistA);
  patient = await createFixtureAccount("Session Prep");
  other = await createFixtureAccount("Session Prep Other");
  const { error } = await db
    .from("patient_condition_profiles")
    .insert({ patient_id: patient.id, specialty: "ortho", status: "active", data: { pain_location: "Right knee" } });
  expect(error, error?.message).toBeNull();
  const base = { patient_id: patient.id, therapist_id: therapistAId, status: "confirmed", payment_status: "paid", duration_minutes: 30, concern: MARKER };
  videoId = await futureAppointment({ ...base, visit_mode: "online" }, 26);
  cancelledId = await futureAppointment({ ...base, status: "cancelled", visit_mode: "online" }, 30);
  const pastId = await insertPastFixtureAppointment(
    db,
    { ...base, status: "completed", visit_mode: "online" },
    { daysAgo: 2 }
  );
  const summary = await db.from("session_summaries").insert({
    appointment_id: pastId,
    patient_id: patient.id,
    therapist_id: therapistAId,
    what_we_did: "We checked how far your knee bends.",
    before_next_time: "Heel slides twice a day.",
  });
  expect(summary.error, summary.error?.message).toBeNull();
});

test.afterAll(async () => {
  await deleteFixtureAccount(patient?.id);
  await deleteFixtureAccount(other?.id);
});

test("GR-001: the Overview lists the knee check's things to have ready, and I'm ready saves once", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addCookies(await browserCookiesFor(patient!.email));
  const page = await context.newPage();
  await page.goto(`${BASE}/patient/dashboard`);
  const card = page.getByTestId("get-ready-card");
  await expect(card).toBeVisible(SEEN);
  const items = page.getByTestId("get-ready-items");
  await expect(items).toContainText("chair");
  await expect(items).toContainText("towel");
  await expect(items).toContainText("14 metres");
  await waitForSplashToClear(page);
  await page.getByTestId("get-ready-button").click();
  await expect(page.getByTestId("get-ready-done")).toBeVisible(SEEN);
  const row = await db.from("appointments").select("patient_ready_at").eq("id", videoId).single();
  expect(row.data?.patient_ready_at).toBeTruthy();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await context.close();
});

test("GR-002: the route keeps the first time, and refuses a bad body, someone else's session and a cancelled one", async ({ request }) => {
  const first = await db.from("appointments").select("patient_ready_at").eq("id", videoId).single();
  const again = await ready(patient!.email, videoId, request);
  expect(again.status()).toBe(200);
  expect(await again.json()).toMatchObject({ unchanged: true, readyAt: first.data?.patient_ready_at });

  expect((await ready(patient!.email, 42, request)).status()).toBe(400);
  expect((await ready(other!.email, videoId, request)).status()).toBe(404);
  const cancelled = await ready(patient!.email, cancelledId, request);
  expect(cancelled.status()).toBe(409);
  expect(await cancelled.json()).toMatchObject({ code: "not_open" });
  const untouched = await db.from("appointments").select("patient_ready_at").eq("id", cancelledId).single();
  expect(untouched.data?.patient_ready_at).toBeNull();
});

test("GR-003: the physiotherapist's start screen says the patient is ready", async ({ page }) => {
  await page.context().addCookies(await browserCookiesFor(QA_EMAILS.therapistA));
  await page.goto(`${BASE}/therapist/dashboard/assessment/${patient!.id}?appointment=${videoId}`);
  await expect(page.getByTestId("start-readiness")).toContainText("is ready", SEEN);
  await expect(page.getByTestId("start-readiness")).toContainText("ticked the get-ready list at");
});

test("GR-004: the week after a session the Overview shows the shared summary and the next session", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addCookies(await browserCookiesFor(patient!.email));
  const page = await context.newPage();
  await page.goto(`${BASE}/patient/dashboard`);
  const recap = page.getByTestId("session-recap");
  await expect(recap).toBeVisible(SEEN);
  await expect(recap).toContainText("We checked how far your knee bends.");
  await expect(recap).toContainText("Heel slides twice a day.");
  await expect(recap).toContainText("Next session");
  await expect(recap).not.toContainText("Book your next session");
  await context.close();
});
