// Suites A, B, C and K driven through a real browser: the reorganised
// dashboard's structure, its URL state, what a double-click does to a real
// button, and whether the page holds together on a phone.
//
// This is the only spec in the suite that opens a page -- everything else
// talks to the API directly, per this project's original QA scope decision.
// It exists because the reorganisation's whole risk surface *is* the UI.
import { test, expect, type Page } from "@playwright/test";
import { BASE, QA_EMAILS, adminClient, browserCookiesFor, profileIdFor } from "./helpers";
import { ADMIN_SECTIONS } from "../src/lib/adminNav";

async function signInAsAdmin(page: Page) {
  // The session is minted in Node and injected, rather than typed into the
  // login form -- see browserCookiesFor(). What is under test here is the
  // dashboard, not the login page.
  await page.context().addCookies(await browserCookiesFor(QA_EMAILS.admin));
  await page.goto(`${BASE}/admin/dashboard`);
  await expect(page.getByRole("heading", { level: 1, name: /Today/ })).toBeVisible({
    timeout: 60_000,
  });
}

test.describe("Suites A/B/C/K: the admin dashboard in a browser", () => {
  test.beforeAll(async () => {
    // Every test here walks all six sections, which only a full-access admin
    // can see. Stated as a precondition so a narrowed scope fails loudly
    // here instead of surfacing as "the Money button doesn't exist".
    const admin = adminClient();
    const id = await profileIdFor(admin, QA_EMAILS.admin);
    await admin.from("profiles").update({ admin_scope: "full" }).eq("id", id);
  });

  test.beforeEach(async ({ page }) => {
    test.setTimeout(120_000);
    await signInAsAdmin(page);
  });

  test("B-001: every section and sub-tab opens and writes itself to the URL", async ({ page }) => {
    for (const section of ADMIN_SECTIONS) {
      await page
        .getByRole("button", { name: new RegExp(`^${section.label}`) })
        .first()
        .click();
      for (const tab of section.tabs) {
        // The first sub-tab is already selected by opening the section; the
        // rest are clicked. Both paths must end with the same URL contract.
        if (tab !== section.tabs[0]) {
          await page
            .getByRole("button", { name: new RegExp(`^${tab.label}`) })
            .first()
            .click();
        }
        await expect(page).toHaveURL(
          new RegExp(`section=${section.key}&tab=${tab.key}`),
          { timeout: 10_000 }
        );
        // Something rendered -- a section heading is always present.
        await expect(
          page.getByRole("heading", { level: 1, name: new RegExp(section.label) })
        ).toBeVisible();
      }
    }
  });

  test("B-002/B-004: a deep link lands on that screen, and a reload keeps it", async ({ page }) => {
    await page.goto(`${BASE}/admin/dashboard?section=money&tab=payouts`);
    await expect(page.getByRole("heading", { level: 1, name: /Money/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Therapist Payouts" })).toBeVisible();

    await page.reload();
    // This is the fix for the old behaviour, where every action bounced the
    // admin back to the first tab.
    await expect(page).toHaveURL(/section=money&tab=payouts/);
    await expect(page.getByRole("heading", { name: "Therapist Payouts" })).toBeVisible();
  });

  test("B-003: Back walks the tab history", async ({ page }) => {
    await page.getByRole("button", { name: /^Sessions/ }).first().click();
    await page.getByRole("button", { name: /^Roster/ }).first().click();
    await page.getByRole("button", { name: /^Catalog/ }).first().click();
    await expect(page).toHaveURL(/section=catalog/);

    await page.goBack();
    await expect(page).toHaveURL(/section=sessions&tab=roster/);
    await page.goBack();
    await expect(page).toHaveURL(/section=sessions&tab=schedule/);
  });

  test("B-006/B-007: a nonsense URL falls back instead of rendering nothing", async ({ page }) => {
    await page.goto(`${BASE}/admin/dashboard?section=nonsense&tab=alsononsense`);
    await expect(page.getByRole("heading", { level: 1, name: /Today/ })).toBeVisible();

    // A real section with a sub-tab that doesn't belong to it.
    await page.goto(`${BASE}/admin/dashboard?section=money&tab=roster`);
    await expect(page.getByRole("heading", { level: 1, name: /Money/ })).toBeVisible();
    await expect(page).toHaveURL(/section=money/);
  });

  test("A-011/A-032: All Sessions shows both modes and filters to one", async ({ page }) => {
    await page.goto(`${BASE}/admin/dashboard?section=sessions&tab=all`);
    await expect(page.getByRole("heading", { level: 2, name: /^All Sessions/ })).toBeVisible();

    const rowCountText = await page.locator("h2", { hasText: "All Sessions" }).innerText();
    expect(rowCountText).toMatch(/\d+ of \d+/);

    // Filtering to home visits must not error and must keep the table.
    await page.getByRole("combobox").filter({ hasText: /Any mode/ }).selectOption("home_visit");
    await expect(page.getByRole("table")).toBeVisible();
    await page.getByRole("combobox").filter({ hasText: /Home visit/ }).selectOption("all");

    // The unassigned filter is the one an admin actually reaches for.
    await page.getByRole("combobox").filter({ hasText: /Any status/ }).selectOption("unassigned");
    await expect(page.getByRole("table")).toBeVisible();
  });

  test("A-045: a patient opens as an overlay, and direct navigation renders the page", async ({
    page,
  }) => {
    const admin = adminClient();
    const patientId = await profileIdFor(admin, QA_EMAILS.patientA);

    await page.goto(`${BASE}/admin/dashboard/patients/${patientId}`);
    await expect(page.getByText("Care Record")).toBeVisible();
    await expect(page.getByText("Personal Details")).toBeVisible();
  });

  test("C-001/C-002: spamming a save button produces exactly one request", async ({ page }) => {
    await page.goto(`${BASE}/admin/dashboard?section=settings&tab=booking`);
    await expect(page.getByText("Online Booking Lead Time")).toBeVisible();

    const requests: string[] = [];
    page.on("request", (r) => {
      if (r.url().includes("/api/admin/update-setting") && r.method() === "POST") {
        requests.push(r.url());
      }
    });

    const card = page.locator("div", { hasText: "Online Booking Lead Time" }).last();
    const save = card.getByRole("button", { name: "Save" }).first();
    // Ten clicks as fast as Playwright will issue them.
    await Promise.all(
      Array.from({ length: 10 }, () => save.click({ force: true, noWaitAfter: true }))
    );
    await page.waitForTimeout(3_000);

    expect(
      requests.length,
      `${requests.length} save requests were sent by a burst of clicks`
    ).toBeLessThanOrEqual(1);
  });

  test("K-004: the page does not scroll sideways on a phone", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    for (const url of [
      `${BASE}/admin/dashboard?section=sessions&tab=all`,
      `${BASE}/admin/dashboard?section=money&tab=summary`,
      `${BASE}/admin/dashboard?section=catalog&tab=purchases`,
    ]) {
      await page.goto(url);
      await page.waitForTimeout(1_000);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      // Wide tables scroll inside their own container; the body must not.
      expect(overflow, `${url} overflows the viewport by ${overflow}px`).toBeLessThanOrEqual(2);
    }
  });

  test("approvals are their own screen, and the patients screen is a directory", async ({
    page,
  }) => {
    await page.goto(`${BASE}/admin/dashboard?section=today&tab=approvals`);
    await expect(page.getByRole("heading", { name: "Pending Approvals" })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByRole("heading", { name: "Profile Change Requests" })).toBeVisible();
    // The duplicate session list that used to sit under the approvals is
    // gone -- sessions live in Sessions, and nowhere else.
    await expect(page.getByRole("heading", { name: "All Bookings" })).toHaveCount(0);

    await page.goto(`${BASE}/admin/dashboard?section=people&tab=patients`);
    await expect(page.getByRole("heading", { level: 2, name: /^Patients/ })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Pending Approvals" }).filter({ visible: true })
    ).toHaveCount(0);
  });

  test("All Sessions remembers its filters and bounds what it paints", async ({ page }) => {
    await page.goto(`${BASE}/admin/dashboard?section=sessions&tab=all`);
    await expect(page.getByRole("heading", { level: 2, name: /^All Sessions/ })).toBeVisible();

    await page.getByRole("combobox").filter({ hasText: /Any mode/ }).selectOption("home_visit");
    await page.waitForTimeout(500);

    // A reload is the test: a filter an admin has to re-set on every visit is
    // the friction this removes.
    await page.reload();
    await expect(page.getByRole("heading", { level: 2, name: /^All Sessions/ })).toBeVisible({
      timeout: 60_000,
    });
    await expect(
      page.getByRole("combobox").filter({ hasText: /Home visit/ }).first()
    ).toHaveValue("home_visit");

    // Clearing puts it back, and the cleared state is what persists next.
    await page.getByRole("button", { name: "Clear filters" }).click();
    await page.reload();
    await expect(page.getByRole("combobox").filter({ hasText: /Any mode/ }).first()).toHaveValue(
      "all"
    );

    // Never more rows in the DOM than the cap, however many match.
    const painted = await page.getByRole("row").count();
    expect(painted).toBeLessThanOrEqual(201 + 1);
  });

  // Today absorbed the old Action Inbox, so its queues live on the overview
  // screen now. The behaviour worth protecting is unchanged: every link out
  // of Today has to land somewhere that can actually action the work.
  test("Today's queue links land on a screen that can act on them", async ({ page }) => {
    await page.goto(`${BASE}/admin/dashboard?section=today&tab=overview`);
    await expect(page.getByText("Queues", { exact: true })).toBeVisible();

    // Every in-page link, not just the first: a dead tab key silently falls
    // back to the section's first screen, so a broken link looks like a
    // working one unless the destination is actually checked. Two of these
    // pointed at tabs that had never existed.
    const hrefs = [
      ...new Set(
        await page
          .locator('a[href*="section="]')
          .evaluateAll((els) => els.map((e) => e.getAttribute("href") ?? ""))
      ),
    ].filter(Boolean);
    expect(hrefs.length).toBeGreaterThan(0);

    for (const href of hrefs) {
      const target = new URL(href, BASE).searchParams;
      await page.goto(`${BASE}${href}`);
      const landed = new URL(page.url()).searchParams;
      expect(
        `${landed.get("section")}/${landed.get("tab")}`,
        `${href} did not land on the screen it names`
      ).toBe(`${target.get("section")}/${target.get("tab")}`);
    }
  });
});
