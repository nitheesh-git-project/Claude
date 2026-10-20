// A patient rating a completed session through the route, and the admin
// reading it: what may be rated (only your own, only once it is completed,
// never a no-show, never twice), what is stored, and the session drawer an
// admin opens from the patient's Booking History showing it.
//
// The rating card itself is session-feedback.spec.ts (session runner); this
// file is the rules behind it, which the card cannot show. The patient is an
// account of its own, so the Booking History being read holds only these
// sessions. A rating writes an append-only `user_activity_log` row, so the
// file runs only on the gate's disposable stack or with
// E2E_ALLOW_APPEND_ONLY_WRITES=1 (same gate as recommendation-course).
import { test, expect, type APIRequestContext, request as playwrightRequest } from "@playwright/test";
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
} from "./helpers";

test.skip(
  process.env.E2E_ALLOW_APPEND_ONLY_WRITES !== "1" && process.env.CI_LOCAL_STACK !== "1",
  "writes an append-only user_activity_log row; set E2E_ALLOW_APPEND_ONLY_WRITES=1 on a disposable project"
);

test.describe.configure({ mode: "serial" });

const db = adminClient();
const MARKER = `E2E feedback-rating ${Date.now()}`;
const NOTE = `Clear exercises, and the stretches helped ${Date.now()}`;

let patient: { id: string; email: string; name: string };
let completedId = "";
let upcomingId = "";
let noShowId = "";
let patientCtx: APIRequestContext;

function rate(ctx: APIRequestContext, data: Record<string, unknown>) {
  return ctx.post("/api/appointments/submit-patient-feedback", { data });
}

async function contextFor(email?: string) {
  return playwrightRequest.newContext({
    baseURL: BASE,
    extraHTTPHeaders: email ? { Cookie: await cookieHeaderFor(email) } : {},
  });
}

test.beforeAll(async () => {
  patient = await createFixtureAccount("feedback rating");
  const therapistId = await profileIdFor(db, QA_EMAILS.therapistA);
  const base = { patient_id: patient.id, therapist_id: therapistId, payment_status: "paid", duration_minutes: 30, visit_mode: "online" };
  completedId = await insertPastFixtureAppointment(db, { ...base, status: "completed", concern: `${MARKER} delivered` }, { daysAgo: 9 });
  noShowId = await insertPastFixtureAppointment(
    db,
    { ...base, status: "completed", no_show: true, concern: `${MARKER} no-show` },
    { daysAgo: 12 }
  );
  // Confirmed and still ahead: nothing to rate yet. A minute-precise slot,
  // so it cannot collide with a whole-hour fixture another spec holds.
  const ahead = new Date(Date.now() + 6 * 86_400_000);
  ahead.setSeconds(0, 0);
  const { data: upcoming, error } = await db
    .from("appointments")
    .insert({ ...base, status: "confirmed", slot_time: ahead.toISOString(), concern: `${MARKER} upcoming` })
    .select("id")
    .single();
  if (error || !upcoming) throw new Error(`could not seed the upcoming session: ${error?.message}`);
  upcomingId = upcoming.id;
  patientCtx = await contextFor(patient.email);
});

test.afterAll(async () => {
  await patientCtx?.dispose();
  await deleteFixtureAccount(patient?.id);
});

