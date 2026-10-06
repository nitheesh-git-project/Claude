// The therapist's Done: it opens the session note with the Pain Map step,
// and saving that note is what finishes the session. The route refuses a
// therapist's Done without a note (and without a Pain Map update for this
// session), so the card can't be closed around the paperwork.
//
// Refusals only, like debug-clock.spec.ts: a successful completion writes
// append-only `session_settlements` rows this spec could not clean up.
import { test, expect, request, type APIRequestContext } from "@playwright/test";
import { BASE, QA_EMAILS, adminClient, browserCookiesFor, cookieHeaderFor, markDashboardTourSeen, profileIdFor } from "./helpers";

const db = adminClient();
const MARKER = "E2E finish-session";
const HOUR = 60 * 60 * 1000;

let patientId: string;
let therapistId: string;
let therapist: APIRequestContext;

async function seed(slotMs: number) {
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

test.beforeAll(async () => {
  patientId = await profileIdFor(db, QA_EMAILS.patientA);
  therapistId = await profileIdFor(db, QA_EMAILS.therapistA);
  await db.from("appointments").delete().eq("concern", MARKER);
  await markDashboardTourSeen(QA_EMAILS.therapistA);
  therapist = await request.newContext({
    extraHTTPHeaders: { Cookie: await cookieHeaderFor(QA_EMAILS.therapistA) },
  });
});

test.beforeEach(async () => {
  await db.from("appointments").delete().eq("concern", MARKER);
});

test.afterAll(async () => {
  await db.from("appointments").delete().eq("concern", MARKER);
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
  await seed(Date.now() + 26 * HOUR);
  await page.context().addCookies(await browserCookiesFor(QA_EMAILS.therapistA));
  await page.goto(`${BASE}/therapist/dashboard/sessions`);
  const card = page.locator("div.rounded-xl", { hasText: MARKER }).first();
  await expect(card).toBeVisible();
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
  // A session under way has passed its start, so it is listed under Past.
  await page.getByRole("button", { name: /^Past/ }).click();
  const card = page.locator("div.rounded-xl", { hasText: MARKER }).first();
  await card.getByRole("button", { name: "Done", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Finish session · write the note")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Update the Pain Map" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: /Save note & finish session/ })).toBeVisible();
  await dialog.screenshot({ path: "test-results/finish-session-dialog.png" });
});
