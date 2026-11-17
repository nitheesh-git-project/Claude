import { test, expect } from "@playwright/test";
import { BASE, waitForSplashToClear } from "./helpers";

/**
 * "What treatment works towards" (TreatmentGoals): on the home page and
 * /how-it-works, one kind of care at a time, swept from the first visit to the
 * goal, looping through all six until a visitor picks one. Read-only:
 * nothing here writes a row.
 */
test.describe("what treatment works towards", () => {
  test.setTimeout(120_000);

  test("TG-001 the band loops through all six, and a picked kind of care stops it there", async ({ page }) => {
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

    // Left alone it plays all six in a loop: the second story comes up by
    // itself (sweep 1.8s + hold 1.6s, after a 0.45s lead-in).
    await expect(band.getByRole("tab", { name: "Orthopaedic care" })).toHaveAttribute("aria-selected", "true");
    await expect(band.getByRole("tab").nth(1)).toHaveAttribute("aria-selected", "true", { timeout: 10_000 });
    // No play button any more: the loop replaced it.
    await expect(band.getByRole("button", { name: /Play all six/ })).toHaveCount(0);

    // A tap stops the loop on that story, for as long as the page is open.
    await band.getByRole("tab", { name: "Heart and lung rehabilitation" }).click();
    await expect(panel).toContainText("372 m");
    await expect(panel).toContainText("285 m");
    await page.waitForTimeout(9_000);
    await expect(band.getByRole("tab", { name: "Heart and lung rehabilitation" })).toHaveAttribute("aria-selected", "true");
    // Scrolling away and back does not restart it either.
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(1_000);
    await band.scrollIntoViewIfNeeded();
    await page.waitForTimeout(5_000);
    await expect(band.getByRole("tab", { name: "Heart and lung rehabilitation" })).toHaveAttribute("aria-selected", "true");
  });

  test("TG-002 it sits on /how-it-works, without the old areas-of-practice picker, and fits a phone", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto(`${BASE}/how-it-works`);
    await waitForSplashToClear(page);
    const band = page.locator("section#goals");
    await band.scrollIntoViewIfNeeded();
    await expect(band.getByRole("tab")).toHaveCount(6);
    await expect(page.getByRole("heading", { name: "Where we can help" })).toHaveCount(0);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow, "the page scrolls sideways").toBe(false);
  });

  test("TG-003 under reduced motion the goal shows at once and nothing advances", async ({ browser }) => {
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
    // And nothing advances on its own under reduced motion.
    await page.waitForTimeout(6_000);
    await expect(band.getByRole("tab").first()).toHaveAttribute("aria-selected", "true");
    await context.close();
  });
});
