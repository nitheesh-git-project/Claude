// Google Analytics consent gate. Needs the app built or started with
// NEXT_PUBLIC_GA_MEASUREMENT_ID set (any "G-..." value; Google is stubbed
// below, so nothing leaves the machine and no real property is touched).
//
// What is asserted is the promise the banner makes: nothing is requested
// from Google before a visitor accepts, a refusal sticks, and the signed-in
// route trees never show the banner or load the script.
import { test, expect, type Page } from "@playwright/test";
import { BASE } from "./helpers";

test.skip(
  !process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID,
  "Set NEXT_PUBLIC_GA_MEASUREMENT_ID on the app under test and on this run."
);

const GOOGLE = /googletagmanager\.com|google-analytics\.com/;

// Stubs Google and records every request that was made to it.
async function watchGoogle(page: Page) {
  const hits: string[] = [];
  await page.route(GOOGLE, async (route) => {
    hits.push(route.request().url());
    await route.fulfill({ status: 200, contentType: "text/javascript", body: "" });
  });
  return hits;
}

test.describe("analytics consent", () => {
  test("nothing reaches Google before a choice, and Allow loads it", async ({ page }) => {
    const hits = await watchGoogle(page);
    await page.goto(`${BASE}/faq`);
    const banner = page.getByRole("region", { name: "Analytics" });
    await expect(banner).toBeVisible();
    await page.waitForTimeout(1500);
    expect(hits).toHaveLength(0);

    await banner.getByRole("button", { name: "Allow" }).click();
    await expect(banner).toBeHidden();
    await expect.poll(() => hits.length).toBeGreaterThan(0);
    expect(hits.some((u) => u.includes("gtag/js"))).toBe(true);
  });

  test("No thanks sticks across a reload", async ({ page }) => {
    const hits = await watchGoogle(page);
    await page.goto(`${BASE}/faq`);
    await page.getByRole("button", { name: "No thanks" }).click();
    await expect(page.getByRole("region", { name: "Analytics" })).toBeHidden();
    await page.reload();
    await page.waitForTimeout(1500);
    await expect(page.getByRole("region", { name: "Analytics" })).toBeHidden();
    expect(hits).toHaveLength(0);
  });

  test("an accepted visitor sends page views from public pages only", async ({ page }) => {
    const hits = await watchGoogle(page);
    await page.addInitScript(() => localStorage.setItem("mr_analytics_consent", "granted"));
    await page.goto(`${BASE}/faq`);
    await expect.poll(() => hits.some((u) => u.includes("gtag/js"))).toBe(true);
    // The wrapper sends the event once gtag exists; the queue is on dataLayer.
    await expect
      .poll(() =>
        page.evaluate(() =>
          (window.dataLayer ?? []).some((e) => {
            const a = Array.from(e as ArrayLike<unknown>);
            return a[0] === "event" && a[1] === "page_view";
          })
        )
      )
      .toBe(true);
  });

  for (const path of ["/admin/login", "/patient", "/therapist", "/hospital", "/dashboard"]) {
    test(`${path} never shows the banner`, async ({ page }) => {
      await watchGoogle(page);
      await page.goto(`${BASE}${path}`);
      await page.waitForTimeout(1000);
      await expect(page.getByRole("region", { name: "Analytics" })).toBeHidden();
    });
  }
});
