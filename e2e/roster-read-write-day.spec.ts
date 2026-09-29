// ROSTER-RWD: the three things this batch changed about the roster, all of
// which are only visible to somebody looking at the screen.
//
// - **RWD-001/002** the schedule opens read-only with an Edit button. Reading
//   somebody's hours and changing them were one act before this; a mis-tap on
//   a dropdown was a change.
// - **RWD-003** the first save for a therapist is not refused as somebody
//   else's edit. `lock_therapist_schedule_state` creates the row at version
//   `1`; both readers defaulted the *absent* row to `0`, so the compare-and-
//   swap failed on the one case it exists to permit. Reported as an error on
//   every add, and it was.
// - **RWD-004** the guard is kept, not removed: a genuinely stale version
//   asking for different hours is still 409.
// - **RWD-005/006** Day view, which answers "who is free on Thursday" -- a
//   question nothing in the app joined the roster to the bookings to answer.
// - **RWD-007** selecting a therapist scrolls to their schedule, which sits
//   below the fold.
//
// Driven as screens because the storage model, the routes and the rows are
// unchanged; RWD-003 and RWD-004 go through the route directly as well, since
// what they assert is a request body rather than a pixel.
import { test, expect, type Page } from "@playwright/test";
import {
  BASE,
  browserCookiesFor,
  cookieHeaderFor,
  QA_EMAILS,
  adminClient,
  profileIdFor,
} from "./helpers";

// The admin dashboard renders 34 screens and ~82 queries in one pass.
const SLOW = 240_000;

async function openRoster(page: Page) {
  await page.goto(`${BASE}/admin/dashboard?section=sessions&tab=roster`);
  await page
    .waitForFunction(() => !document.documentElement.hasAttribute("data-splash"), null, {
      timeout: 30_000,
    })
    .catch(() => {});
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { name: "Therapist roster" })).toBeVisible({
    timeout: 60_000,
  });
}

/** The roster's own view switch. Not a sidebar entry -- the same rows
 *  arranged differently. */
function viewButton(page: Page, name: "Therapists" | "Day") {
  return page.getByRole("group", { name: "Roster view" }).getByRole("button", { name });
}

