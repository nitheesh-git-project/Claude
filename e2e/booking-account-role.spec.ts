// Who is allowed to book, and what the other roles are shown instead.
//
// One auth user carries exactly one role, so a therapist, hospital or admin
// session can never be the patient a booking is for. Booking anyway used to
// succeed and produced a session that account could never see again -- the
// therapist dashboard lists by therapist_id, the hospital dashboard lists
// referrals, and the proxy bounces a non-patient away from
// /patient/dashboard -- after real money had moved.
//
// Both halves are covered here, because the UI half alone is not the fix: a
// valid session cookie can call the purchase routes directly, and the
// wizard's own insert is guarded only by RLS.
import { test, expect, type Page } from "@playwright/test";
import { BASE, QA_EMAILS, browserCookiesFor, cookieHeaderFor } from "./helpers";

// A well-formed uuid that does not resolve to anything -- the role check
// runs before any lookup, so nothing needs to exist behind it.
const FAKE_ID = "00000000-0000-4000-8000-000000000000";

async function signInAs(page: Page, email: string) {
  await page.context().addCookies(await browserCookiesFor(email));
}

test.describe("Only a patient account can book", () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1280, height: 1000 });
  });

  test("BR-001: a therapist is told why, and offered their dashboard", async ({ page }) => {
    await signInAs(page, QA_EMAILS.therapistA);
    await page.goto(`${BASE}/book`);
    await expect(page.getByText("You're signed in as a therapist")).toBeVisible();
    await expect(page.getByRole("link", { name: /Go to my dashboard/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Sign out and book/i })).toBeVisible();
    // Signing out here ends the staff session -- said before the click, not
    // discovered after it.
    await expect(page.getByText(/Signing out ends your therapist session/)).toBeVisible();
  });

  test("BR-002: a hospital is pointed at referrals, not booking", async ({ page }) => {
    await signInAs(page, QA_EMAILS.hospital);
    await page.goto(`${BASE}/book`);
    await expect(page.getByText("You're signed in as a hospital partner")).toBeVisible();
    await expect(page.getByRole("link", { name: /Refer a patient/i })).toHaveAttribute(
      "href",
      "/hospital/dashboard#refer"
    );
  });

  test("BR-003: an admin is pointed at booking on a patient's behalf", async ({ page }) => {
    await signInAs(page, QA_EMAILS.admin);
    await page.goto(`${BASE}/book`);
    await expect(page.getByText("You're signed in as an admin")).toBeVisible();
    await expect(page.getByRole("link", { name: /Book for a patient/i })).toBeVisible();
  });

  test("BR-004: a patient still gets the wizard", async ({ page }) => {
    await signInAs(page, QA_EMAILS.patientA);
    await page.goto(`${BASE}/book`);
    await expect(page.getByText(/You're signed in as/)).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Continue/i }).first()).toBeVisible();
  });

  test("BR-005: the home-visit wizard applies the same rule", async ({ page }) => {
    await signInAs(page, QA_EMAILS.therapistA);
    await page.goto(`${BASE}/book-home-visit`);
    await expect(page.getByText("You're signed in as a therapist")).toBeVisible();
  });

  // The UI card is a courtesy. These are the checks that actually hold: a
  // session cookie calling the route directly, around the wizard entirely.
  test("BR-006: the purchase routes refuse a non-patient session", async ({ request }) => {
    const cookie = await cookieHeaderFor(QA_EMAILS.therapistA);
    // Bodies are shaped well enough to clear each route's own field
    // validation, which runs before the account checks -- the ids need not
    // exist, since the role gate sits ahead of any lookup. A body that
    // failed validation would 400 and prove nothing about the role.
    const address = { line1: "1 Test Street", pincode: "600017", city: "Chennai" };
    const cases: { path: string; data: Record<string, unknown> }[] = [
      { path: "/api/razorpay/create-order", data: { appointmentId: FAKE_ID } },
      { path: "/api/packages/create-order", data: { packageId: FAKE_ID } },
      { path: "/api/home-visit/create-order", data: { packageId: FAKE_ID, address } },
      {
        path: "/api/home-visit/book-cash",
        data: {
          packageId: FAKE_ID,
          address,
          slotDateTime: new Date(Date.now() + 7 * 24 * 3600_000).toISOString(),
          timezone: "Asia/Kolkata",
        },
      },
    ];

    for (const { path, data } of cases) {
      const res = await request.post(`${BASE}${path}`, {
        headers: { cookie, "content-type": "application/json" },
        data,
      });
      expect(res.status(), `${path} should reject a therapist session`).toBe(403);
      expect(await res.text()).toContain("patient account");
    }
  });
});

test.describe("Back to Home on the dashboards", () => {
  const DASHBOARDS = [
    { email: QA_EMAILS.patientA, path: "/patient/dashboard" },
    { email: QA_EMAILS.therapistA, path: "/therapist/dashboard" },
    { email: QA_EMAILS.hospital, path: "/hospital/dashboard" },
    { email: QA_EMAILS.admin, path: "/admin/dashboard" },
  ];

  test("BH-001: every dashboard offers a way back to the public site", async ({ page }) => {
    test.setTimeout(180_000);
    // The four dashboards are all in NAV_HIDDEN_ROUTES, so before this the
    // only way off them was Log Out -- which also ended the session.
    await page.setViewportSize({ width: 1280, height: 1000 });
    for (const { email, path } of DASHBOARDS) {
      await signInAs(page, email);
      await page.goto(`${BASE}${path}`);
      const home = page.locator('nav a[href="/"]', { hasText: "Back to Home" }).first();
      await expect(home, `${path} should have a Back to Home link`).toBeVisible({
        timeout: 60_000,
      });
    }
  });

  test("BH-002: it lands on the public home page with the session intact", async ({ page }) => {
    await signInAs(page, QA_EMAILS.patientA);
    await page.goto(`${BASE}/patient/dashboard`);
    await page.locator('nav a[href="/"]', { hasText: "Back to Home" }).first().click();
    await page.waitForURL(`${BASE}/`);
    // Still signed in: the nav offers the dashboard rather than Sign In,
    // which is what makes "go home, then book" work as the same patient.
    await expect(page.getByRole("link", { name: /Go to Dashboard/i }).first()).toBeVisible({
      timeout: 30_000,
    });
  });
});
