import { test, expect } from "@playwright/test";
import { BASE, QA_EMAILS, adminClient, browserCookiesFor } from "./helpers";

/**
 * The admin finds a screen by the word they use, a payment by its Razorpay
 * ID, who opened whose dashboard and why, and every refund.
 *
 * Read-only: nothing here writes a row.
 */
const SHOTS = "e2e/screenshots/admin-find";

test.describe("finding things in the admin dashboard", () => {
  test.setTimeout(180_000);

  test.beforeEach(async ({ context }) => {
    await context.addCookies(await browserCookiesFor(QA_EMAILS.admin));
  });

  test("FIND-001 the top search finds Promo codes by the word 'promo' and opens the screen they live on", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${BASE}/admin/dashboard`);
    const search = page.getByRole("searchbox", { name: "Search the admin dashboard" });
    await expect(search).toBeVisible({ timeout: 90_000 });
    await search.fill("promo");
    const screens = page.getByTestId("search-screens");
    await expect(screens.getByText("Promo codes")).toBeVisible();
    await expect(screens.getByText("Money › Costs")).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/search-promo.png` });
    await screens.getByRole("link", { name: /Promo codes/ }).click();
    await expect(page).toHaveURL(/section=money&tab=costs/);
  });

  test("FIND-002 a Razorpay payment ID finds the payment and opens Transactions filtered to it", async ({ page }) => {
    const { data } = await adminClient()
      .from("payments")
      .select("razorpay_payment_id")
      .not("razorpay_payment_id", "is", null)
      .limit(1)
      .maybeSingle();
    test.skip(!data?.razorpay_payment_id, "no payment with a Razorpay ID on this database");
    const payId = data!.razorpay_payment_id as string;
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${BASE}/admin/dashboard`);
    const search = page.getByRole("searchbox", { name: "Search the admin dashboard" });
    await expect(search).toBeVisible({ timeout: 90_000 });
    await search.fill(payId);
    const result = page.getByRole("link", { name: new RegExp(payId) }).first();
    await expect(result).toBeVisible();
    await result.click();
    await expect(page).toHaveURL(/section=money&tab=transactions/);
    await expect(page.getByRole("searchbox", { name: "Filter by session, programme or payment ID" })).toHaveValue(payId);
  });

  test("FIND-003 Logs → Signed in as and Money → Refunds open, with their filters", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${BASE}/admin/dashboard?section=logs&tab=signed-in-as`);
    const log = page.getByTestId("impersonation-log");
    await expect(log).toBeVisible({ timeout: 90_000 });
    await expect(log.getByLabel("Name or reason")).toBeVisible();
    await expect(log.getByLabel("Whose dashboard")).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/signed-in-as-phone.png`, fullPage: false });

    await page.goto(`${BASE}/admin/dashboard?section=money&tab=refunds`);
    const refunds = page.getByTestId("refunds-tab");
    await expect(refunds).toBeVisible({ timeout: 90_000 });
    await expect(refunds.getByRole("searchbox", { name: "Search refunds" })).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/refunds-phone.png`, fullPage: false });
  });

  test("FIND-004 Money → Payouts shows what each therapist asked for and when they were last paid", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${BASE}/admin/dashboard?section=money&tab=payouts`);
    await expect(page.getByRole("columnheader", { name: "Requested" })).toBeVisible({ timeout: 90_000 });
    await expect(page.getByRole("columnheader", { name: "Last paid" })).toBeVisible();
    await expect(page.getByRole("radio", { name: /Asked to be paid/ }).or(page.getByRole("button", { name: /Asked to be paid/ })).first()).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/payouts.png` });
  });
});
