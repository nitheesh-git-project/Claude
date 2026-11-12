import { test, expect } from "@playwright/test";
import { BASE, waitForSplashToClear } from "./helpers";

/**
 * "What treatment works towards" (TreatmentGoals): on the home page and
 * /conditions, one kind of care at a time, swept from the first visit to the
 * goal. Read-only: nothing here writes a row.
 */
test.describe("what treatment works towards", () => {
  test.setTimeout(120_000);

  test("TG-001 the band sweeps from the first visit to the goal, and a picked kind of care stays picked", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${BASE}/`);
    await waitForSplashToClear(page);
    const band = page.locator("section#goals");
    await band.scrollIntoViewIfNeeded();
    await expect(band.getByRole("tab")).toHaveCount(6);
    const panel = band.getByRole("tabpanel");
    // Both sides are in the page: what is hard today, and the goal.
    await expect(panel).toContainText("7/10");
    await expect(panel).toContainText("3/10");
    await expect(panel).toContainText("Climb the stairs without wincing");
    await expect(band).toContainText("Sample patient Riya");
    await expect(band).toContainText("results vary");

    await band.getByRole("tab", { name: "Heart and lung rehabilitation" }).click();
    await expect(panel).toContainText("372 m");
    await expect(panel).toContainText("285 m");
    // Nothing advances by itself.
    await page.waitForTimeout(6_000);
    await expect(band.getByRole("tab", { name: "Heart and lung rehabilitation" })).toHaveAttribute("aria-selected", "true");

    // Play all six walks through, starting from the first.
    await band.getByRole("button", { name: "Play all six" }).click();
    await expect(band.getByRole("tab", { name: "Orthopaedic care" })).toHaveAttribute("aria-selected", "true");
    await expect(band.getByRole("tab", { name: "Desk and posture care" })).toHaveAttribute("aria-selected", "true", {
      timeout: 10_000,
    });
  });

  test("TG-002 it replaces the old areas-of-practice picker on /conditions, and fits a phone", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto(`${BASE}/conditions`);
    await waitForSplashToClear(page);
    const band = page.locator("section#goals");
    await band.scrollIntoViewIfNeeded();
    await expect(band.getByRole("tab")).toHaveCount(6);
    await expect(page.getByRole("heading", { name: "Where we can help" })).toHaveCount(0);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow, "the page scrolls sideways").toBe(false);
  });

  test("TG-003 under reduced motion the goal shows at once", async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    await page.goto(`${BASE}/`);
    await waitForSplashToClear(page);
    const band = page.locator("section#goals");
    await band.scrollIntoViewIfNeeded();
    // With nothing sweeping, the goal side is uncovered: its clip is zero.
    await expect
      .poll(() =>
        band.evaluate((el) => {
          const layer = el.querySelector('[role="tabpanel"] > div[style*="clip-path"]') as HTMLElement | null;
          return layer?.style.clipPath ?? "";
        })
      )
      .toMatch(/inset\(0(px)? 0(\.00)?%? 0(px)? 0(px)?\)|inset\(0px\)|inset\(0 0\.00% 0 0\)/);
    await context.close();
  });
});
