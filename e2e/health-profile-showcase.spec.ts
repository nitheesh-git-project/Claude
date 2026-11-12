import { test, expect } from "@playwright/test";
import { BASE, waitForSplashToClear } from "./helpers";

/**
 * The public health-profile showcase: the Health Profile of each enabled
 * condition type drawn from sample data (who it is for, what it watches, the
 * headline change, the graph with its goal band, the milestone cards),
 * labelled as a sample, which moves on by itself every five seconds while on
 * screen and stops for good once somebody picks a tab. Strength and balance
 * care and Heart and lung rehabilitation appear only once an admin enables
 * them, so this spec asserts the three original tabs and tolerates the rest.
 * See src/lib/healthProfileShowcase.ts and HealthProfileShowcase.
 */
test.describe("health profile showcase", () => {
  test("HPS-001 each tab shows that profile's sample, its graph and its milestones", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto(`${BASE}/how-it-works`);
    await waitForSplashToClear(page);
    const section = page.locator("#health-profile");
    await section.scrollIntoViewIfNeeded();
    for (const [tab, summary] of [
      ["Neurological care", "How much help to walk"],
      ["Paediatric physiotherapy", "Milestones reached"],
      ["Orthopaedic care", "Pain score"],
    ]) {
      await section.getByRole("tab", { name: tab }).click();
      await expect(section.getByRole("tab", { name: tab })).toHaveAttribute("aria-selected", "true");
      const panel = section.getByRole("tabpanel");
      await expect(panel).toContainText("Sample patient - figures are made up");
      await expect(panel).toContainText(summary);
      await expect(panel).toContainText("What this profile watches");
      // The real graph and milestone cards, drawn from the sample.
      await expect(panel.getByRole("region", { name: "Progress" })).toBeVisible();
      await expect(panel.getByRole("region", { name: "Steps" })).toContainText("Reached");
      await expect(panel.getByRole("region", { name: "Steps" })).toContainText("Planned");
    }
    // Parkinson's is an example inside the neurological tab, not a tab of its own.
    await section.getByRole("tab", { name: "Neurological care" }).click();
    await section.getByRole("button", { name: "Including Parkinson's" }).click();
    await expect(section.getByRole("tabpanel")).toContainText("Tested in ON time");
    await expect(section.getByText("How progress is tracked")).toBeVisible();
  });

  test("HPS-002 it moves on by itself, and stops once a tab is picked", async ({ page }) => {
    test.setTimeout(120_000);
    // The full tour lives on /how-it-works; the home page carries only the
    // headline-change teaser (HPS-003).
    await page.goto(`${BASE}/how-it-works`);
    await waitForSplashToClear(page);
    const band = page.locator("section#health-profile");
    await band.scrollIntoViewIfNeeded();
    const selected = band.getByRole("tab", { selected: true });
    const first = await selected.textContent();
    await expect(selected).not.toHaveText(first ?? "", { timeout: 9_000 });

    await band.getByRole("tab", { name: "Paediatric physiotherapy" }).click();
    await expect(band.getByRole("button", { name: /health profile tour/ })).toHaveCount(0);
    await page.waitForTimeout(6_500);
    await expect(selected).toHaveText("Paediatric physiotherapy");
  });

  test("HPS-003 the home page tells one recovery story at a time, and never moves on its own", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto(`${BASE}/`);
    await waitForSplashToClear(page);
    const band = page.locator("section#health-profile");
    await band.scrollIntoViewIfNeeded();
    const story = band.getByTestId("recovery-story");
    await expect(story).toContainText("Sample patient - figures are made up");
    // The sample's figure counts from its first visit to its latest review
    // and lands on the headline the sample prints.
    await expect(story).toContainText("Riya");
    await expect(story).toContainText("3/10", { timeout: 10_000 });
    await expect(story).toContainText("from 7/10");
    await expect(story.getByRole("list", { name: "Tools this profile uses" })).toContainText("Pain Map");
    // The real graph and milestone cards stay on /how-it-works.
    await expect(band.getByRole("region", { name: "Progress" })).toHaveCount(0);

    // A kind of care is picked, never rotated to: it stays where it is put.
    const neuro = band.getByRole("tab", { name: "Neurological care" });
    await neuro.click();
    await expect(story).toContainText("Arun");
    await page.waitForTimeout(6_000);
    await expect(neuro).toHaveAttribute("aria-selected", "true");
  });

  test("HPS-004 See the full health profile opens every kind of care and ends on booking", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto(`${BASE}/`);
    await waitForSplashToClear(page);
    const band = page.locator("section#health-profile");
    await band.scrollIntoViewIfNeeded();
    await band.getByRole("button", { name: "See the full health profile" }).click();
    const tour = page.getByRole("dialog", { name: "From sore to better, measured" });
    await expect(tour).toBeVisible();
    const tabs = await band.getByRole("tab").count();
    await expect(tour.getByTestId("recovery-story")).toHaveCount(Math.max(tabs, 1));
    const unlock = tour.getByTestId("recovery-unlock");
    await unlock.scrollIntoViewIfNeeded();
    await expect(unlock).toContainText("Your profile opens with your first booking");
    await expect(unlock.getByRole("link", { name: /Book a video session/ })).toHaveAttribute("href", "/book");
    await page.keyboard.press("Escape");
    await expect(tour).toHaveCount(0);
  });
});
