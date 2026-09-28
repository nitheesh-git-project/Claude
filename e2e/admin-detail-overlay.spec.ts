// ADMIN-DETAIL: a person's detail is the admin dashboard, whichever way the
// URL was reached.
//
// Tapped from inside the dashboard it is an intercepted route -- an overlay
// over the screen you were on. Reached any other way (a reload, a new tab, a
// shared link, a refresh that misses the router's own state) it used to fall
// back to a reduced frame of its own: a plain rail, no badges, no search,
// and a "Back to the dashboard" link. It was reported from the one flow that
// refreshes -- reassigning a session from a therapist's profile -- and it
// read as having been thrown out of the back office onto another site.
//
// Driven as screens because that is the whole of the change: the routes and
// the data are untouched, and every one of these assertions is about what a
// person sees.
import { test, expect, type Page } from "@playwright/test";
import { BASE, browserCookiesFor, QA_EMAILS, adminClient, profileIdFor } from "./helpers";

// A direct load now renders the dashboard as well as the detail, so these
// walks pay a full ~49-query render plus the detail's own.
const SLOW = 240_000;

async function expectDashboardChrome(page: Page) {
  // The three things the reduced frame could not have: the header's own
  // Refresh control, the global search, and the section badges.
  await expect(page.getByRole("button", { name: /Refresh this screen/ })).toHaveCount(1);
  await expect(page.getByPlaceholder(/Search name, phone, email/)).toHaveCount(1);
  // And the one thing it did have.
  await expect(page.getByText("Back to the dashboard")).toHaveCount(0);
}

test.describe("admin person detail", () => {
  test("AD-001: a direct load of a therapist URL is the dashboard with the detail over it", async ({
    page,
    context,
  }) => {
    test.setTimeout(SLOW);
    const admin = adminClient();
    const id = await profileIdFor(admin, QA_EMAILS.therapistA);

    await context.addCookies(await browserCookiesFor(QA_EMAILS.admin));
    await page.goto(`${BASE}/admin/dashboard/therapists/${id}`);
    await page.waitForLoadState("networkidle");

    await expect(page.locator("[aria-label='Close']")).toHaveCount(1);
    await expectDashboardChrome(page);
    await page.screenshot({ path: "/tmp/detail-01-therapist-direct.png" });
  });

  test("AD-002: closing lands on the screen it belongs to, without rebuilding the dashboard", async ({
    page,
    context,
  }) => {
    test.setTimeout(SLOW);
    const admin = adminClient();
    const id = await profileIdFor(admin, QA_EMAILS.therapistA);

    await context.addCookies(await browserCookiesFor(QA_EMAILS.admin));
    await page.goto(`${BASE}/admin/dashboard/therapists/${id}`);
    await page.waitForLoadState("networkidle");

    // Nothing may be fetched from the app to close an overlay over a
    // dashboard that is already rendered: router.push would re-run its ~49
    // queries to paint what is already on screen.
    // An RSC payload or a document is what a rebuild looks like on the wire;
    // the browser's own favicon fetch on a URL change is not.
    const rebuilds: string[] = [];
    page.on("request", (r) => {
      if (!r.url().startsWith(BASE)) return;
      if (r.resourceType() === "document" || r.url().includes("_rsc=")) rebuilds.push(r.url());
    });

    await page.locator("[aria-label='Close']").first().click();
    await expect(page.locator("[aria-label='Close']")).toHaveCount(0);
    await expect(page).toHaveURL(/\?section=people&tab=therapists$/);
    // The screen behind it is the one this detail belongs to -- not Today,
    // which is what reading the URL alone used to produce.
    await expect(page.getByRole("heading", { name: "Therapists" }).first()).toBeVisible();
    await expectDashboardChrome(page);
    expect(rebuilds, `closing refetched: ${rebuilds.join(", ")}`).toHaveLength(0);
    await page.screenshot({ path: "/tmp/detail-02-closed.png" });
  });

  test("AD-003: reassigning a session from the profile stays in the dashboard", async ({
    page,
    context,
  }) => {
    test.setTimeout(SLOW);
    const admin = adminClient();
    const therapistId = await profileIdFor(admin, QA_EMAILS.therapistA);
    const patientId = await profileIdFor(admin, QA_EMAILS.patientA);

    // A session to move. EditBookingForm renders for upcoming sessions only,
    // and the fixture therapist's own are all in the past.
    const slot = new Date(Date.now() + 5 * 86_400_000);
    slot.setHours(11, 0, 0, 0);
    const { data: created } = await admin
      .from("appointments")
      .insert({
        patient_id: patientId,
        therapist_id: therapistId,
        slot_time: slot.toISOString(),
        status: "confirmed",
        payment_status: "paid",
        concern: "ZZ QA detail overlay",
        duration_minutes: 45,
        amount_paid_paise: 120000,
        timezone: "Asia/Kolkata",
      })
      .select("id")
      .single();
    expect(created?.id, "seeded session").toBeTruthy();

    try {
      await context.addCookies(await browserCookiesFor(QA_EMAILS.admin));
      await page.goto(`${BASE}/admin/dashboard?section=people&tab=therapists`);
      await page.waitForLoadState("networkidle");
      await page.locator("p:visible").filter({ hasText: "QA Therapist A" }).first().click();

      const reassign = page
        .locator("button:visible")
        .filter({ hasText: /Reschedule \/ Reassign|Tap to assign/ })
        .first();
      await expect(reassign).toBeVisible({ timeout: 60_000 });
      await reassign.scrollIntoViewIfNeeded();
      await reassign.click();
      const save = page.locator("button:visible").filter({ hasText: /^Save/ }).first();
      await expect(save).toBeVisible();
      await save.click();

      // The refresh this fires is what used to swap the overlay for a
      // plainer page. Whatever the router does with it, what the admin sees
      // is the back office.
      await page.waitForTimeout(8000);
      await expectDashboardChrome(page);
      await page.screenshot({ path: "/tmp/detail-03-after-reassign.png" });
    } finally {
      if (created?.id) await admin.from("appointments").delete().eq("id", created.id);
    }
  });

  test("AD-004: the patient detail route answers the same way", async ({ page, context }) => {
    test.setTimeout(SLOW);
    const admin = adminClient();
    const id = await profileIdFor(admin, QA_EMAILS.patientA);

    await context.addCookies(await browserCookiesFor(QA_EMAILS.admin));
    await page.goto(`${BASE}/admin/dashboard/patients/${id}`);
    await page.waitForLoadState("networkidle");

    await expect(page.locator("[aria-label='Close']")).toHaveCount(1);
    await expectDashboardChrome(page);
    await page.locator("[aria-label='Close']").first().click();
    await expect(page).toHaveURL(/\?section=people&tab=patients$/);
    await page.screenshot({ path: "/tmp/detail-04-patient.png" });
  });
});
