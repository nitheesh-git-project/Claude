// PARTNERS-CRED: the back-office layout and credential fixes in this batch,
// all of which are visible only to somebody reading the screen.
//
// - **PC-001** a B2B lead's captured fields are labelled rows, and the enquiry
//   keeps the line breaks the enquirer typed. `b2b_leads.org_details` is
//   written by a textarea on the public `/hospitals` page and the card rendered
//   it inline, so every newline was lost -- data gone on the screen the clinic
//   decides whether to onboard somebody from.
// - **PC-002** the Hospital Partners card reads as a record rather than a
//   run-on line.
// - **PC-003** Onboard as Hospital is a labelled grid, and its share field
//   states what the clinic keeps.
// - **PC-004/005** the created-account panel closes, its Copy button stops
//   reading "Copied" for ever, and Reset password exists on a back-office row
//   -- never on your own.
// - **PC-006** New Booking fills the width the header does.
import { test, expect, type Page } from "@playwright/test";
import { BASE, browserCookiesFor, QA_EMAILS, adminClient } from "./helpers";

const SLOW = 240_000;

/** Its own marker so the row can be found and removed again, per the rule that
 *  a spec registers and deletes what it inserts. */
const LEAD_NAME = "E2E Layout Lead";
const LEAD_DETAILS = "First line of the enquiry.\nSecond line.\nThird line.";

async function openScreen(page: Page, section: string, tab: string) {
  await page.goto(`${BASE}/admin/dashboard?section=${section}&tab=${tab}`);
  await page
    .waitForFunction(() => !document.documentElement.hasAttribute("data-splash"), null, {
      timeout: 30_000,
    })
    .catch(() => {});
  await page.waitForLoadState("networkidle");
}