test("FR-001: only the patient's own completed session can be rated, once, with a bounded note", async () => {
  test.setTimeout(90_000);

  // Who is asking, before anything sent is looked at.
  const anon = await contextFor();
  try {
    expect((await rate(anon, { appointmentId: completedId, rating: 5 })).status()).toBe(403);
  } finally {
    await anon.dispose();
  }

  // Somebody else's session -- another patient, or the therapist who ran it
  // (whose own rating has its own route).
  for (const email of [QA_EMAILS.patientB, QA_EMAILS.therapistA]) {
    const ctx = await contextFor(email);
    try {
      const refused = await rate(ctx, { appointmentId: completedId, rating: 5, feedback: "not mine" });
      expect(refused.status(), `${email} rating the fixture patient's session`).toBe(403);
    } finally {
      await ctx.dispose();
    }
  }

  // The shape of a rating: a whole 1-5 and a note of at most 1,000 characters.
  for (const rating of [0, 6, 3.5, "5", null]) {
    const bad = await rate(patientCtx, { appointmentId: completedId, rating });
    expect(bad.status(), `rating ${JSON.stringify(rating)}`).toBe(400);
  }
  const long = await rate(patientCtx, { appointmentId: completedId, rating: 4, feedback: "x".repeat(1001) });
  expect(long.status()).toBe(400);
  expect((await rate(patientCtx, { rating: 4 })).status()).toBe(400);

  // Nothing to rate yet, and nothing to rate at all.
  const early = await rate(patientCtx, { appointmentId: upcomingId, rating: 5 });
  expect(early.status()).toBe(400);
  expect((await early.json()).error).toBe("This session isn't marked completed yet.");
  const noShow = await rate(patientCtx, { appointmentId: noShowId, rating: 1 });
  expect(noShow.status()).toBe(400);
  expect((await noShow.json()).error).toMatch(/no-show/);

  // None of the refusals wrote anything.
  const { data: untouched } = await db
    .from("appointments")
    .select("id, patient_rating, patient_feedback")
    .in("id", [completedId, upcomingId, noShowId]);
  for (const r of untouched ?? []) {
    expect(r.patient_rating, `appointment ${r.id} rated by a refused request`).toBeNull();
    expect(r.patient_feedback).toBeNull();
  }

  const ok = await rate(patientCtx, { appointmentId: completedId, rating: 4, feedback: `  ${NOTE}  ` });
  expect(ok.status(), await ok.text()).toBe(200);
  const { data: rated } = await db
    .from("appointments")
    .select("patient_rating, patient_feedback, patient_feedback_at")
    .eq("id", completedId)
    .single();
  expect(rated?.patient_rating).toBe(4);
  expect(rated?.patient_feedback, "stored trimmed").toBe(NOTE);
  expect(rated?.patient_feedback_at).toBeTruthy();

  // Once. A second tab cannot overwrite the first answer.
  const twice = await rate(patientCtx, { appointmentId: completedId, rating: 1, feedback: "changed my mind" });
  expect(twice.status()).toBe(400);
  expect((await twice.json()).error).toBe("You've already rated this session.");
  const { data: still } = await db.from("appointments").select("patient_rating").eq("id", completedId).single();
  expect(still?.patient_rating).toBe(4);

  // All Logs: the patient's own act, under their own role.
  await expect
    .poll(async () => {
      const { data } = await db
        .from("user_activity_log")
        .select("actor_role, action")
        .eq("appointment_id", completedId)
        .eq("action", "feedback.submitted");
      return data ?? [];
    })
    .toEqual([{ actor_role: "patient", action: "feedback.submitted" }]);
});

test("FR-002: the admin reads the rating and the note in the session drawer on the patient's Booking History", async ({ page }) => {
  test.setTimeout(90_000);
  await page.context().addCookies(await browserCookiesFor(QA_EMAILS.admin));
  await page.goto(`${BASE}/admin/dashboard/patients/${patient.id}`);
  await page
    .waitForFunction(() => !document.documentElement.hasAttribute("data-splash"), null, { timeout: 30_000 })
    .catch(() => {});

  const history = page.locator("h2:visible", { hasText: "Booking History" }).locator("xpath=..");
  const row = history.locator("li").filter({ hasText: `${MARKER} delivered` });
  await expect(row).toBeVisible({ timeout: 60_000 });
  // On the concern itself: the row's middle can be a control that keeps
  // the click to itself (the assign picker, the cash button).
  await row.getByText(`${MARKER} delivered`, { exact: true }).click();

  const drawer = page.getByRole("dialog").filter({ hasText: "Patient's rating" });
  await expect(drawer).toBeVisible();
  // Only the patient's side carries a score, so these are theirs.
  await expect(drawer.getByText("4.0", { exact: true })).toBeVisible();
  await expect(drawer.getByText(NOTE)).toBeVisible();
  await expect(drawer.getByText(patient.name).first()).toBeVisible();
  // The therapist has not rated this one, and the drawer says so rather
  // than leaving a gap.
  await expect(drawer.getByText(/Therapist's rating:\s*not rated yet/)).toBeVisible();
});
