// ADMIN-PROFILE-ORDER: a person's session list reads as a timeline.
//
// Admin -> People -> a patient or a therapist ordered its session list by
// `created_at` -- when the booking row was written, which is also the order
// `session_code` is handed out in, so the list read as being sorted by session
// ID. A session rescheduled to next month stayed wherever it was first booked.
//
// Driven as a screen because nothing here changes a route or a row: both
// queries answer exactly as they did, and the order is only visible to
// somebody reading the page. The fixtures are built with their creation order
// deliberately **reversed** against their slot order, so the old behaviour and
// the new one cannot produce the same list.
import { test, expect, type Page } from "@playwright/test";
import { BASE, browserCookiesFor, QA_EMAILS, adminClient, profileIdFor } from "./helpers";

// A direct load of a detail URL renders the dashboard as well as the detail.
const SLOW = 240_000;

const MARKER = "ZZ QA session order";
const DAY = 86_400_000;

/** The four rows, in the order the screen must show them.
 *
 *  `created_at` runs the other way on purpose, and the undated row is the
 *  newest-created of the lot -- so under the old `created_at desc` ordering
 *  this list came out exactly backwards. */
const ROWS = [
  { tag: "A-furthest", slotDays: 30, createdDaysAgo: 40, status: "confirmed" },
  { tag: "B-soon", slotDays: 10, createdDaysAgo: 30, status: "confirmed" },
  { tag: "C-past", slotDays: -20, createdDaysAgo: 20, status: "completed" },
  { tag: "D-undated", slotDays: null, createdDaysAgo: 10, status: "requested" },
] as const;

function slotFor(days: number) {
  const d = new Date(Date.now() + days * DAY);
  d.setHours(14, 0, 0, 0);
  return d.toISOString();
}

async function seed(admin: ReturnType<typeof adminClient>, patientId: string, therapistId: string) {
  const ids: string[] = [];
  for (const row of ROWS) {
    const { data, error } = await admin
      .from("appointments")
      .insert({
        patient_id: patientId,
        therapist_id: therapistId,
        slot_time: row.slotDays === null ? null : slotFor(row.slotDays),
        created_at: new Date(Date.now() - row.createdDaysAgo * DAY).toISOString(),
        status: row.status,
        payment_status: row.status === "requested" ? "unpaid" : "paid",
        concern: `${MARKER} ${row.tag}`,
        duration_minutes: 45,
        amount_paid_paise: row.status === "requested" ? null : 120000,
        timezone: "Asia/Kolkata",
      })
      .select("id")
      .single();
    expect(error, `seeding ${row.tag}: ${error?.message ?? ""}`).toBeFalsy();
    if (data?.id) ids.push(data.id);
  }
  expect(ids, "all four fixtures seeded").toHaveLength(ROWS.length);
  return ids;
}

/** The rows of one named section's list, visible copy only.
 *
 *  Scoped to the card the heading sits in, for two reasons: every admin screen
 *  stays mounted behind `hidden`, so an unscoped locator matches the copy
 *  nobody can see -- and a paid fixture session also appears under Payment
 *  History and Profit Breakdown on the patient page, which are deliberately
 *  still ordered by when the money moved. */
function sectionRows(page: Page, heading: string) {
  return page
    .locator("h2:visible", { hasText: heading })
    .locator("xpath=..")
    .locator("li")
    .filter({ hasText: MARKER });
}

/** Puts the section's own list on screen, so a screenshot is evidence of the
 *  order rather than of the top of the panel. */
async function showSection(page: Page, heading: string) {
  await sectionRows(page, heading).first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
}

/** Where each fixture row sits in that section's list. */
async function positionsOf(page: Page, heading: string) {
  const rows = sectionRows(page, heading);
  await expect(rows).toHaveCount(ROWS.length, { timeout: 60_000 });
  const texts = await rows.allInnerTexts();
  return ROWS.map((row) => texts.findIndex((t) => t.includes(`${MARKER} ${row.tag}`)));
}

