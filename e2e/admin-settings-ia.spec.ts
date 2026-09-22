// Suite CFG -- the shape of Settings, and the settings that reach a feature.
//
// Settings had grown to nine screens in one flat list, with three things on
// it that an audit found were not settings problems but product ones:
//
//  * two sign-out rules sat on **Booking Rules**, whose own header promises
//    "when a patient may book, cancel, and join a video session";
//  * a data-migration cutover ("which record the app trusts for a patient's
//    remaining sessions") sat between two rules about how a programme is
//    sold, with help text sending the reader to System Health to decide it;
//  * the Clinical Questions screen printed 27 storage keys -- `chief_complaint`,
//    `rom`, `special_test` -- as the label above each box.
//
// And one that no amount of reading the settings screen could have caught:
// `/book` filtered its own calendar on the hardcoded twelve-hour lead time
// while `/api/appointments/create` had read the admin setting since it became
// one. A clinic that widened its window was offered a slot by its own picker
// and had the booking refused at the last step of checkout.
//
// Unit tests hold the first three at the module level (adminNav, painMap).
// What only a browser can show is that the screens are wired to them, that
// the moved controls moved, and -- CFG-005 -- that a number typed into
// Settings changes which dates a patient is offered.
import { test, expect, type Page } from "@playwright/test";
import { BASE, QA_EMAILS, adminClient, browserCookiesFor } from "./helpers";

const SETTINGS = `${BASE}/admin/dashboard?section=settings`;

/** Only what is on screen: AdminShell keeps every screen mounted behind
 *  `hidden`, so a bare getByText matches controls on screens nobody opened. */
function onScreen(page: Page, text: string | RegExp) {
  return page.getByText(text).filter({ visible: true });
}

async function openSettings(page: Page, tab: string) {
  await page.goto(`${SETTINGS}&tab=${tab}`, { waitUntil: "domcontentloaded" });
  await expect(page.locator("h1")).toContainText("Settings", { timeout: 60_000 });
}

async function readSetting<T>(column: string): Promise<T> {
  const { data } = await adminClient().from("site_settings").select(column).maybeSingle();
  return (data as Record<string, T> | null)?.[column] as T;
}

