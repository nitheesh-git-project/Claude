// ASD -- the money an admin reads in the Session Details drawer agrees with
// the row that opened it, and with itself.
//
// ASD-001 (QA F-10): an unpaid booking for a service priced below the
// standard fee read its own price on All Sessions and the patient's history,
// and "₹1,999 (estimated)" -- the global session fee -- in the drawer. Every
// one of those screens now prices through `sessionListPricePaise`
// (src/lib/sessionListPrice.ts).
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
    const { data: category } = await db
      .from("treatment_categories")
      .select("id, title, price_paise")
      .eq("active", true)
      .neq("price_paise", SESSION_FEE_PAISE)
      .gt("price_paise", 0)
      .limit(1)
      .maybeSingle();
    test.skip(!category, "no active service priced differently from the standard fee to tell the two apart");

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
    }
  });
});
