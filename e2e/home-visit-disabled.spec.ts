// HV-OFF: with the master switch off, nothing offers a home visit.
//
// The switch is flipped **straight in the database** here on purpose. Going
// through /api/admin/update-setting is the easy case: that route calls
// revalidatePath, so the ISR-cached pages are purged for it. Anything else
// that changes the column -- a hand edit, a data reset, a restore -- leaves
// those caches alone, and /book-home-visit is the page where being stale
// means quoting a price for a visit nobody will make. It renders per request
// for exactly that reason.
import { test, expect } from "@playwright/test";
import { BASE, browserCookiesFor, QA_EMAILS, adminClient, profileIdFor } from "./helpers";
const SHOT = "/tmp/claude-0/-home-user-Claude/4aa46951-8474-5745-b94b-f692208ce89d/scratchpad/shots";

test("HV-OFF-001: no page, link or offer survives the switch", async ({ page, context, request }) => {
  // It walks four dashboard pages and waits for each to go idle. Measured at
  // 29.3s against a 30s budget, so it was passing by four tenths of a second
  // -- a red line waiting for a slower afternoon, on a case that describes a
  // working product either way.
  test.setTimeout(180_000);

  const admin = adminClient();
  // Flipped straight in the database on purpose: that is the case ISR could
  // not survive, since nothing calls revalidatePath.
  await admin.from("site_settings").update({ home_visit_enabled: false }).not("id", "is", null);
  try {
    await context.addCookies(await browserCookiesFor(QA_EMAILS.patientA));
    for (const p of ["/book-home-visit", "/home-visit"]) {
      const res = await request.get(`${BASE}${p}`);
      console.log(p, res.status());
      expect(res.status()).toBe(404);
    }
    for (const p of [
      "/patient/dashboard",
      "/patient/dashboard/book",
      "/patient/dashboard/suggested",
      "/patient/dashboard/sessions",
    ]) {
      await page.goto(`${BASE}${p}`);
      await page.waitForLoadState("networkidle");
      const links = await page.locator('a[href*="home-visit"]').count();
      const html = await page.content();
      console.log(p, "links:", links, "mentions:", (html.match(/[Hh]ome [Vv]isit/g) ?? []).length);
      expect(links, `${p} links to home visit`).toBe(0);
    }
    await page.goto(`${BASE}/patient/dashboard/book`);
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: `${SHOT}/hv-off-book.png`, fullPage: false });
  } finally {
    await admin.from("site_settings").update({ home_visit_enabled: true }).not("id", "is", null);
  }
});

// HV-OFF-002: the switch says what it does not cancel, and asks first.
//
// Driven as a screen because nothing here changes a route or a row: the
// commitment count is a read the page already had, and what was missing was
// an admin being able to see it before switching a service off. The number
// itself is unit-tested (`homeVisitCommitment.test.ts`); what needs a real
// browser is that the dialog appears at all, that cancelling changes
// nothing, and that the **on** direction asks nothing -- turning a service on
// takes nothing from anybody, and a prompt there is the dialog nobody reads.
test("HV-OFF-002: switching off asks first only when something is owed", async ({
  page,
  context,
}) => {
  // Every toggle here fires a router.refresh(), and refreshing the admin
  // dashboard re-runs ~49 queries and re-renders all 34 screens. Six of those
  // plus two cold loads is minutes, not seconds -- which is the dashboard
  // working as designed rather than anything this case is testing.
  test.setTimeout(240_000);

  const admin = adminClient();
  await admin.from("site_settings").update({ home_visit_enabled: true }).not("id", "is", null);
  await context.addCookies(await browserCookiesFor(QA_EMAILS.admin));

  // No networkidle anywhere in this case: this sandbox blocks the *browser*
  // from reaching Supabase, so RealtimeRefresh's socket retries for ever and
  // the page is never idle. Everything read here is server-rendered.
  const settingsUrl = `${BASE}/admin/dashboard?section=settings&tab=programmes`;
  const toggle = page.getByRole("button", { name: "Home Visit enabled" });

  // --- Nothing outstanding: no note, no dialog, one tap. ---------------
  // The default, and worth asserting: a confirmation that always appears is
  // the dialog nobody reads, which is what would make the one that matters
  // invisible.
  await admin
    .from("home_visit_package_purchases")
    .delete()
    .eq("notes", "e2e HV-OFF-002 fixture");
  await page.goto(settingsUrl);
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await toggle.click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");

  // --- Three visits owed: the switch says so, and asks. ----------------
  const { data: pkg } = await admin
    .from("home_visit_packages")
    .select("id")
    .eq("active", true)
    .limit(1)
    .single();
  const patientId = await profileIdFor(admin, QA_EMAILS.patientA);
  const { data: purchase, error: insertError } = await admin
    .from("home_visit_package_purchases")
    .insert({
      patient_id: patientId,
      package_id: pkg!.id,
      visit_count: 4,
      visits_used: 1,
      status: "active",
      payment_status: "paid",
      notes: "e2e HV-OFF-002 fixture",
    })
    .select("id")
    .single();
  expect(insertError, insertError?.message).toBeNull();

  try {
    await page.goto(settingsUrl);
    // The count is a purchase the map in ADM-CAT-012 could not show: this
    // fixture carries no address, so it belongs to no area.
    await expect(page.getByText(/3 paid visits across 1 purchase/i)).toBeVisible();

    await toggle.click();
    // ConfirmDialog is an **alertdialog**, not a dialog: it interrupts to ask
    // a question and its message is its own name.
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(/3 paid visits across 1 purchase/i);
    await expect(dialog).toContainText(/only stops new sales/i);
    await page.screenshot({ path: `${SHOT}/hv-off-confirm.png`, fullPage: false });

    // Cancelling leaves both the switch and the column as they were.
    await dialog.getByRole("button", { name: "No" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    const { data: still } = await admin
      .from("site_settings")
      .select("home_visit_enabled")
      .limit(1)
      .single();
    expect(still?.home_visit_enabled, "cancelling must not write").toBe(true);

    await toggle.click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Yes" }).click();
    await expect(toggle).toHaveAttribute("aria-pressed", "false");

    // The on direction asks nothing: turning a service on takes nothing from
    // anybody.
    await toggle.click();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
  } finally {
    await admin.from("home_visit_package_purchases").delete().eq("id", purchase!.id);
    await admin.from("site_settings").update({ home_visit_enabled: true }).not("id", "is", null);
  }
});