test.describe("CFG -- Settings information architecture", () => {
  test.beforeEach(async ({ context }) => {
    await context.addCookies(await browserCookiesFor(QA_EMAILS.admin));
  });

  test("CFG-001 the sidebar groups the ten screens under four captions", async ({ page }) => {
    await openSettings(page, "brand");
    // Sentence case in the DOM; the uppercase is CSS, and innerText would
    // report the transformed text -- so match the source casing.
    for (const caption of ["Your website", "How the clinic runs", "Who gets in", "Technical"]) {
      await expect(onScreen(page, caption).first()).toBeVisible();
    }
    for (const label of [
      "Brand & Contact",
      "Public Site",
      "Booking Rules",
      "Offers & Discounts",
      "Programmes & Home Visits",
      "Clinical Questions",
      "User Access",
      "Sign-in & Security",
      "System Health",
      "Advanced",
    ]) {
      await expect(onScreen(page, label).first()).toBeVisible();
    }
  });

  test("CFG-002 the sign-out rules are on Sign-in & Security, not Booking Rules", async ({
    page,
  }) => {
    await openSettings(page, "security");
    const timeout = page.getByLabel("Session timeout of inactivity, in minutes");
    await expect(timeout).toBeVisible();
    await expect(onScreen(page, "Sign-out message")).toBeVisible();

    await openSettings(page, "booking");
    // Scoped to the visible screen: the control still exists in the DOM on
    // the hidden Sign-in & Security screen, which is the point of `onScreen`.
    await expect(onScreen(page, "Sign out after inactivity")).toHaveCount(0);
    await expect(onScreen(page, "Sign-out message")).toHaveCount(0);
  });

  test("CFG-003 the session-balance cutover is quarantined on Advanced", async ({ page }) => {
    await openSettings(page, "programmes");
    await expect(onScreen(page, /remaining sessions are counted/)).toHaveCount(0);

    await openSettings(page, "advanced");
    await expect(onScreen(page, "These do not change what the clinic sells")).toBeVisible();

    const before = await readSetting<boolean>("entitlement_ledger_authoritative");
    const toggle = page.getByRole("button", { name: before ? "Session history" : "Running total" });
    await toggle.click();
    await expect
      .poll(() => readSetting<boolean>("entitlement_ledger_authoritative"), { timeout: 20_000 })
      .toBe(!before);
    // Put it back: this switch decides which number every balance surface
    // shows, so a spec must not leave it moved.
    await page
      .getByRole("button", { name: !before ? "Session history" : "Running total" })
      .click();
    await expect
      .poll(() => readSetting<boolean>("entitlement_ledger_authoritative"), { timeout: 20_000 })
      .toBe(before);
  });

  test("CFG-004 Clinical Questions names its questions, never their storage keys", async ({
    page,
  }) => {
    await openSettings(page, "clinical");
    await expect(onScreen(page, "Main issue").first()).toBeVisible();
    const body = await page.locator("main").innerText();
    for (const key of [
      "chief_complaint",
      "since_when",
      "area_pain",
      "rest_pain",
      "special_test",
      "movement_note",
    ]) {
      expect(body, `storage key "${key}" is on screen`).not.toContain(key);
    }
    // The exam questions are grouped the way the clinician who answers them
    // sees them, rather than listed twenty deep.
    await expect(onScreen(page, "What they describe").first()).toBeVisible();
    await expect(onScreen(page, "Your findings").first()).toBeVisible();
  });

  test("CFG-005 the booking lead time reaches the patient's own picker", async ({
    page,
    context,
  }) => {
    const db = adminClient();
    const original = await readSetting<number>("online_booking_lead_time_hours");
    try {
      await openSettings(page, "booking");
      await page.getByLabel("Online booking lead time, in hours").fill("72");
      await page.getByRole("button", { name: "Save" }).first().click();
      await expect
        .poll(() => readSetting<number>("online_booking_lead_time_hours"), { timeout: 20_000 })
        .toBe(72);

      // A patient's own session, on the page the setting is about.
      const patient = await context.browser()!.newContext();
      await patient.addCookies(await browserCookiesFor(QA_EMAILS.patientA));
      const book = await patient.newPage();
      await book.goto(`${BASE}/book`, { waitUntil: "domcontentloaded" });
      // The note under "Preferred Date" quotes the rule in force, and the
      // calendar filters on the same value -- it printed the constant and
      // filtered on the constant before this.
      await expect(book.getByText(/at least 72 hours from now/)).toBeVisible({ timeout: 60_000 });
      const openDays = await book
        .locator("button:not([disabled])")
        .filter({ hasText: /^\d{1,2}$/ })
        .allInnerTexts();

      await db.from("site_settings").update({ online_booking_lead_time_hours: 12 }).eq("id", true);
      await book.reload({ waitUntil: "domcontentloaded" });
      await expect(book.getByText(/at least 12 hours from now/)).toBeVisible({ timeout: 60_000 });
      const nearerDays = await book
        .locator("button:not([disabled])")
        .filter({ hasText: /^\d{1,2}$/ })
        .allInnerTexts();

      expect(nearerDays.length).toBeGreaterThan(openDays.length);
      await patient.close();
    } finally {
      await db
        .from("site_settings")
        .update({ online_booking_lead_time_hours: original })
        .eq("id", true);
    }
  });

  test("CFG-006 a cutoff that swallows the grace period says so", async ({ page }) => {
    await openSettings(page, "booking");
    const warning = onScreen(page, /none of it can be used/);
    await expect(warning).toHaveCount(0);
    // Typed, not saved: the warning is about the combination being chosen,
    // and it has to appear while the owner is still deciding.
    await page.getByLabel("Session Completed cutoff, in minutes after slot time").fill("5");
    await expect(warning.first()).toBeVisible();
    await page.getByLabel("Session Completed cutoff, in minutes after slot time").fill("60");
    await expect(warning).toHaveCount(0);
  });

  test("CFG-007 a limited desk reaches none of it, at the screen or the route", async ({
    browser,
  }) => {
    for (const email of [
      "qa.admin.ops@example.test",
      "qa.admin.finance@example.test",
      "qa.admin.clinical@example.test",
    ]) {
      const ctx = await browser.newContext();
      await ctx.addCookies(await browserCookiesFor(email));
      const page = await ctx.newPage();
      await page.goto(`${SETTINGS}&tab=advanced`, { waitUntil: "domcontentloaded" });
      await expect(page.locator("h1")).toBeVisible({ timeout: 60_000 });
      await expect(onScreen(page, "These do not change what the clinic sells")).toHaveCount(0);
      const status = await page.evaluate(async () => {
        const r = await fetch("/api/admin/update-setting", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: "entitlement_ledger_authoritative", value: true }),
        });
        return r.status;
      });
      expect(status, `${email} may not write a setting`).toBe(403);
      await ctx.close();
    }
  });
});
