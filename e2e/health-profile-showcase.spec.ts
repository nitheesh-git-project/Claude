import { test, expect } from "@playwright/test";
import { BASE, waitForSplashToClear } from "./helpers";

/**
 * The public health-profile showcase: /how-it-works shows each enabled
 * specialty's profile in tabs, with sample data said on the panel, and the
 * home page's cards open the tab that was tapped.
 * See src/lib/healthProfileShowcase.ts.
 */
test.describe("health profile showcase", () => {
  test("HPS-001 the tabs switch specialty and the data is labelled a sample", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto(`${BASE}/how-it-works`);
    await waitForSplashToClear(page);
    const section = page.locator("#health-profile");
    await section.scrollIntoViewIfNeeded();
    await expect(section.getByText("Example - sample data, not a real patient")).toBeVisible();
    for (const [tab, heading] of [
      ["Neurological", "Neurological health profile"],
      ["Paediatric", "Paediatric health profile"],
      ["Orthopaedic", "Orthopaedic health profile"],
    ]) {
      await section.getByRole("tab", { name: tab }).click();
      await expect(section.getByRole("tab", { name: tab })).toHaveAttribute("aria-selected", "true");
      await expect(section.getByRole("tabpanel")).toContainText(heading);
    }
    // The questions are the intake's own.
    await expect(section.getByRole("tabpanel")).toContainText("What makes it worse?");
  });

  test("HPS-002 a home page card opens its own specialty's tab", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto(`${BASE}/`);
    await waitForSplashToClear(page);
    const band = page.locator("section#health-profile");
    await band.scrollIntoViewIfNeeded();
    await band.getByRole("link", { name: /Neurological/ }).click();
    await expect(page).toHaveURL(/\/how-it-works\?profile=neuro#health-profile/, { timeout: 60_000 });
    await expect(
      page.locator("#health-profile").getByRole("tab", { name: "Neurological" })
    ).toHaveAttribute("aria-selected", "true", { timeout: 30_000 });
  });
});
