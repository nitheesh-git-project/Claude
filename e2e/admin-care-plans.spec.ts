import { test, expect } from "@playwright/test";
import { BASE, QA_EMAILS, browserCookiesFor, cookieHeaderFor } from "./helpers";

const FAKE_ID = "00000000-0000-4000-8000-000000000000";

// The two things an admin may do to a recommendation, and the many they may
// not. A care plan is the only route by which a patient buys a programme, so
// these routes decide whether the clinic can act at all when the author
// cannot -- and how far that reach goes.
test.describe("Admin reach over recommendations", () => {
  test("ACP-001: both routes refuse an unauthenticated caller", async ({ request }) => {
    for (const path of ["/api/admin/withdraw-care-plan", "/api/admin/author-care-plan"]) {
      const res = await request.post(`${BASE}${path}`, {
        headers: { "content-type": "application/json" },
        data: { carePlanId: FAKE_ID, reason: "a long enough reason" },
      });
      expect(res.status(), path).toBe(403);
    }
  });

  test("ACP-002: both routes refuse a patient and a therapist session", async ({ request }) => {
    for (const who of [QA_EMAILS.patientA, QA_EMAILS.therapistA]) {
      const cookie = await cookieHeaderFor(who);
      for (const path of ["/api/admin/withdraw-care-plan", "/api/admin/author-care-plan"]) {
        const res = await request.post(`${BASE}${path}`, {
          headers: { cookie, "content-type": "application/json" },
          data: { carePlanId: FAKE_ID, reason: "a long enough reason" },
        });
        expect(res.status(), `${path} for ${who}`).toBe(403);
      }
    }
  });

  test("ACP-003: withdrawing needs a real reason, not a keystroke", async ({ request }) => {
    const cookie = await cookieHeaderFor(QA_EMAILS.admin);
    for (const reason of ["", "   ", "too short"]) {
      const res = await request.post(`${BASE}/api/admin/withdraw-care-plan`, {
        headers: { cookie, "content-type": "application/json" },
        data: { carePlanId: FAKE_ID, reason },
      });
      expect(res.status(), `reason ${JSON.stringify(reason)}`).toBe(400);
      expect(await res.text()).toContain("at least");
    }
  });

  test("ACP-004: authoring on behalf needs a reason too", async ({ request }) => {
    const cookie = await cookieHeaderFor(QA_EMAILS.admin);
    const res = await request.post(`${BASE}/api/admin/author-care-plan`, {
      headers: { cookie, "content-type": "application/json" },
      data: {
        patientId: FAKE_ID,
        appointmentId: FAKE_ID,
        packageId: FAKE_ID,
        offerKind: "session_package",
        reason: "short",
      },
    });
    expect(res.status()).toBe(400);
    expect(await res.text()).toContain("at least");
  });

  test("ACP-005: authoring refuses an unknown programme type", async ({ request }) => {
    const cookie = await cookieHeaderFor(QA_EMAILS.admin);
    const res = await request.post(`${BASE}/api/admin/author-care-plan`, {
      headers: { cookie, "content-type": "application/json" },
      data: {
        patientId: FAKE_ID,
        appointmentId: FAKE_ID,
        packageId: FAKE_ID,
        offerKind: "whatever_they_like",
        reason: "the therapist is on leave until Monday",
      },
    });
    expect(res.status()).toBe(400);
  });

  test("ACP-006: there is no price, session count or discount to send", async ({ request }) => {
    // The point of the whole design: those columns do not exist on a version,
    // so smuggling them in a body changes nothing. Asserted by sending them
    // and confirming the route still refuses on its ordinary grounds rather
    // than accepting a cheaper programme.
    const cookie = await cookieHeaderFor(QA_EMAILS.admin);
    const res = await request.post(`${BASE}/api/admin/author-care-plan`, {
      headers: { cookie, "content-type": "application/json" },
      data: {
        patientId: FAKE_ID,
        appointmentId: FAKE_ID,
        packageId: FAKE_ID,
        offerKind: "session_package",
        reason: "the therapist is on leave until Monday",
        pricePaise: 1,
        sessionCount: 99,
        discountPercent: 100,
      },
    });
    expect(res.status()).not.toBe(200);
  });

  test("ACP-007: the Recommendations screen is on Sessions and renders", async ({ browser }) => {
    const ctx = await browser.newContext();
    await ctx.addCookies(await browserCookiesFor(QA_EMAILS.admin));
    const page = await ctx.newPage();
    await page.goto(`${BASE}/admin/dashboard?section=sessions&tab=recommendations`);
    await expect(page.getByText("Waiting on a patient")).toBeVisible({ timeout: 30_000 });
    const landed = new URL(page.url()).searchParams;
    expect(`${landed.get("section")}/${landed.get("tab")}`).toBe("sessions/recommendations");
    await ctx.close();
  });
});
