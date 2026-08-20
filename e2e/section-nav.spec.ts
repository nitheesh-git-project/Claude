// The public pages' section rail and the bottom-right scroll arrow, driven
// through a real browser.
//
// Browser-only, like admin-dashboard-ui.spec.ts, and for the same reason:
// what is under test is scroll position and what the page paints at it,
// which no API-level check can see. It reads the rail's own buttons rather
// than a hardcoded section list, because several sections are conditional on
// admin-controlled catalog data and simply do not render on an empty project.
import { test, expect, type Page } from "@playwright/test";
import { BASE } from "./helpers";

const FRONT_PAGES = [
  "/",
  "/conditions",
  "/faq",
  "/get-started",
  "/home-visit",
  "/hospitals",
  "/how-it-works",
  "/team",
];

// The rail is gated to >=1440px wide viewports on purpose (it would sit on
// top of hero copy on anything narrower), so the desktop checks need a
// viewport at least that wide.
const WIDE = { width: 1600, height: 900 };

const rail = (page: Page) => page.locator('nav[aria-label="Jump to section"] button');
const arrow = (page: Page) => page.getByRole("button", { name: "Scroll to next section" });
const activePill = (page: Page) =>
  page.locator('nav[aria-label="Jump to section"] button[aria-current="true"]');
const scrollY = (page: Page) => page.evaluate(() => Math.round(window.scrollY));

// Waits out the smooth scroll rather than sampling mid-flight, which would
// read a scroll position the visitor never lands on.
async function settle(page: Page) {
  await page.waitForFunction(() => {
    const y = Math.round(window.scrollY);
    return new Promise<boolean>((resolve) =>
      requestAnimationFrame(() =>
        setTimeout(() => resolve(Math.round(window.scrollY) === y), 120)
      )
    );
  });
}

test.describe("Section rail and scroll arrow on the public pages", () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize(WIDE);
  });

  test("SN-001: no section is active while the page sits at the top", async ({ page }) => {
    for (const path of FRONT_PAGES) {
      await page.goto(`${BASE}${path}`);
      await expect(activePill(page)).toHaveCount(0, { timeout: 30_000 });
    }
  });

  test("SN-002: the arrow advances one section per tap, in order", async ({ page }) => {
    await page.goto(`${BASE}/`);
    const labels = await rail(page).allTextContents();
    expect(labels.length).toBeGreaterThan(1);

    for (const label of labels) {
      if ((await arrow(page).count()) === 0) break;
      const before = await scrollY(page);
      await arrow(page).click();
      await settle(page);
      expect(await scrollY(page)).toBeGreaterThan(before);
      // The pill that lights up is the section the arrow just landed on.
      await expect(activePill(page)).toHaveText(label.trim());
    }
  });

  test("SN-003: the arrow disappears at the bottom and the rail follows a manual scroll", async ({
    page,
  }) => {
    await page.goto(`${BASE}/`);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await settle(page);
    await expect(arrow(page)).toHaveCount(0);
    await expect(activePill(page)).toHaveCount(1);

    // Back to the very top clears the active pill again -- the state has to
    // be reachable in both directions, not only on first paint.
    await page.evaluate(() => window.scrollTo(0, 0));
    await settle(page);
    await expect(activePill(page)).toHaveCount(0);
  });

  test("SN-004: clicking a rail pill scrolls to that section and marks it active", async ({
    page,
  }) => {
    await page.goto(`${BASE}/`);
    const last = rail(page).last();
    const label = (await last.textContent())?.trim() ?? "";
    await last.click();
    await settle(page);
    expect(await scrollY(page)).toBeGreaterThan(0);
    await expect(activePill(page)).toHaveText(label);
  });

  test("SN-005: the arrow still works where the rail is hidden (narrow viewport)", async ({
    page,
  }) => {
    // The rail is CSS-hidden below 1440px but still mounted, which is what
    // publishes the section list the arrow scrolls through -- so a phone
    // gets working section-by-section paging with no rail on screen.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${BASE}/`);
    await expect(rail(page).first()).toBeHidden();
    const before = await scrollY(page);
    await arrow(page).click();
    await settle(page);
    expect(await scrollY(page)).toBeGreaterThan(before);
  });

  test("SN-006: a client-side navigation swaps the arrow's section list", async ({ page }) => {
    // The rail lives on the page and the arrow lives in the root layout, so
    // a soft navigation between two front pages has to hand the new page's
    // sections over -- a stale list would scroll to an id that no longer
    // exists, i.e. nowhere.
    await page.goto(`${BASE}/how-it-works`);
    await page.getByRole("link", { name: /FAQ/i }).first().click();
    await page.waitForURL(/\/faq$/);
    await expect(rail(page).first()).toBeVisible();
    const before = await scrollY(page);
    await arrow(page).click();
    await settle(page);
    expect(await scrollY(page)).toBeGreaterThan(before);
    await expect(activePill(page)).toHaveCount(1);
  });

  test("SN-007: the arrow is absent outside the public pages", async ({ page }) => {
    await page.goto(`${BASE}/patient/login`);
    await expect(arrow(page)).toHaveCount(0);
  });
});
