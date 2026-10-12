// Paying for a booking left unpaid goes back to the wizard's own Step 3.
//
// Pay on an unpaid session used to open Razorpay from the dashboard card,
// with no code field: a patient whose first try failed after they applied a
// promo code was asked for the full price and could not apply it again. The
// order route also handed back an open prior order at its old amount before
// re-pricing, so the figure on screen and the figure charged could differ.
// And every abandoned checkout sat in the admin's "Sessions with no
// therapist" queue. Rules: src/lib/resumeCheckout.ts, sessionAssignQueue.ts.
import { test, expect, type Page } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  BASE,
  QA_EMAILS,
  adminClient,
  browserCookiesFor,
  cookieHeaderFor,
  waitForSplashToClear,
} from "./helpers";

const DISCOUNT_PAISE = 20000;

function slotInDays(days: number, hourIst = 18): string {
  // A whole hour in IST, the clinic's zone.
  const d = new Date(Date.now() + days * 86_400_000);
  d.setUTCHours(hourIst - 5, 30, 0, 0);
  return d.toISOString();
}

test.describe("Finishing payment for an unpaid booking", () => {
  let admin: SupabaseClient;
  let patientId = "";
  let patientEmail = "";
  let categoryId = "";
  let listPricePaise = 0;
  let promo = { id: "", code: "" };
  let promoWasEnabled = false;
  const appointmentIds: string[] = [];

  async function draft(over: Record<string, unknown> = {}): Promise<string> {
    const { data, error } = await admin
      .from("appointments")
      .insert({
        patient_id: patientId,
        category_id: categoryId,
        concern: "QA Resume Checkout",
        slot_time: slotInDays(3 + appointmentIds.length),
        timezone: "Asia/Kolkata",
        duration_minutes: 45,
        status: "requested",
        payment_status: "unpaid",
        visit_mode: "online",
        ...over,
      })
      .select("id")
      .single();
    expect(data?.id, `seeded booking: ${error?.message ?? ""}`).toBeTruthy();
    appointmentIds.push(data!.id);
    return data!.id as string;
  }

  test.beforeAll(async () => {
    admin = adminClient();
    const stamp = Date.now();
    patientEmail = `qa.resume.${stamp}@example.test`;
    const { data: created, error } = await admin.auth.admin.createUser({
      email: patientEmail,
      password: "QaTest!2024pass",
      email_confirm: true,
      user_metadata: { role: "patient", full_name: `QA Resume ${stamp}` },
    });
    expect(error, error?.message).toBeNull();
    patientId = created!.user!.id;
    await admin
      .from("profiles")
      .update({ role: "patient", approved: true, active: true, full_name: `QA Resume ${stamp}` })
      .eq("id", patientId);

    const { data: category } = await admin
      .from("treatment_categories")
      .select("id, price_paise")
      .eq("active", true)
      .gt("price_paise", DISCOUNT_PAISE * 2)
      .limit(1)
      .single();
    categoryId = category!.id;
    listPricePaise = category!.price_paise;

    const { data: settings } = await admin.from("site_settings").select("promo_codes_enabled").single();
    promoWasEnabled = settings?.promo_codes_enabled === true;
    await admin.from("site_settings").update({ promo_codes_enabled: true }).not("id", "is", null);

    const code = `QARESUME${String(stamp).slice(-6)}`;
    const { data: promoRow, error: promoError } = await admin
      .from("promo_codes")
      .insert({ code, kind: "amount_off", value: DISCOUNT_PAISE, active: true })
      .select("id")
      .single();
    expect(promoError, promoError?.message).toBeNull();
    promo = { id: promoRow!.id, code };
  });

  test.afterAll(async () => {
    if (appointmentIds.length) {
      await admin.from("appointments").delete().in("id", appointmentIds);
    }
    if (promo.id) await admin.from("promo_codes").delete().eq("id", promo.id);
    await admin
      .from("site_settings")
      .update({ promo_codes_enabled: promoWasEnabled })
      .not("id", "is", null);
    if (patientId) await admin.auth.admin.deleteUser(patientId);
  });

  async function signIn(page: Page) {
    await page.context().addCookies(await browserCookiesFor(patientEmail));
  }

  test("RES-001: Pay on the session card reopens Step 3 with the earlier code applied again", async ({ page }) => {
    test.setTimeout(120_000);
    // The failed attempt claimed the code; its 30-minute hold has lapsed.
    const id = await draft({
      promo_code_id: promo.id,
      promo_claimed_at: new Date(Date.now() - 2 * 3_600_000).toISOString(),
    });
    await signIn(page);
    await page.goto(`${BASE}/patient/dashboard/sessions`);
    await waitForSplashToClear(page);
    const pay = page.locator(`a[data-testid="resume-checkout"][href="/book?resume=${id}"]`).first();
    await expect(pay).toBeVisible({ timeout: 60_000 });
    await expect(pay).toHaveText("Pay now");
    await pay.click();

    await expect(page).toHaveURL(new RegExp(`/book\\?resume=${id}`));
    await expect(page.getByText("Step 3 of 3")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(`${promo.code}`, { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/applied -/)).toBeVisible();
    const discounted = `₹${((listPricePaise - DISCOUNT_PAISE) / 100).toLocaleString("en-IN")}`;
    await expect(page.getByRole("button", { name: new RegExp(`Pay .*${discounted.replace(/[₹,]/g, ".")}.* Now`) })).toBeVisible({
      timeout: 30_000,
    });

    // Removing it puts the full price back on the button.
    await page.getByRole("button", { name: "Remove" }).click();
    const full = `₹${(listPricePaise / 100).toLocaleString("en-IN")}`;
    await expect(page.getByRole("button", { name: new RegExp(`Pay .*${full.replace(/[₹,]/g, ".")}.* Now`) })).toBeVisible({
      timeout: 30_000,
    });
  });

  test("RES-002: a changed price mints a new order instead of reusing the old amount", async () => {
    test.setTimeout(120_000);
    const id = await draft();
    const cookie = await cookieHeaderFor(patientEmail);
    const order = async (promoCode?: string) => {
      const res = await fetch(`${BASE}/api/razorpay/create-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify({ appointmentId: id, ...(promoCode ? { promoCode } : {}) }),
      });
      const body = await res.json();
      expect(res.status, JSON.stringify(body)).toBe(200);
      return body as { orderId: string; amount: number };
    };

    // The reported order: a first try at full price left an open order, then
    // a code was applied. The sheet must open at the quoted figure, on a new
    // order, not at the old order's amount.
    const fullPrice = await order();
    expect(fullPrice.amount).toBe(listPricePaise);

    const withCode = await order(promo.code);
    expect(withCode.amount).toBe(listPricePaise - DISCOUNT_PAISE);
    expect(withCode.orderId).not.toBe(fullPrice.orderId);
    const { data: discounted } = await admin
      .from("appointments")
      .select("promo_code_id, razorpay_order_id, amount_paid_paise")
      .eq("id", id)
      .single();
    expect(discounted).toMatchObject({
      promo_code_id: promo.id,
      razorpay_order_id: withCode.orderId,
      amount_paid_paise: listPricePaise - DISCOUNT_PAISE,
    });

    // Same price again: the open order is reused.
    const again = await order(promo.code);
    expect(again.orderId).toBe(withCode.orderId);

    // No code now: a new order at the full price, and the code is no longer
    // named on a booking it took nothing off.
    const withoutCode = await order();
    expect(withoutCode.amount).toBe(listPricePaise);
    expect(withoutCode.orderId).not.toBe(withCode.orderId);
    const { data: row } = await admin
      .from("appointments")
      .select("promo_code_id, razorpay_order_id, amount_paid_paise")
      .eq("id", id)
      .single();
    expect(row).toMatchObject({
      promo_code_id: null,
      razorpay_order_id: withoutCode.orderId,
      amount_paid_paise: listPricePaise,
    });
  });

  test("RES-003: a booking whose time has gone asks for a new time and keeps the rest", async ({ page }) => {
    test.setTimeout(120_000);
    const id = await draft({ slot_time: new Date(Date.now() + 2 * 3_600_000).toISOString() });
    await signIn(page);
    await page.goto(`${BASE}/book?resume=${id}`);
    await expect(page.getByText(/isn't available any more\. Pick a new time/)).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByText("Step 1 of 3")).toBeVisible();
  });

  test("RES-004: a paid booking is not checked out again", async ({ page }) => {
    test.setTimeout(120_000);
    const id = await draft({ payment_status: "paid", status: "confirmed" });
    await signIn(page);
    await page.goto(`${BASE}/book?resume=${id}`);
    await expect(page.getByTestId("resume-blocked")).toContainText("already paid", { timeout: 60_000 });
  });

  test("RES-005: an unpaid checkout waits on payment, not on the admin's assign queue", async ({ browser }) => {
    test.setTimeout(120_000);
    const id = await draft();
    const { data: row } = await admin.from("appointments").select("session_code").eq("id", id).single();
    const sessionCode = row!.session_code as string;
    const context = await browser.newContext();
    await context.addCookies(await browserCookiesFor(QA_EMAILS.admin));
    const page = await context.newPage();
    try {
      await page.goto(`${BASE}/admin/dashboard?section=sessions&tab=all&view=awaiting_payment`);
      await waitForSplashToClear(page);
      await page.getByPlaceholder("Session ID").filter({ visible: true }).first().fill(sessionCode);
      const rowLocator = page.locator("tr", { hasText: sessionCode }).filter({ visible: true }).first();
      await expect(rowLocator).toBeVisible({ timeout: 60_000 });
      await expect(rowLocator).toContainText("Awaiting payment");
      await expect(rowLocator).not.toContainText("Tap to assign");

      await page.goto(`${BASE}/admin/dashboard?section=sessions&tab=all&view=unassigned`);
      await waitForSplashToClear(page);
      await page.getByPlaceholder("Session ID").filter({ visible: true }).first().fill(sessionCode);
      await expect(page.locator("tr", { hasText: sessionCode }).filter({ visible: true })).toHaveCount(0, {
        timeout: 30_000,
      });
    } finally {
      await context.close();
    }
  });
});
