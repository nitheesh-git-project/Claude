import { test, expect } from "@playwright/test";
import { BASE, QA_EMAILS, adminClient, browserCookiesFor, profileIdFor } from "./helpers";

/**
 * The admin finds a screen by the word they use, a payment by its Razorpay
 * ID, who opened whose dashboard and why, and every refund.
 *
 * FIND-002 and FIND-005 seed their own rows (a payment; a paid session with a
 * refund) so they run on a fresh database; the rest only read.
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
    // Its own payment, so it runs on a fresh database too. Payments refuse a
    // DELETE by trigger, so the row stays until `npm run clean:e2e -- --apply`,
    // which finds it by the same order prefix admin-payment-search uses.
    const admin = adminClient();
    const { data: patient } = await admin.from("profiles").select("id").eq("email", QA_EMAILS.patientA).single();
    const stamp = Date.now();
    const payId = `pay_e2esearch${stamp}`;
    const { error } = await admin.from("payments").insert({
      patient_id: patient!.id,
      purpose: "other",
      razorpay_order_id: `order_e2esearch${stamp}`,
      razorpay_payment_id: payId,
      amount_paise: 100,
      status: "created",
    });
    expect(error, error?.message).toBeNull();
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

  test("FIND-005 a refund shows in Transactions' Refunded column and on the payment's card; a session paid ahead shows on Summary", async ({ page }) => {
    // A session paid today for a date well ahead, partly refunded on the
    // Razorpay website: the session's own columns and the refund mirror, as
    // the webhook writes them. Removed again at the end.
    const admin = adminClient();
    const patientId = await profileIdFor(admin, QA_EMAILS.patientB);
    const { data: category } = await admin.from("treatment_categories").select("id").eq("active", true).limit(1).single();
    const stamp = Date.now();
    const payId = `pay_e2eRefCol${stamp.toString(36)}`;
    const refundId = `rfnd_e2eRefCol${stamp.toString(36)}`;
    const day = new Date(Date.now() + (400 + (stamp % 300)) * 86_400_000);
    const slot = new Date(`${day.toISOString().slice(0, 10)}T10:00:00+05:30`).toISOString();
    const { data: session, error } = await admin
      .from("appointments")
      .insert({
        patient_id: patientId,
        category_id: category!.id,
        slot_time: slot,
        status: "requested",
        payment_status: "paid",
        paid_at: new Date().toISOString(),
        amount_paid_paise: 49900,
        razorpay_payment_id: payId,
        concern: "FIND-005 fixture",
        refund_status: "processed",
        refund_amount_paise: 10000,
        refund_id: refundId,
        refunded_at: new Date().toISOString(),
        refund_reason: `Refunded on Razorpay (${refundId})`,
      })
      .select("id")
      .single();
    expect(error, error?.message).toBeNull();
    try {
      const mirror = await admin.from("razorpay_refunds").insert({
        razorpay_refund_id: refundId,
        razorpay_payment_id: payId,
        amount_paise: 10000,
        status: "processed",
        source: "razorpay",
        appointment_id: session!.id,
        patient_id: patientId,
        applied: "applied",
        processed_at: new Date().toISOString(),
      });
      expect(mirror.error, mirror.error?.message).toBeNull();

      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(`${BASE}/admin/dashboard?section=money&tab=transactions&view=ref:${payId}`);
      await expect(page.getByRole("columnheader", { name: "Refunded" }).first()).toBeVisible({ timeout: 90_000 });
      const row = page.getByRole("row").filter({ hasText: "₹499" }).filter({ hasText: "−₹100" }).first();
      await expect(row).toBeVisible();
      await row.getByRole("button", { name: "View" }).click();
      const refunds = page.getByTestId("receipt-refunds");
      await expect(refunds).toContainText("on the Razorpay website");
      await expect(refunds).toContainText(refundId);
      await expect(refunds).toContainText("₹100");
      await expect(refunds.getByText("Kept after refunds")).toBeVisible();
      await expect(refunds).toContainText("₹399");
      await page.screenshot({ path: `${SHOTS}/transactions-refund-card.png` });

      // Counted on the session's date, so the default range (to today) leaves
      // it out of the figures -- and the line says where it went.
      await page.goto(`${BASE}/admin/dashboard?section=money&tab=summary`);
      // Every screen is drawn at once; Business Health carries the same line.
      const note = page.getByTestId("paid-ahead-note").filter({ visible: true });
      await expect(note).toBeVisible({ timeout: 90_000 });
      await expect(note).toContainText("Paid for upcoming sessions");
      await page.screenshot({ path: `${SHOTS}/summary-paid-ahead.png` });
    } finally {
      await admin.from("razorpay_refunds").delete().eq("razorpay_refund_id", refundId);
      await admin.from("appointments").delete().eq("id", session!.id);
    }
  });
});