async function openDashboard(page: Page, url: string) {
  await page.goto(url);
  // The brand splash paints over the page until its own script clears this.
  await page
    .waitForFunction(() => !document.documentElement.hasAttribute("data-splash"), null, {
      timeout: 30_000,
    })
    .catch(() => {});
  await page.waitForLoadState("networkidle");
}

test.describe("admin profile session order", () => {
  test("PSO-001: a patient's Booking History runs by session date, newest first", async ({
    page,
    context,
  }) => {
    test.setTimeout(SLOW);
    const admin = adminClient();
    const patientId = await profileIdFor(admin, QA_EMAILS.patientA);
    const therapistId = await profileIdFor(admin, QA_EMAILS.therapistA);
    const ids = await seed(admin, patientId, therapistId);

    try {
      await context.addCookies(await browserCookiesFor(QA_EMAILS.admin));
      await openDashboard(page, `${BASE}/admin/dashboard/patients/${patientId}`);

      const positions = await positionsOf(page, "Booking History");
      expect(positions.every((p) => p >= 0), `every fixture row rendered: ${positions}`).toBe(true);
      // Furthest future, then soon, then past, then the one with no slot.
      expect(positions, `order was ${positions}`).toEqual([...positions].sort((a, b) => a - b));
      await showSection(page, "Booking History");
      await page.screenshot({ path: "/tmp/session-order-01-patient.png" });
    } finally {
      if (ids.length) await admin.from("appointments").delete().in("id", ids);
    }
  });

  test("PSO-002: a therapist's Assigned Sessions read the same way, and an undated session is last", async ({
    page,
    context,
  }) => {
    test.setTimeout(SLOW);
    const admin = adminClient();
    const patientId = await profileIdFor(admin, QA_EMAILS.patientA);
    const therapistId = await profileIdFor(admin, QA_EMAILS.therapistA);
    const ids = await seed(admin, patientId, therapistId);

    try {
      await context.addCookies(await browserCookiesFor(QA_EMAILS.admin));
      await openDashboard(page, `${BASE}/admin/dashboard/therapists/${therapistId}`);

      const positions = await positionsOf(page, "Assigned Sessions");
      expect(positions.every((p) => p >= 0), `every fixture row rendered: ${positions}`).toBe(true);
      expect(positions, `order was ${positions}`).toEqual([...positions].sort((a, b) => a - b));

      // The undated row is last of the four, although it is the newest-created
      // -- "nulls last", which is what keeps the dated run contiguous.
      const undated = sectionRows(page, "Assigned Sessions").filter({ hasText: "D-undated" }).first();
      await expect(undated).toContainText("Slot to be confirmed");
      expect(positions[3]).toBe(Math.max(...positions));
      await showSection(page, "Assigned Sessions");
      await page.screenshot({ path: "/tmp/session-order-02-therapist.png" });
    } finally {
      if (ids.length) await admin.from("appointments").delete().in("id", ids);
    }
  });

  test("PSO-003: the overlay reached by tapping a name shows the same order as the direct URL", async ({
    page,
    context,
  }) => {
    test.setTimeout(SLOW);
    const admin = adminClient();
    const patientId = await profileIdFor(admin, QA_EMAILS.patientA);
    const therapistId = await profileIdFor(admin, QA_EMAILS.therapistA);
    const ids = await seed(admin, patientId, therapistId);

    try {
      await context.addCookies(await browserCookiesFor(QA_EMAILS.admin));
      await openDashboard(page, `${BASE}/admin/dashboard?section=people&tab=therapists`);
      await page.locator("p:visible").filter({ hasText: "QA Therapist A" }).first().click();

      const positions = await positionsOf(page, "Assigned Sessions");
      expect(positions.every((p) => p >= 0), `every fixture row rendered: ${positions}`).toBe(true);
      expect(positions, `order was ${positions}`).toEqual([...positions].sort((a, b) => a - b));
      await showSection(page, "Assigned Sessions");
      await page.screenshot({ path: "/tmp/session-order-03-overlay.png" });
    } finally {
      if (ids.length) await admin.from("appointments").delete().in("id", ids);
    }
  });
});
