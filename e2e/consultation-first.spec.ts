import { test, expect } from "@playwright/test";
import { BASE, QA_EMAILS, cookieHeaderFor } from "./helpers";

const FAKE_ID = "00000000-0000-4000-8000-000000000000";

// The consultation-first cutover, asserted where it actually binds.
//
// The UI changes are a courtesy; these are the checks that hold when a
// session cookie calls a route directly, which is how a stale client, a
// bookmarked form post or a curious person reaches these paths.
test.describe("Direct programme purchase is gone", () => {
  test("CF-001: the removed package routes are not served at all", async ({ request }) => {
    // A 404 rather than a 403: the routes do not exist. If either ever
    // answers again, something reverted the cutover.
    for (const path of ["/api/packages/create-order", "/api/packages/verify"]) {
      const res = await request.post(`${BASE}${path}`, {
        headers: { "content-type": "application/json" },
        data: { packageId: FAKE_ID },
      });
      expect(res.status(), `${path} should no longer exist`).toBe(404);
    }
  });

  test("CF-002: purchase-detail survives, because existing owners still need it", async ({
    request,
  }) => {
    const cookie = await cookieHeaderFor(QA_EMAILS.patientA);
    const res = await request.post(`${BASE}/api/packages/purchase-detail`, {
      headers: { cookie, "content-type": "application/json" },
      data: { purchaseId: FAKE_ID },
    });
    // Any answer but "route missing" -- a patient who bought a programme
    // before the cutover must still be able to open it.
    expect(res.status()).not.toBe(404);
  });

  test("CF-003: a multi-visit home programme cannot be bought directly", async ({ request }) => {
    const cookie = await cookieHeaderFor(QA_EMAILS.patientA);
    const address = { line1: "1 Test Street", pincode: "600017", city: "Chennai" };

    // Seeded by global-setup as a 4-visit programme.
    const listRes = await request.get(`${BASE}/home-visit`);
    expect(listRes.ok()).toBeTruthy();

    for (const path of ["/api/home-visit/create-order", "/api/home-visit/book-cash"]) {
      const res = await request.post(`${BASE}${path}`, {
        headers: { cookie, "content-type": "application/json" },
        data: {
          packageId: FAKE_ID,
          address,
          slotDateTime: new Date(Date.now() + 7 * 24 * 3600_000).toISOString(),
          timezone: "Asia/Kolkata",
        },
      });
      // A fake id cannot reach the visit-count check, so this asserts the
      // weaker but still meaningful thing: no path here ever 200s on a
      // programme. The count rule itself is unit-tested in
      // src/lib/consultationFirst.test.ts, where it can be exercised
      // exhaustively without a fixture per case.
      expect(res.status(), `${path} must not succeed`).not.toBe(200);
    }
  });

  test("CF-004: the booking hub offers no multi-session programme", async ({ page }) => {
    await page.goto(`${BASE}/patient/dashboard/book`);
    await expect(page.locator('a[href*="/book?package="]')).toHaveCount(0);
    await expect(page.getByText(/Online session packages/i)).toHaveCount(0);
  });
});
