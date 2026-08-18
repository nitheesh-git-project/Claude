// Suite D -- what the dashboard does when the network misbehaves.
//
// Every case here drives a real button and interferes with the request it
// makes. The thing under test is never the happy path: it is whether a
// failure is *visible*, whether an optimistic UI rolls back, and whether a
// button that is mid-flight can be pressed again.
import { test, expect, type Page } from "@playwright/test";
import { BASE, QA_EMAILS, browserCookiesFor } from "./helpers";

const SETTING_ROUTE = "**/api/admin/update-setting";

async function openBookingRules(page: Page) {
  await page.context().addCookies(await browserCookiesFor(QA_EMAILS.admin));
  await page.goto(`${BASE}/admin/dashboard?section=settings&tab=booking`);
  await expect(page.getByText("Online Booking Lead Time")).toBeVisible({ timeout: 60_000 });
}

// Scoped to one card, by its heading. Every assertion below -- the button,
// its state, its error line -- is looked up inside that card, so a red
// figure elsewhere on the page can never be mistaken for an error message.
function card(page: Page, heading: string) {
  return page
    .locator("div.bg-white")
    .filter({ has: page.getByRole("heading", { name: heading }) });
}

// The lead-time card: a plain number + Save, the smallest real mutation on
// the dashboard, so a failure here is unambiguous.
function leadTimeCard(page: Page) {
  return card(page, "Online Booking Lead Time");
}

// Matched on a prefix because the label itself is the pending indicator:
// "Save" becomes "Saving..." while the request is in flight, so an exact
// name would stop matching the moment the thing under test starts.
function leadTimeSave(page: Page) {
  return leadTimeCard(page).getByRole("button", { name: /^Sav/ }).first();
}

function leadTimeError(page: Page) {
  return leadTimeCard(page).locator("p.text-red-600").first();
}

test.describe("Suite D: network failure", () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(120_000);
    await openBookingRules(page);
  });

  test("D-002: a slow save stays visibly pending and cannot be double-fired", async ({ page }) => {
    let hits = 0;
    await page.route(SETTING_ROUTE, async (route) => {
      hits += 1;
      await new Promise((r) => setTimeout(r, 4_000));
      await route.continue();
    });

    const save = leadTimeSave(page);
    await save.click();
    // While in flight the control must say so and refuse further presses --
    // otherwise a slow connection is indistinguishable from a dead button,
    // which is exactly when people click again.
    await expect(save).toBeDisabled();
    await expect(save).toHaveText(/Saving/i);
    await save.click({ force: true }).catch(() => {});
    await save.click({ force: true }).catch(() => {});
    await page.waitForTimeout(6_000);
    expect(hits, `${hits} requests were sent for one save`).toBe(1);
  });

  test("D-003: offline surfaces an error rather than a stuck spinner", async ({ page, context }) => {
    await context.setOffline(true);
    const save = leadTimeSave(page);
    await save.click();

    // The failure has to reach the screen. A silent no-op is the bug.
    await expect(leadTimeError(page)).toBeVisible({ timeout: 20_000 });
    // ...and the button has to come back, or the admin is stuck.
    await expect(save).toBeEnabled({ timeout: 20_000 });
    await context.setOffline(false);
  });

  test("D-006: a 500 is reported in words, not swallowed", async ({ page }) => {
    await page.route(SETTING_ROUTE, (route) =>
      route.fulfill({ status: 500, contentType: "application/json", body: '{"error":"boom"}' })
    );
    await leadTimeSave(page).click();
    const error = leadTimeError(page);
    await expect(error).toBeVisible({ timeout: 20_000 });
    await expect(error).not.toHaveText("");
  });

  test("D-008: an HTML error page instead of JSON does not throw", async ({ page }) => {
    await page.route(SETTING_ROUTE, (route) =>
      route.fulfill({ status: 502, contentType: "text/html", body: "<html>gateway</html>" })
    );
    const pageErrors: string[] = [];
    page.on("pageerror", (e) => pageErrors.push(String(e)));

    await leadTimeSave(page).click();
    await expect(leadTimeError(page)).toBeVisible({ timeout: 20_000 });
    expect(pageErrors, `unhandled error: ${pageErrors[0]}`).toEqual([]);
  });

  test("D-007: an expired session is reported, not silently discarded", async ({ page }) => {
    await page.route(SETTING_ROUTE, (route) =>
      route.fulfill({
        status: 403,
        contentType: "application/json",
        body: '{"error":"Forbidden"}',
      })
    );
    await leadTimeSave(page).click();
    await expect(leadTimeError(page)).toBeVisible({ timeout: 20_000 });
  });

  test("D-004: an optimistic toggle rolls back when the request fails", async ({ page }) => {
    // Meet auto-create is optimistic: it flips the moment it is clicked and
    // must revert when the server refuses, or the dashboard shows a setting
    // that isn't real.
    const toggle = card(page, "Auto-Create Meet Links")
      .getByRole("button", { name: /Enabled|Disabled/ })
      .first();
    const before = (await toggle.innerText()).trim();

    await page.route(SETTING_ROUTE, (route) =>
      route.fulfill({ status: 500, contentType: "application/json", body: '{"error":"nope"}' })
    );
    await toggle.click();
    await page.waitForTimeout(3_000);
    await expect(toggle).toHaveText(before, { timeout: 15_000 });
  });

  test("D-005: a blocked request still reaches the screen as a failure", async ({ page }) => {
    await page.route(SETTING_ROUTE, (route) => route.abort("failed"));
    await leadTimeSave(page).click();
    await expect(leadTimeError(page)).toBeVisible({ timeout: 20_000 });
  });
});
