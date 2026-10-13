// Finding a patient from a Razorpay payment or order id.
//
// What an admin has in hand when a patient forwards a bank SMS, or a payment
// shows up on Razorpay's dashboard, is the id -- not a name. People ->
// Patients now matches it, and the matched card says which reference put it
// there. Rules: src/lib/paymentSearch.ts.
import { test, expect } from "@playwright/test";
import { BASE, QA_EMAILS, adminClient, browserCookiesFor, profileIdFor } from "./helpers";

test.describe("People search by payment reference", () => {
  test("PS-001: a pasted payment id or order id finds the patient and says which matched", async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const admin = adminClient();
    const patientId = await profileIdFor(admin, QA_EMAILS.patientA);
    const { data: patient } = await admin
      .from("profiles")
      .select("full_name")
      .eq("id", patientId)
      .single();
    const stamp = Date.now();
    // Payments refuse a DELETE by trigger, so this row stays until
    // `npm run clean:e2e -- --apply`, which finds it by this order prefix.
    const paymentId = `pay_e2esearch${stamp}`;
    const orderId = `order_e2esearch${stamp}`;
    const { data: row, error } = await admin
      .from("payments")
      .insert({
        patient_id: patientId,
        purpose: "other",
        razorpay_order_id: orderId,
        razorpay_payment_id: paymentId,
        amount_paise: 100,
        status: "created",
      })
      .select("id")
      .single();
    expect(error, error?.message).toBeNull();
    expect(row).toBeTruthy();

    const context = await browser.newContext();
    await context.addCookies(await browserCookiesFor(QA_EMAILS.admin));
    const page = await context.newPage();
    try {
      await page.goto(`${BASE}/admin/dashboard?section=people&tab=patients`);
      const search = page
        .getByRole("searchbox", { name: /payment ID/ })
        .filter({ visible: true })
        .first();
      await expect(search).toBeVisible({ timeout: 60_000 });

      // Pasted with the stray whitespace an SMS or a spreadsheet cell adds.
      await search.fill(`  ${paymentId}\n`);
      const card = page.getByText(patient!.full_name!).filter({ visible: true }).first();
      await expect(card).toBeVisible();
      await expect(page.getByTitle(`Matched payment ${paymentId}`).filter({ visible: true }).first()).toBeVisible();

      await search.fill(orderId);
      await expect(page.getByTitle(`Matched order ${orderId}`).filter({ visible: true }).first()).toBeVisible();

      // A name search never shows a payment chip.
      await search.fill(patient!.full_name!);
      await expect(page.getByTitle(/^Matched /).filter({ visible: true })).toHaveCount(0);
    } finally {
      await context.close();
    }
  });
});
