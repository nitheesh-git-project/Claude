// The brand splash: what a visitor sees for the first second and a half of
// a cold open, and — just as important — what they don't see the rest of
// the time.
//
// Browser-only, like section-nav.spec.ts. Every rule under test is about
// paint order and per-tab session state: whether the greeting is already
// on screen at first paint (rather than dropping onto a page the visitor
// can read), whether it lets go of the pointer afterwards, and whether it
// stays quiet on a reload. None of that is visible to an API-level check.
import { test, expect, type Page } from "@playwright/test";
import { BASE } from "./helpers";

// Kept in step with src/lib/splashScreen.ts. Not imported from it: this
// spec is asserting the values the app actually ships, so reading them
// from the same module would make the assertions pass by construction.
const HOLD_MS = 1400;
const FADE_MS = 550;
const AWAY_MS = 15 * 60 * 1000;
const HIDDEN_AT_KEY = "dpp.splash.hiddenAt";

const splashState = (page: Page) =>
  page.evaluate(() => document.documentElement.getAttribute("data-splash"));

// Waits for the greeting to be completely gone rather than sleeping out
// its nominal duration: the timers start when the component mounts, which
// under `next dev` can be several hundred ms after domcontentloaded, and a
// fixed sleep then reads a frame mid-fade and fails a working splash.
const settle = (page: Page) =>
  page.waitForFunction(() => !document.documentElement.hasAttribute("data-splash"), null, {
    timeout: HOLD_MS + FADE_MS + 10_000,
  });

// Fakes a tab going away and coming back. visibilityState is read-only, so
// it is redefined for the page; the component reads it on every event, so
// this exercises the real handler rather than a test-only branch.
async function leaveAndReturn(page: Page, awayMs: number) {
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.evaluate(
    ([key, ms]) => sessionStorage.setItem(key as string, String(Date.now() - (ms as number))),
    [HIDDEN_AT_KEY, awayMs] as const
  );
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

test.describe("brand splash", () => {
  test("SP-001 covers the site on a cold open, then hands it back", async ({ page }) => {
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });

    // Set by the inline boot script, so it is true at first paint — the
    // greeting is never seen arriving on top of a page already on screen.
    expect(await splashState(page)).toBe("on");
    await expect(page.getByText("Movement Is Medicine")).toBeVisible();

    await settle(page);

    // Attribute gone, not merely transparent: that is what returns the
    // sheet to visibility:hidden so it stops swallowing clicks.
    expect(await splashState(page)).toBeNull();
    await expect(page.locator(".splash-screen")).toBeHidden();
    expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).not.toBe("hidden");
  });

  test("SP-002 stays quiet on a reload of the same tab", async ({ page }) => {
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    await settle(page);

    await page.reload({ waitUntil: "domcontentloaded" });
    expect(await splashState(page)).toBeNull();
  });

  test("SP-003 replays only after a long absence from the tab", async ({ page }) => {
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    await settle(page);

    // A minute away is someone fetching an OTP or approving a UPI payment
    // in their bank's app. Splashing over a checkout in progress is the
    // one thing this must never do.
    await leaveAndReturn(page, 60 * 1000);
    expect(await splashState(page)).toBeNull();

    await leaveAndReturn(page, AWAY_MS + 60 * 1000);
    expect(await splashState(page)).toBe("on");
    await settle(page);
    expect(await splashState(page)).toBeNull();
  });

  test("SP-004 does not run at all under reduced motion", async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: "reduce" });
    const page = await context.newPage();
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });

    // Decoration over content that is already rendered, so the honest
    // answer to "don't animate" is not to show it rather than to snap it.
    expect(await splashState(page)).toBeNull();
    await expect(page.locator(".splash-screen")).toBeHidden();
    await context.close();
  });
});
