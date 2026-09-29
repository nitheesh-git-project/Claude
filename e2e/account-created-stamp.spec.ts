// ACCOUNT-CREATED: when an account was made, with the time on it, on every
// screen that account has.
//
// `profiles.created_at` was rendered three ways and not at all in two places:
// the People directory carried the date *and* the time, the patient and
// therapist detail headers carried the date alone, and the Partners card and
// the Pending Approvals queue carried nothing -- although both of their
// queries had always selected the column. A date with no time answers
// "roughly when" and not "which of the two accounts this person made on
// Tuesday", which is the question an admin on the phone is holding.
//
// Driven as screens because none of this changes a route or a row: every one
// of these values was already in the page's own data, and the whole of the
// change is what a person can read.
import { test, expect, type Page } from "@playwright/test";
import { BASE, browserCookiesFor, QA_EMAILS, adminClient, profileIdFor } from "./helpers";

// A direct load of a detail URL renders the dashboard as well as the detail.
const SLOW = 240_000;

/** `12 Sept 2026, 6:00 pm IST` -- the date, a time, and the zone named.
 *
 *  Deliberately loose about the day and month (these are real seeded
 *  accounts, created whenever the fixtures were) and strict about the two
 *  things the change is: a clock time, and the zone beside it. */
const STAMP = /\d{1,2}\s+\w{3,9}\s+\d{4},\s*\d{1,2}:\d{2}\s*[ap]m\s+IST/i;

async function open(page: Page, url: string) {
  await page.goto(url);
  // The brand splash paints over the page until its own script clears this.
  await page
    .waitForFunction(() => !document.documentElement.hasAttribute("data-splash"), null, {
      timeout: 30_000,
    })
    .catch(() => {});
  await page.waitForLoadState("networkidle");
}

