// The therapist's Done: it opens the session note with the Pain Map step,
// and saving that note is what finishes the session. The route refuses a
// therapist's Done without a note (and without a Pain Map update for this
// session), so the card can't be closed around the paperwork.
//
// Refusals only, like debug-clock.spec.ts: a successful completion writes
// append-only `session_settlements` rows this spec could not clean up.
import { test, expect, request, type APIRequestContext } from "@playwright/test";
import { BASE, QA_EMAILS, adminClient, browserCookiesFor, cookieHeaderFor, markDashboardTourSeen, pageUntilVisible, profileIdFor } from "./helpers";

const db = adminClient();
const MARKER = "E2E finish-session";
const HOUR = 60 * 60 * 1000;

let patientId: string;
let therapistId: string;
let therapist: APIRequestContext;

async function seed(slotMs: number, concern = MARKER) {
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
      concern,
    })
    .select("id")
    .single();
  if (error) throw new Error(`could not seed a session: ${error.message}`);
  return data.id as string;
}


/** Inserts a confirmed session for `patient` with therapist A in the first
 *  free hour `hoursAgo` offers -- earlier runs leave completed sessions that
 *  cannot be deleted, and both the patient and the therapist refuse a clash. */
async function seedInFreeHour(patient: string, concern: string, hoursAgo: number[]): Promise<string> {
  for (const h of hoursAgo) {
    const slot = new Date(Date.now() - h * HOUR);
    slot.setMinutes(0, 0, 0);
    const { data, error } = await db
      .from("appointments")
      .insert({
        patient_id: patient,
        therapist_id: therapistId,
        slot_time: slot.toISOString(),
        status: "confirmed",
        payment_status: "paid",
        duration_minutes: 30,
        visit_mode: "online",
        concern,
      })
      .select("id")
      .single();
    if (!error && data) return data.id as string;
  }
  throw new Error(`no free hour to seed ${concern}`);
}

test.beforeAll(async () => {
  patientId = await profileIdFor(db, QA_EMAILS.patientA);
  therapistId = await profileIdFor(db, QA_EMAILS.therapistA);
  await db.from("appointments").delete().like("concern", `${MARKER}%`).eq("status", "confirmed");
  await markDashboardTourSeen(QA_EMAILS.therapistA);
  therapist = await request.newContext({
    extraHTTPHeaders: { Cookie: await cookieHeaderFor(QA_EMAILS.therapistA) },
  });
});

test.beforeEach(async () => {
  await db.from("appointments").delete().like("concern", `${MARKER}%`).eq("status", "confirmed");
});

test.afterAll(async () => {
  await db.from("appointments").delete().like("concern", `${MARKER}%`).eq("status", "confirmed");
  await therapist?.dispose();
});

test("FS-001: a therapist's Done without a session note is refused", async () => {
  const id = await seed(Date.now() - HOUR);
  const res = await therapist.post(`${BASE}/api/appointments/complete-session`, { data: { appointmentId: id } });
  expect(res.status()).toBe(409);
  expect((await res.json()).code).toBe("note_required");
  const { data } = await db.from("appointments").select("status").eq("id", id).single();
  expect(data!.status).toBe("confirmed");
});

test("FS-002: Done before the start says so inline, with No Show still beside it", async ({ page }) => {
  await seed(Date.now() + 26 * HOUR, `${MARKER} future`);
  await page.context().addCookies(await browserCookiesFor(QA_EMAILS.therapistA));
  await page.goto(`${BASE}/therapist/dashboard/sessions`);
  const card = page.locator("div.rounded-xl", { hasText: `${MARKER} future` }).first();
  // Started sessions sit under Upcoming too now, so this one may be on a
  // later page of the list.
  expect(await pageUntilVisible(page, "sessions", card)).toBe(true);
  const done = card.getByRole("button", { name: "Done", exact: true });
  await done.click();
  await expect(card.getByText("This session hasn't started yet.")).toBeVisible();
  const noShow = card.getByRole("button", { name: /no.?show/i });
  const [d, n] = [await done.boundingBox(), await noShow.boundingBox()];
  expect(Math.abs(d!.y - n!.y)).toBeLessThan(4);
  expect(n!.x - (d!.x + d!.width)).toBeLessThan(24);
  await card.screenshot({ path: "test-results/finish-session-not-yet.png" });
});