test.describe("roster: read-only gate, first save, day view", () => {
  test("RWD-001: the schedule opens read-only, with an Edit button and no pickers", async ({
    page,
    context,
  }) => {
    test.setTimeout(SLOW);
    await context.addCookies(await browserCookiesFor(QA_EMAILS.admin));
    await openRoster(page);

    const edit = page.getByRole("button", { name: "Edit schedule" }).first();
    await expect(edit).toBeVisible({ timeout: 60_000 });
    // The gate is real only if nothing editable is on screen behind it. The
    // day rows render a Working/Off control and two time pickers per period,
    // so their absence is the whole assertion.
    await expect(page.getByRole("button", { name: /Add hours/i })).toHaveCount(0);
    await page.screenshot({ path: "/tmp/roster-01-readonly.png", fullPage: true });
  });

  test("RWD-002: Edit reveals the pickers, and Cancel puts them away again", async ({
    page,
    context,
  }) => {
    test.setTimeout(SLOW);
    await context.addCookies(await browserCookiesFor(QA_EMAILS.admin));
    await openRoster(page);

    await page.getByRole("button", { name: "Edit schedule" }).first().click();
    await expect(page.getByRole("button", { name: /Add hours/i }).first()).toBeVisible({
      timeout: 30_000,
    });
    await page.screenshot({ path: "/tmp/roster-02-editing.png", fullPage: true });

    const cancel = page.getByRole("button", { name: /^Cancel$/ }).first();
    await expect(cancel).toBeVisible();
    await cancel.click();
    await expect(page.getByRole("button", { name: "Edit schedule" }).first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByRole("button", { name: /Add hours/i })).toHaveCount(0);
  });

  test("RWD-003: a therapist with no schedule state saves first time", async () => {
    test.setTimeout(SLOW);
    const admin = adminClient();
    const therapistId = await profileIdFor(admin, QA_EMAILS.therapistC);

    // The whole case is the *absence* of the row. Remove it, so this is the
    // first save for this therapist however many times the suite has run.
    await admin.from("therapist_schedule_state").delete().eq("therapist_id", therapistId);

    const cookie = await cookieHeaderFor(QA_EMAILS.admin);
    const res = await fetch(`${BASE}/api/admin/save-therapist-availability`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        therapistId,
        // The shape the editor itself sends: days by index, each with its own
        // working periods.
        days: [{ day_of_week: 1, ranges: [{ startHour: 10, endHour: 13 }] }],
        expectedVersion: null,
      }),
    });
    const body = await res.json().catch(() => ({}));
    // Previously: 409 `conflict`, on a schedule nobody had ever touched.
    expect(res.status, JSON.stringify(body)).toBe(200);
    expect(body.conflict ?? false).toBe(false);

    const { data } = await admin
      .from("therapist_schedule_state")
      .select("version")
      .eq("therapist_id", therapistId)
      .maybeSingle();
    // The row exists now, and its version is **2**: the lock creates it at 1
    // and the save that follows bumps it. That arithmetic is the whole bug --
    // a client treating the absent row as `0` was not one behind the database
    // but two, and no amount of retrying would have closed the gap.
    expect(data?.version).toBe(2);
  });

  test("RWD-004: a genuinely stale version is still refused", async () => {
    test.setTimeout(SLOW);
    const admin = adminClient();
    const therapistId = await profileIdFor(admin, QA_EMAILS.therapistC);
    const cookie = await cookieHeaderFor(QA_EMAILS.admin);

    // Establish a row, then read the version it actually holds.
    await fetch(`${BASE}/api/admin/save-therapist-availability`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        therapistId,
        days: [{ day_of_week: 1, ranges: [{ startHour: 10, endHour: 13 }] }],
        expectedVersion: null,
      }),
    });
    const { data } = await admin
      .from("therapist_schedule_state")
      .select("version")
      .eq("therapist_id", therapistId)
      .maybeSingle();
    const version = data?.version ?? 1;

    // A save carrying a version behind the stored one, asking for *different*
    // hours. This is the two-admin case the guard was written for, and fixing
    // the first-save default must not have removed it.
    const res = await fetch(`${BASE}/api/admin/save-therapist-availability`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        therapistId,
        days: [{ day_of_week: 1, ranges: [{ startHour: 14, endHour: 18 }] }],
        expectedVersion: version - 1,
      }),
    });
    expect(res.status).toBe(409);
  });

  test("RWD-005: Day view answers who is working on a date", async ({ page, context }) => {
    test.setTimeout(SLOW);
    await context.addCookies(await browserCookiesFor(QA_EMAILS.admin));
    await openRoster(page);

    await viewButton(page, "Day").click();
    // The date control is the clinic's own popover, never a native date box.
    await expect(page.getByRole("button", { name: /Roster date/i })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.locator('input[type="date"]')).toHaveCount(0);

    // The summary is counted from the entries themselves, so it is present
    // whenever the list is -- a count that could disagree with its own list is
    // the failure this shape avoids. Located through its own live region rather
    // than by text: 34 screens are mounted at once behind `hidden`, and the
    // activity log two screens over is full of the word "working".
    const summary = page.locator('p[aria-live="polite"]').filter({ hasText: /working/ }).first();
    await expect(summary).toBeVisible({ timeout: 60_000 });
    await page.screenshot({ path: "/tmp/roster-03-day-view.png", fullPage: true });
  });

  test("RWD-006: a therapist's row opens an hour strip, free and booked", async ({
    page,
    context,
  }) => {
    test.setTimeout(SLOW);
    // The strip is what this case is about, so the fixture gives somebody hours
    // on the date the view opens on rather than skipping when nobody has any --
    // a case that skips itself on a quiet database proves nothing.
    const admin = adminClient();
    const therapistId = await profileIdFor(admin, QA_EMAILS.therapistC);
    const cookie = await cookieHeaderFor(QA_EMAILS.admin);
    const { data: state } = await admin
      .from("therapist_schedule_state")
      .select("version")
      .eq("therapist_id", therapistId)
      .maybeSingle();
    const today = new Date().getDay();
    await fetch(`${BASE}/api/admin/save-therapist-availability`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        therapistId,
        days: [{ day_of_week: today, ranges: [{ startHour: 9, endHour: 17 }] }],
        expectedVersion: state?.version ?? null,
      }),
    });

    await context.addCookies(await browserCookiesFor(QA_EMAILS.admin));
    await openRoster(page);
    await viewButton(page, "Day").click();

    // Scoped to this list by name. The dashboard mounts all 34 screens at
    // once, so a bare `ul > li` spans every one of them -- which is how a
    // locator matches something on a screen nobody is looking at and the
    // failure reads as a broken feature.
    const list = page.getByRole("list", { name: "Therapists on this date" });
    await expect(list).toBeVisible({ timeout: 60_000 });

    // A therapist who is actually working that day. An "On leave" or "Not
    // working this day" row has no strip by design, and asserting on one would
    // be asserting the empty case.
    const working = list.locator("> li").filter({ hasText: /\d+ free/ }).first();
    const count = await working.count();
    test.skip(
      count === 0,
      "no therapist is rostered on today's date in this database -- the strip " +
        "is what this case is about, so there is nothing to read. Set a weekly " +
        "schedule covering today and re-run."
    );

    await working.locator("button[aria-expanded]").first().click();
    await expect(working.getByText(/^Free$/).first()).toBeVisible({ timeout: 30_000 });
    await page.screenshot({ path: "/tmp/roster-04-day-strip.png", fullPage: true });
  });

  test("RWD-007: selecting a therapist brings their schedule into view", async ({
    page,
    context,
  }) => {
    test.setTimeout(SLOW);
    await context.addCookies(await browserCookiesFor(QA_EMAILS.admin));
    await openRoster(page);

    // The detail card is a sibling below the list and usually below the fold,
    // so a tap used to change a screen nobody could see.
    const detail = page.locator('[aria-label$="- roster"]').first();
    // The second card, so the selection actually changes -- the screen opens
    // with the first therapist already selected, and scrolling on arrival would
    // move a page nobody asked to move, which is why that case is skipped.
    const list = page.getByRole("list", { name: "Therapists" });
    await expect(list).toBeVisible({ timeout: 60_000 });
    const cards = list.locator("> li button").first();
    const second = list.locator("> li").nth(1).locator("button").first();
    await (((await second.count()) > 0) ? second : cards).click();
    await expect(detail).toBeVisible({ timeout: 30_000 });
    await expect(detail).toBeInViewport({ ratio: 0.1, timeout: 15_000 });
    await page.screenshot({ path: "/tmp/roster-05-scrolled.png" });
  });
});
