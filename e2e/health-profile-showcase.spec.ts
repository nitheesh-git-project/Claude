import { test, expect } from "@playwright/test";
import { BASE, waitForSplashToClear } from "./helpers";

/**
 * The public health-profile showcase: a sample patient dashboard per enabled
 * specialty, labelled as a sample, which moves on by itself every five
 * seconds while on screen and stops for good once somebody picks a tab.
 * See src/lib/healthProfileShowcase.ts and HealthProfileShowcase.
 */
test.describe("health profile showcase", () => {
  test("HPS-001 each tab shows that specialty's sample dashboard", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto(`${BASE}/how-it-works`);
    await waitForSplashToClear(page);
    const section = page.locator("#health-profile");
    await section.scrollIntoViewIfNeeded();
    for (const [tab, patient] of [
      ["Neurological", "Hi Arun"],
      ["Paediatric", "Hi Meera"],
      ["Orthopaedic", "Hi Riya"],
    ]) {
      await section.getByRole("tab", { name: tab }).click();
      await expect(section.getByRole("tab", { name: tab })).toHaveAttribute("aria-selected", "true");
      await expect(section.getByRole("tabpanel")).toContainText(patient);
      await expect(section.getByRole("tabpanel")).toContainText("Sample patient");
      await expect(section.getByRole("tabpanel")).toContainText("Every action, recorded");
    }
    await expect(section.getByText(/What we track/)).toBeVisible();
  });

  test("HPS-002 it moves on by itself, and stops once a tab is picked", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto(`${BASE}/`);
    await waitForSplashToClear(page);
    const band = page.locator("section#health-profile");
    await band.scrollIntoViewIfNeeded();
    const selected = band.getByRole("tab", { selected: true });
    const first = await selected.textContent();
    await expect(selected).not.toHaveText(first ?? "", { timeout: 9_000 });

    await band.getByRole("tab", { name: "Paediatric" }).click();
    await expect(band.getByRole("button", { name: /dashboard tour/ })).toHaveCount(0);
    await page.waitForTimeout(6_500);
    await expect(selected).toHaveText("Paediatric");
  });
});