test("FS-003: Done on a started session opens the note with the Pain Map step", async ({ page }) => {
  await seed(Date.now() - HOUR);
  await page.context().addCookies(await browserCookiesFor(QA_EMAILS.therapistA));
  await page.goto(`${BASE}/therapist/dashboard/sessions`);
  // A session under way stays under Upcoming until it is finished
  // (src/lib/sessionBucket.ts), so it is on the default tab.
  const card = page.locator("div.rounded-xl", { hasText: MARKER }).first();
  expect(await pageUntilVisible(page, "sessions", card)).toBe(true);
  await card.getByRole("button", { name: "Done", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Finish session · write the note")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Update the Pain Map" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: /Save note & finish session/ })).toBeVisible();
  await dialog.screenshot({ path: "test-results/finish-session-dialog.png" });
});

// Only an orthopaedic chart has a Pain Map, so a neuro patient's session
// finishes on the note alone. A successful finish writes append-only
// settlement rows, so this runs on a disposable project only.
test("FS-004: a neuro patient's session finishes without a Pain Map", async () => {
  test.skip(
    process.env.E2E_ALLOW_APPEND_ONLY_WRITES !== "1" && process.env.CI_LOCAL_STACK !== "1",
    "completing a session writes append-only rows"
  );
  const neuroPatient = await profileIdFor(db, "qa.patient.e@example.test");
  const { error: profileError } = await db
    .from("patient_condition_profiles")
    .upsert({ patient_id: neuroPatient, specialty: "neuro", status: "active" }, { onConflict: "patient_id" });
  expect(profileError, profileError?.message).toBeNull();
  const appt = { id: await seedInFreeHour(neuroPatient, `${MARKER} neuro`, [2, 3, 4, 5, 6, 7, 8, 9, 10, 11]) };
  const note = await therapist.post(`${BASE}/api/therapist/session-notes/submit`, {
    data: {
      appointmentId: appt.id,
      data: { treated: "Gait training", response: "Improved", next_plan: "Progress balance work" },
      freeText: "",
      baseUpdatedAt: null,
    },
  });
  expect(note.status(), await note.text()).toBe(200);
  const done = await therapist.post(`${BASE}/api/appointments/complete-session`, { data: { appointmentId: appt.id } });
  expect(done.status(), await done.text()).toBe(200);
});

test("FS-005: an orthopaedic patient's Done still needs this session's Pain Map", async () => {
  test.skip(
    process.env.E2E_ALLOW_APPEND_ONLY_WRITES !== "1" && process.env.CI_LOCAL_STACK !== "1",
    "writes an append-only session note"
  );
  // Patient C has no specialty on file, which reads as orthopaedic, and no
  // Pain Map reading from this therapist in the window.
  const orthoPatient = await profileIdFor(db, "qa.patient.c@example.test");
  const appt = { id: await seedInFreeHour(orthoPatient, `${MARKER} ortho`, [20, 19, 18, 17, 16, 15, 14, 13, 12]) };
  const note = await therapist.post(`${BASE}/api/therapist/session-notes/submit`, {
    data: {
      appointmentId: appt.id,
      data: { treated: "Lumbar mobilisation", response: "Improved", next_plan: "Progress loading" },
      freeText: "",
      baseUpdatedAt: null,
    },
  });
  expect(note.status(), await note.text()).toBe(200);
  const done = await therapist.post(`${BASE}/api/appointments/complete-session`, { data: { appointmentId: appt.id } });
  expect(done.status()).toBe(409);
  expect((await done.json()).code).toBe("pain_map_required");
});