test.describe("partner surfaces and back-office credentials", () => {
  test.afterAll(async () => {
    // An afterAll rather than the end of the test, so a failed assertion still
    // cleans up.
    await adminClient().from("b2b_leads").delete().eq("name", LEAD_NAME);
  });

  test("PC-001: a B2B enquiry's lines survive, under their own labels", async ({
    page,
    context,
  }) => {
    test.setTimeout(SLOW);
    const admin = adminClient();
    await admin.from("b2b_leads").delete().eq("name", LEAD_NAME);
    const { error } = await admin.from("b2b_leads").insert({
      name: LEAD_NAME,
      phone: "+919000090000",
      email: "e2e.layout.lead@example.test",
      // CHECKed to four values; anything else is a 23514.
      source: "Hospitals",
      org_details: LEAD_DETAILS,
    });
    expect(error, error ? error.message : "").toBeNull();

    await context.addCookies(await browserCookiesFor(QA_EMAILS.admin));
    await openScreen(page, "people", "partners");

    // The marker name appears on exactly one card, so `hasText` is the scope --
    // and `:visible` keeps it off the 33 screens mounted behind `hidden`.
    const card = page.locator("li:visible").filter({ hasText: LEAD_NAME }).last();
    await expect(card).toBeVisible({ timeout: 60_000 });
    // The labels are the fix: one line reading `Source: ... - Details: ...` is
    // the defect.
    for (const label of ["Phone", "Email", "Source", "Received", "Details"]) {
      await expect(card.getByText(label, { exact: true }).first()).toBeVisible();
    }
    // And the three lines are still three lines. `whitespace-pre-line` is what
    // keeps them, so this is read off the rendered box rather than the string.
    const details = card.locator("dd").filter({ hasText: "First line of the enquiry." }).first();
    await expect(details).toBeVisible();
    const box = await details.boundingBox();
    const oneLine = await details.evaluate(
      (el) => parseFloat(getComputedStyle(el).lineHeight) || 16
    );
    expect(box!.height).toBeGreaterThan(oneLine * 2);
    await details.scrollIntoViewIfNeeded();
    await page.screenshot({ path: "/tmp/partners-01-lead-card.png" });
  });

  test("PC-002: a hospital partner's identity block is labelled rows", async ({ page, context }) => {
    test.setTimeout(SLOW);
    await context.addCookies(await browserCookiesFor(QA_EMAILS.admin));
    await openScreen(page, "people", "partners");

    const labels = page.locator("dt:visible").filter({ hasText: /^Onboarded$/ });
    const count = await labels.count();
    test.skip(count === 0, "no onboarded hospital in this database -- run npm run seed:qa");
    await expect(labels.first()).toBeVisible({ timeout: 60_000 });
    await expect(page.locator("dt:visible").filter({ hasText: /^Contact$/ }).first()).toBeVisible();
    await page.screenshot({ path: "/tmp/partners-02-hospital-card.png" });
  });

  test("PC-003: Onboard as Hospital is a labelled grid that states the clinic's share", async ({
    page,
    context,
  }) => {
    test.setTimeout(SLOW);
    await context.addCookies(await browserCookiesFor(QA_EMAILS.admin));
    await openScreen(page, "people", "partners");

    // One trigger per lead card, so it is scoped to a visible card rather than
    // taken with `.first()` -- which on this dashboard lands on a screen behind
    // `hidden` and then waits forever for a form nobody can see.
    const open = page
      .locator("li:visible")
      .filter({ has: page.getByRole("button", { name: "Onboard as Hospital" }) })
      .first()
      .getByRole("button", { name: "Onboard as Hospital" });
    const openCount = await open.count();
    test.skip(
      openCount === 0,
      "no B2B lead on this screen to onboard from -- the form is opened from a lead's card"
    );
    await open.click();

    const share = page.getByLabel(/revenue share/i).first();
    await expect(share).toBeVisible({ timeout: 30_000 });
    await share.fill("30");
    // The derived figure, the way a therapist's share already states it -- a
    // percentage with no stated complement is a number an admin has to do
    // arithmetic on.
    await expect(page.getByText(/clinic keeps 70/i).first()).toBeVisible({ timeout: 15_000 });
    await page.screenshot({ path: "/tmp/partners-03-onboard-form.png" });
  });

  test("PC-004: Reset password sits on a back-office row and never on your own", async ({
    page,
    context,
  }) => {
    test.setTimeout(SLOW);
    await context.addCookies(await browserCookiesFor(QA_EMAILS.admin));
    await openScreen(page, "settings", "access");

    const rows = page.getByRole("list", { name: "Back office accounts" }).locator("> li");
    await expect(rows.first()).toBeVisible({ timeout: 60_000 });

    // Your own row carries no reset: the honest lane for your own password is
    // the emailed reset on Sign-in & Security, and this control is a
    // credential somebody else reads off the screen.
    const own = rows.filter({ hasText: QA_EMAILS.admin }).first();
    await expect(own).toBeVisible();
    await expect(own.getByRole("button", { name: "Reset password" })).toHaveCount(0);
    await page.screenshot({ path: "/tmp/useraccess-01-rows.png", fullPage: true });
  });

  test("PC-005: the reset is refused for your own account at the route too", async () => {
    test.setTimeout(SLOW);
    const { cookieHeaderFor, profileIdFor } = await import("./helpers");
    const admin = adminClient();
    const ownId = await profileIdFor(admin, QA_EMAILS.admin);
    const cookie = await cookieHeaderFor(QA_EMAILS.admin);

    const res = await fetch(`${BASE}/api/admin/reset-admin-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ adminId: ownId }),
    });
    // The screen hiding the button is presentation; a session cookie can call
    // the route directly, which is why the refusal lives in both places.
    expect(res.ok).toBe(false);
  });

  test("PC-006: New Booking fills the width its own heading does", async ({ page, context }) => {
    test.setTimeout(SLOW);
    await context.addCookies(await browserCookiesFor(QA_EMAILS.admin));
    await openScreen(page, "sessions", "new");

    // Located through the screen's own h2 rather than by role: the shell's h1
    // carries the section eyebrow, so its accessible name matches "New Booking"
    // too and a role query is a strict-mode violation rather than a miss.
    const heading = page.locator("h2", { hasText: "New Booking" });
    await expect(heading).toBeVisible({ timeout: 60_000 });
    const card = heading.locator("..");

    // The defect was a `max-w-2xl` on this one screen, so what is worth
    // asserting is that the card now runs to the same edge the rest of the
    // content column does -- measured against `main` rather than a pixel
    // constant, which would only encode this viewport.
    const cardBox = (await card.boundingBox())!;
    const mainBox = (await page.locator("main").first().boundingBox())!;
    const cardRight = cardBox.x + cardBox.width;
    const mainRight = mainBox.x + mainBox.width;
    // 48px covers the shell's own right padding. Capped at 2xl the card ended
    // ~290px short of this, so the tolerance cannot mask the regression.
    expect(mainRight - cardRight).toBeLessThan(48);

    // And the form inside it is two-up, or a full-width card is just one long
    // column of half-empty rows.
    const grid = page.locator("form:visible .grid").first();
    await expect(grid).toBeVisible();
    const columns = await grid.evaluate((el) => getComputedStyle(el).gridTemplateColumns);
    expect(columns.trim().split(/\s+/).length).toBeGreaterThan(1);

    await page.screenshot({ path: "/tmp/newbooking-01-width.png", fullPage: true });
  });
});