test.describe("account creation stamp", () => {
  test("ACS-001: a patient's profile header names the date and the time they joined", async ({
    page,
    context,
  }) => {
    test.setTimeout(SLOW);
    const admin = adminClient();
    const patientId = await profileIdFor(admin, QA_EMAILS.patientA);

    await context.addCookies(await browserCookiesFor(QA_EMAILS.admin));
    await open(page, `${BASE}/admin/dashboard/patients/${patientId}`);

    const joined = page.locator("p:visible").filter({ hasText: /^Joined / }).first();
    await expect(joined).toBeVisible({ timeout: 60_000 });
    await expect(joined).toHaveText(STAMP);
    await joined.scrollIntoViewIfNeeded();
    await page.screenshot({ path: "/tmp/account-created-01-patient-detail.png" });
  });

  test("ACS-002: a therapist's profile header does the same", async ({ page, context }) => {
    test.setTimeout(SLOW);
    const admin = adminClient();
    const therapistId = await profileIdFor(admin, QA_EMAILS.therapistA);

    await context.addCookies(await browserCookiesFor(QA_EMAILS.admin));
    await open(page, `${BASE}/admin/dashboard/therapists/${therapistId}`);

    const joined = page.locator("p:visible").filter({ hasText: /Joined / }).first();
    await expect(joined).toBeVisible({ timeout: 60_000 });
    await expect(joined).toHaveText(STAMP);
    await joined.scrollIntoViewIfNeeded();
    await page.screenshot({ path: "/tmp/account-created-02-therapist-detail.png" });
  });

  test("ACS-003: the People directory carries the time in both of its views", async ({
    page,
    context,
  }) => {
    test.setTimeout(SLOW);
    await context.addCookies(await browserCookiesFor(QA_EMAILS.admin));
    await open(page, `${BASE}/admin/dashboard?section=people&tab=patients`);

    // Grid is the default view, and prints the stamp under each card.
    // Note one selector per locator: `:visible` is a Playwright CSS
    // extension and does not resolve inside a comma-separated list.
    const card = page.locator("p:visible").filter({ hasText: /^Joined / }).first();
    await expect(card).toBeVisible({ timeout: 60_000 });
    await expect(card).toHaveText(STAMP);
    await card.scrollIntoViewIfNeeded();
    await page.screenshot({ path: "/tmp/account-created-03-directory-grid.png" });

    // The list view puts the same value in its own column.
    await page.getByRole("button", { name: "List", exact: true }).first().click();
    const cell = page.locator("td:visible").filter({ hasText: STAMP }).first();
    await expect(cell).toBeVisible({ timeout: 60_000 });
    await cell.scrollIntoViewIfNeeded();
    await page.screenshot({ path: "/tmp/account-created-03-directory-list.png" });
  });

  test("ACS-004: a partner hospital's card says when it was onboarded", async ({ page, context }) => {
    test.setTimeout(SLOW);
    await context.addCookies(await browserCookiesFor(QA_EMAILS.admin));
    await open(page, `${BASE}/admin/dashboard?section=people&tab=partners`);

    // The identity block is a labelled `<dl>` now rather than a run-on line, so
    // the stamp sits in the `<dd>` after the `Onboarded` label rather than in a
    // paragraph beginning with the word.
    const label = page.locator("dt:visible").filter({ hasText: /^Onboarded$/ }).first();
    await expect(label).toBeVisible({ timeout: 60_000 });
    const onboarded = label.locator("+ dd");
    await expect(onboarded).toHaveText(STAMP);
    await onboarded.scrollIntoViewIfNeeded();
    await page.screenshot({ path: "/tmp/account-created-04-partner.png" });
  });

  test("ACS-005: a patient reads their own account's creation on Edit Profile", async ({
    page,
    context,
  }) => {
    test.setTimeout(SLOW);
    await context.addCookies(await browserCookiesFor(QA_EMAILS.patientA));
    await open(page, `${BASE}/patient/dashboard/profile`);

    const note = page.locator("p:visible").filter({ hasText: /^Account created / }).first();
    await expect(note).toBeVisible({ timeout: 60_000 });
    await expect(note).toHaveText(STAMP);
    await page.screenshot({ path: "/tmp/account-created-05-patient-own.png" });
  });

  test("ACS-006: so does a therapist", async ({ page, context }) => {
    test.setTimeout(SLOW);
    await context.addCookies(await browserCookiesFor(QA_EMAILS.therapistA));
    await open(page, `${BASE}/therapist/dashboard/profile`);

    const note = page.locator("p:visible").filter({ hasText: /^Account created / }).first();
    await expect(note).toBeVisible({ timeout: 60_000 });
    await expect(note).toHaveText(STAMP);
    await page.screenshot({ path: "/tmp/account-created-06-therapist-own.png" });
  });

  // The one queue whose rows get more urgent the longer they sit, and the
  // one that had no date on it at all. It is normally empty on a seeded
  // database, so this walks a fixture therapist back through it: the flag is
  // flipped, the line read, and the flag put back in a `finally` -- an
  // afterAll would not run if the assertion threw mid-test.
  test("ACS-008: the approvals queue says when each applicant registered", async ({
    page,
    context,
  }) => {
    test.setTimeout(SLOW);
    const admin = adminClient();
    const therapistId = await profileIdFor(admin, QA_EMAILS.therapistC);
    const { error } = await admin
      .from("profiles")
      .update({ approved: false })
      .eq("id", therapistId);
    expect(error, `un-approving the fixture: ${error?.message ?? ""}`).toBeFalsy();

    try {
      await context.addCookies(await browserCookiesFor(QA_EMAILS.admin));
      await open(page, `${BASE}/admin/dashboard?section=today&tab=approvals`);

      const registered = page.locator("p:visible").filter({ hasText: /^Registered / }).first();
      await expect(registered).toBeVisible({ timeout: 60_000 });
      await expect(registered).toHaveText(STAMP);
      await registered.scrollIntoViewIfNeeded();
      await page.screenshot({ path: "/tmp/account-created-08-approvals.png" });
    } finally {
      await admin.from("profiles").update({ approved: true }).eq("id", therapistId);
    }
  });

  test("ACS-007: so does a partner hospital", async ({ page, context }) => {
    test.setTimeout(SLOW);
    await context.addCookies(await browserCookiesFor(QA_EMAILS.hospital));
    await open(page, `${BASE}/hospital/dashboard/profile`);

    const note = page.locator("p:visible").filter({ hasText: /^Account created / }).first();
    await expect(note).toBeVisible({ timeout: 60_000 });
    await expect(note).toHaveText(STAMP);
    await page.screenshot({ path: "/tmp/account-created-07-hospital-own.png" });
  });
});
