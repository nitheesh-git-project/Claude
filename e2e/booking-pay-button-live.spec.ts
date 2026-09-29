import { test, expect } from "@playwright/test";
import { QA_EMAILS, BASE, browserCookiesFor } from "./helpers";

/**
 * The payment step's primary button is never dead while a price loads.
 *
 * It used to be. `BookingWizard` carried `disabled={loading || quoting}`, and
 * `quoting` is a server read that fires on arriving at Step 3 and again on
 * every promo code applied -- so the one control this screen exists for sat
 * disabled for a round trip, with nothing on it saying why. That is
 * indistinguishable from a broken button, and a patient who taps a dead pay
 * button taps it again.
 *
 * The fix queues the tap rather than refusing it: the handler acknowledges it
 * immediately and awaits the in-flight read before choosing its branch. So
 * what is worth proving is exactly what a person sees -- the button is
 * tappable from the moment the screen renders, including while the price is
 * still being fetched -- and none of it is visible to an API test, since the
 * routes and the rows are unchanged.
 *
 * The quote route is delayed deliberately rather than raced: on a fast local
 * server the window is a few hundred milliseconds and a test that tried to
 * catch it would be a flake either way round. Held longer than any real
 * round trip so that a button re-disabled by a background read fails here
 * every time rather than on an unlucky run.
 */
test.describe("the pay button on Step 3", () => {
  const SHOTS = "e2e/screenshots/booking-pay-button";
  const QUOTE_DELAY_MS = 4_000;

  /** Sign in and walk an ordinary patient to Step 3, with the quote held. */
  async function reachStepThreeWithSlowQuote(page: import("@playwright/test").Page) {
    // Delay the price read without changing its answer -- the assertion is
    // about the wait, so the response has to stay the real one.
    await page.route("**/api/appointments/quote", async (route) => {
      await new Promise((r) => setTimeout(r, QUOTE_DELAY_MS));
      await route.continue();
    });

    const cookies = await browserCookiesFor(QA_EMAILS.patientA);
    await page.context().clearCookies();
    await page.context().addCookies(cookies);
    await page.goto(`${BASE}/book`);
    await page.waitForLoadState("networkidle");

    await page.getByRole("button", { name: /Continue to Medical Details/i }).click();
    await page.waitForTimeout(1200);

    const concern = page.locator("select").filter({
      has: page.locator("option", { hasText: /Select what you need help with/i }),
    });
    await concern.selectOption({ index: 1 });
    await page.getByRole("checkbox").first().check();
    await page.waitForTimeout(300);

    await page.getByRole("button", { name: /Review Booking/i }).click();
  }

  /** The step's primary control, whatever its label resolves to. */
  function payButton(page: import("@playwright/test").Page) {
    return page.getByRole("button", {
      name: /Request Booking|Pay .* Now|Confirm booking/i,
    });
  }

  test("PAY-001 it is tappable while the price is still loading", async ({ page }) => {
    test.setTimeout(120_000);
    await reachStepThreeWithSlowQuote(page);

    const button = payButton(page);
    await expect(button).toBeVisible({ timeout: 30_000 });

    // The whole point: enabled immediately, with the quote still in flight.
    // `toBeEnabled` with no wait, so a button that is disabled now and
    // enabled in four seconds fails rather than passing on a retry.
    await expect(button).toBeEnabled({ timeout: 0 });
    await page.screenshot({ path: `${SHOTS}/01-quote-in-flight.png`, fullPage: true });

    // And still enabled once the read lands -- a control that only worked
    // before the fetch started would pass the line above and be no better.
    await page.waitForTimeout(QUOTE_DELAY_MS + 1_500);
    await expect(button).toBeEnabled();
    await page.screenshot({ path: `${SHOTS}/02-quote-settled.png`, fullPage: true });
  });

  test("PAY-002 the wait is stated on the screen rather than enforced on the button", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await reachStepThreeWithSlowQuote(page);

    // The flag that used to disable the button now explains itself instead.
    await expect(page.getByText(/Checking the latest price/i)).toBeVisible({ timeout: 30_000 });
    await expect(payButton(page)).toBeEnabled({ timeout: 0 });

    // It is a status, not a permanent line: it goes once the read lands.
    await expect(page.getByText(/Checking the latest price/i)).toBeHidden({
      timeout: QUOTE_DELAY_MS + 15_000,
    });
  });

  test("PAY-003 a tap during the read is acknowledged, not dropped", async ({ page }) => {
    test.setTimeout(120_000);
    await reachStepThreeWithSlowQuote(page);

    const button = payButton(page);
    await expect(button).toBeVisible({ timeout: 30_000 });
    await expect(button).toBeEnabled({ timeout: 0 });

    // Tapping while the price is in flight has to do something visible at
    // once. Refusing the tap is the bug; accepting it and showing nothing
    // until the read lands would be the same bug wearing a different hat.
    await button.click();
    await expect(button).toHaveText(/Please wait/i, { timeout: 3_000 });
    await page.screenshot({ path: `${SHOTS}/03-tap-acknowledged.png`, fullPage: true });
  });
});
