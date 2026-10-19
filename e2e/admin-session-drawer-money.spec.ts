// ASD -- the money an admin reads in the Session Details drawer agrees with
// the row that opened it, and with itself.
//
// ASD-001 (QA F-10): an unpaid booking for a service priced below the
// standard fee read its own price on All Sessions and the patient's history,
// and "₹1,999 (estimated)" -- the global session fee -- in the drawer. Every
// one of those screens now prices through `sessionListPricePaise`
// (src/lib/sessionListPrice.ts).
//
// ASD-002 (QA F-22): a session refunded ₹200 and ₹100 whose cancellation
// refund then failed read three different refund states in one drawer. The
// cancellation line, the refund panel and the partial-refund form all read
// `describeRefundPosition` (src/lib/refundState.ts) now.
//
// Driven as a screen because the arithmetic is already unit-tested; what only
// a browser can show is that the drawer is handed the service's price and
// prints it. Rows are seeded directly and removed afterwards; nothing here
// reaches a gateway.
import { test, expect, type Browser } from "@playwright/test";
import { BASE, QA_EMAILS, adminClient, browserCookiesFor, profileIdFor, wholeHourFromNow } from "./helpers";
import { SESSION_FEE_PAISE } from "../src/lib/pricing";
import { formatRupees } from "../src/lib/formatMoney";

const db = adminClient();
const MARKER = "ZZ QA drawer money";
const CATEGORY_TITLE = "ZZ QA drawer money service";
const CATEGORY_PRICE_PAISE = 49_900; // ₹499, the QA finding's own figure

// Far enough out, and spread by a random whole hour, that no other spec's
// booking for the same patient overlaps it (trg_appointments_patient_no_overlap).
function farSlot(): string {
  return wholeHourFromNow(24 * 300 + Math.floor(Math.random() * 24 * 60));
}

async function openDrawer(browser: Browser, sessionCode: string) {
  const ctx = await browser.newContext();
  await ctx.addCookies(await browserCookiesFor(QA_EMAILS.admin));
  const page = await ctx.newPage();
  await page.goto(`${BASE}/admin/dashboard?section=sessions&tab=all`, { waitUntil: "domcontentloaded" });
  // Exact: every screen stays mounted, so a substring match also finds the
  // global search and Payment History's own filter.
  await page.getByPlaceholder("Session ID", { exact: true }).filter({ visible: true }).fill(sessionCode);
  const row = page.getByRole("row").filter({ hasText: sessionCode }).filter({ visible: true });
  await row.first().waitFor({ timeout: 60_000 });
  const rowText = (await row.first().innerText()) ?? "";
  await row.first().click();
  const drawer = page.getByRole("dialog").filter({ hasText: "Session Details" });
  await expect(drawer).toBeVisible({ timeout: 30_000 });
  return { ctx, page, drawer, rowText };
}

test.describe("ASD: the session drawer's money", () => {
  test("ASD-001: an unpaid booking is priced at its own service's price, as on the list", async ({ browser }) => {
    test.setTimeout(90_000);
    // Its own service, priced below the standard fee, rather than whatever
    // the database happens to hold: a fresh stack (the quality gate's) has no
    // service priced differently from ₹1,999, and an earlier version of this
    // test skipped there. Inactive, so it never reaches the public catalogue
    // or a spec counting live services -- the admin dashboard loads every
    // service, active or not, so the drawer still prices from it.
    // Found-or-created by title, so a run whose cleanup failed is reused
    // rather than collided with.
    const { data: existing } = await db
      .from("treatment_categories")
      .select("id, price_paise")
      .eq("title", CATEGORY_TITLE)
      .limit(1)
      .maybeSingle();
    const category =
      existing ??
      (
        await db
          .from("treatment_categories")
          .insert({
            title: CATEGORY_TITLE,
            points: [],
            price_paise: CATEGORY_PRICE_PAISE,
            duration_minutes: 60,
            active: false,
          })
          .select("id, price_paise")
          .single()
      ).data;
    expect(category, "seeded the fixture service").toBeTruthy();
    expect(category!.price_paise).not.toBe(SESSION_FEE_PAISE);

    const patientId = await profileIdFor(db, QA_EMAILS.patientA);
    const { data: seeded, error } = await db
      .from("appointments")
      .insert({
        patient_id: patientId,
        category_id: category!.id,
        concern: `${MARKER} unpaid`,
        slot_time: farSlot(),
        timezone: "Asia/Kolkata",
        duration_minutes: 60,
        status: "requested",
        visit_mode: "online",
        payment_status: "unpaid",
        amount_paid_paise: null,
      })
      .select("id, session_code")
      .single();
    expect(error, error?.message).toBeFalsy();

    try {
      const { ctx, drawer, rowText } = await openDrawer(browser, seeded!.session_code!);
      const price = `₹${formatRupees(category!.price_paise)}`;
      // The list and the drawer print the same figure...
      expect(rowText).toContain(price);
      await expect(drawer).toContainText(`${price} (estimated)`);
      // ...and the drawer no longer reaches for the global fee.
      await expect(drawer).not.toContainText(`₹${formatRupees(SESSION_FEE_PAISE)} (estimated)`);
      await ctx.close();
    } finally {
      await db.from("appointments").delete().eq("id", seeded!.id);
      await db.from("treatment_categories").delete().eq("id", category!.id);
    }
  });

  test("ASD-002: a failed cancellation refund after partial refunds reads as one refund state", async ({ browser }) => {
    // QA F-22, SS1295's history as the row records it: ₹1,999 paid, ₹200 and
    // ₹100 refunded, then a cancellation whose refund the gateway refused.
    // The drawer read "Paid / Refund failed", "₹1,699 refundable" and, under
    // Cancellation, "No payment to refund". Seeded directly: no gateway is
    // reached, and the refund form is opened but never submitted.
    test.setTimeout(90_000);
    const patientId = await profileIdFor(db, QA_EMAILS.patientA);
    const { data: seeded, error } = await db
      .from("appointments")
      .insert({
        patient_id: patientId,
        concern: `${MARKER} failed refund`,
        slot_time: farSlot(),
        timezone: "Asia/Kolkata",
        duration_minutes: 60,
        status: "cancelled",
        visit_mode: "online",
        payment_status: "paid",
        amount_paid_paise: 199_900,
        paid_at: new Date().toISOString(),
        razorpay_payment_id: `pay_qa_asd_${Date.now()}`,
        refund_status: "failed",
        refund_amount_paise: 30_000,
        cancellation_reason: "QA drawer refund state",
      })
      .select("id, session_code")
      .single();
    expect(error, error?.message).toBeFalsy();

    try {
      const { ctx, drawer } = await openDrawer(browser, seeded!.session_code!);
      await expect(drawer).toContainText(
        "₹300 refunded earlier; the refund of the remaining ₹1,699 failed - refund it from this session"
      );
      await expect(drawer).not.toContainText("No payment to refund");
      await expect(drawer).toContainText("Refund failed");
      await expect(drawer).toContainText("Refunded so far");
      await expect(drawer).toContainText("₹300 of ₹1,999");
      // The form's ceiling is the same ₹1,699.
      await drawer.getByRole("button", { name: "Refund part of this payment" }).click();
      await expect(drawer).toContainText("₹1,699 of ₹1,999 is still refundable.");
      await ctx.close();
    } finally {
      await db.from("appointments").delete().eq("id", seeded!.id);
    }
  });
});
