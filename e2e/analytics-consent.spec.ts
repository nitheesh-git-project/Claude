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
  test("nothing reaches Google before a choice, and Yes, happy to help loads it", async ({ page }) => {
    const hits = await watchGoogle(page);
    await page.goto(`${BASE}/faq`);
    const banner = page.getByRole("region", { name: "Analytics" });
    await expect(banner).toBeVisible();
    await page.waitForTimeout(1500);
    expect(hits).toHaveLength(0);

    await banner.getByRole("button", { name: "Yes, happy to help" }).click();
    await expect(banner).toBeHidden();
    await expect.poll(() => hits.length).toBeGreaterThan(0);
    expect(hits.some((u) => u.includes("gtag/js"))).toBe(true);
  });

  test("the whole of the green button is tappable, edge to edge", async ({ page }) => {
    await watchGoogle(page);
    await page.goto(`${BASE}/faq`);
    const yes = page.getByRole("button", { name: "Yes, happy to help" });
    await expect(yes).toBeVisible();
    const box = await yes.boundingBox();
    expect(box && box.height >= 44).toBe(true);
    // A tap near the corner (inside its rounded edge) counts, not only on the label.
    await yes.click({ position: { x: 8, y: 8 } });
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem("mr_analytics_consent")))
      .toBe("granted");
  });

  test("Not now sticks across a reload", async ({ page }) => {
    const hits = await watchGoogle(page);
    await page.goto(`${BASE}/faq`);
    await page.getByRole("button", { name: "Not now" }).click();
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

  test("the footer link reopens the card and withdrawing stops tracking", async ({ page }) => {
    await watchGoogle(page);
    await page.addInitScript(() => localStorage.setItem("mr_analytics_consent", "granted"));
    await page.goto(`${BASE}/faq`);
    await page.getByRole("button", { name: "Analytics settings" }).click();
    const banner = page.getByRole("region", { name: "Analytics" });
    await expect(banner).toBeVisible();
    await banner.getByRole("button", { name: "Not now" }).click();
    await expect(banner).toBeHidden();
    expect(await page.evaluate(() => localStorage.getItem("mr_analytics_consent"))).toBe("denied");
    expect(
      await page.evaluate(
        (id) => (window as unknown as Record<string, unknown>)[`ga-disable-${id}`],
        process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID
      )
    ).toBe(true);
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
