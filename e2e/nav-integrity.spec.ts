// The patient, therapist and hospital dashboards in a real browser.
//
// admin-dashboard-ui.spec.ts covers the admin dashboard's navigation
// (sections, deep links, reload, Back, phone overflow). The other three
// dashboards had no browser coverage at all -- which is how three links
// rotted unnoticed: the therapist's own *primary* action pointed at
// /therapist/dashboard#availability, an anchor left over from before the
// dashboard was split into routes; the therapist feed sent an answered
// recommendation to /therapist/dashboard/patients, a route that has never
// existed; and the hospital Overview offered "Account security" for a link
// that opens Edit Profile.
//
// scripts/check-nav-links.mjs catches the dead-link class statically and
// runs on every lint. This spec covers what a static check cannot see: that
// a nav entry actually navigates, that a deep link and a reload land on the
// same screen, that Back walks the history, and that the phone drawer opens,
// navigates and closes.
//
// Sessions are minted in Node and injected as cookies (browserCookiesFor),
// so a sandbox whose browser cannot reach Supabase still exercises the
// dashboards -- see that helper's comment.
import { test, expect, type Page } from "@playwright/test";
import { BASE, QA_EMAILS, browserCookiesFor } from "./helpers";
import {
  buildTherapistNavItems,
  buildPatientNavItems,
  HOSPITAL_NAV_ITEMS,
} from "../src/lib/dashboardNavItems";

const PHONE = { width: 390, height: 844 };

async function signIn(page: Page, email: string, landing: string) {
  await page.context().addCookies(await browserCookiesFor(email));
  const response = await page.goto(`${BASE}${landing}`);
  expect(response?.status(), `${landing} did not return 200`).toBe(200);
}

// Every nav entry that is always present for this role. The patient's list
// is conditional on what that patient owns, so only the unconditional
// entries are asserted here -- the conditional ones are covered by the
// static check, which reads them all.
const PATIENT_ROUTES = buildPatientNavItems({
  hasOwnedPackages: false,
  hasOnlineSessions: false,
  hasHomeVisits: false,
  hasOwnedHomeVisitPackages: false,
  hasSuggestions: false,
})
  .map((i) => i.href)
  .filter((h): h is string => typeof h === "string");

const THERAPIST_ROUTES = buildTherapistNavItems()
  .map((i) => i.href)
  .filter((h): h is string => typeof h === "string");

const HOSPITAL_ROUTES = HOSPITAL_NAV_ITEMS.map((i) => i.href).filter(
  (h): h is string => typeof h === "string"
);

test.describe("N-1: every dashboard route answers a deep link", () => {
  test.setTimeout(180_000);

  for (const [role, email, routes] of [
    ["patient", QA_EMAILS.patientA, PATIENT_ROUTES],
    ["therapist", QA_EMAILS.therapistA, THERAPIST_ROUTES],
    ["hospital", QA_EMAILS.hospital, HOSPITAL_ROUTES],
  ] as const) {
    test(`N-1-${role}: each nav route loads directly and survives a reload`, async ({ page }) => {
      await page.context().addCookies(await browserCookiesFor(email));
      for (const route of routes) {
        const response = await page.goto(`${BASE}${route}`);
        expect(response?.status(), `${route} did not return 200`).toBe(200);
        // The shell rendered rather than an error boundary. Every dashboard
        // carries this link in all three of its nav renders.
        await expect(
          page.getByRole("link", { name: "Back to Home" }).first(),
          `${route} did not render the dashboard shell`
        ).toBeVisible();
        await expect(page.getByText("Something went wrong")).toHaveCount(0);

        await page.reload();
        await expect(page).toHaveURL(new RegExp(`${route.replace(/\//g, "\\/")}$`));
      }
    });
  }
});

test.describe("N-2: the links that had rotted", () => {
  test.setTimeout(120_000);

  test("N-2-001: the therapist's primary action opens Availability, not the page it is on", async ({
    page,
  }) => {
    await signIn(page, QA_EMAILS.therapistA, "/therapist/dashboard");
    await page.getByRole("link", { name: /Set your availability/ }).click();
    // The bug was a fragment: the URL changed, the page did not.
    await expect(page).toHaveURL(/\/therapist\/dashboard\/availability$/);
    await expect(page.getByRole("heading", { name: "Your schedule" })).toBeVisible();
  });

  test("N-2-002: My Patients resolves — the feed's recommendation link used to 404", async ({
    page,
  }) => {
    await page.context().addCookies(await browserCookiesFor(QA_EMAILS.therapistA));
    const response = await page.goto(`${BASE}/therapist/dashboard/health-profile`);
    expect(response?.status()).toBe(200);
    // The route the feed used to point at.
    const dead = await page.goto(`${BASE}/therapist/dashboard/patients`);
    expect(dead?.status(), "/therapist/dashboard/patients should not exist").toBe(404);
  });

  test("N-2-003: the hospital action is named for the page it opens", async ({ page }) => {
    await signIn(page, QA_EMAILS.hospital, "/hospital/dashboard");
    await expect(page.getByRole("link", { name: /Edit profile/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Account security/ })).toHaveCount(0);
  });
});

test.describe("N-3: history and the phone drawer", () => {
  test.setTimeout(120_000);

  test("N-3-001: Back and Forward walk the dashboard's own history", async ({ page }) => {
    await signIn(page, QA_EMAILS.therapistA, "/therapist/dashboard");
    await page.getByRole("link", { name: "Sessions" }).first().click();
    await expect(page).toHaveURL(/\/therapist\/dashboard\/sessions$/);
    await page.getByRole("link", { name: "Earnings" }).first().click();
    await expect(page).toHaveURL(/\/therapist\/dashboard\/earnings$/);

    await page.goBack();
    await expect(page).toHaveURL(/\/therapist\/dashboard\/sessions$/);
    await page.goForward();
    await expect(page).toHaveURL(/\/therapist\/dashboard\/earnings$/);
  });

  test("N-3-002: on a phone the drawer opens, navigates and closes behind you", async ({ page }) => {
    await page.setViewportSize(PHONE);
    await signIn(page, QA_EMAILS.therapistA, "/therapist/dashboard");

    // The sidebar is hidden below lg; the only way through is the drawer.
    const open = page.getByRole("button", { name: "Open menu" });
    await expect(open).toBeVisible();
    await open.click();
    await expect(page.getByRole("button", { name: "Close menu" })).toBeVisible();

    await page.getByRole("link", { name: "Earnings" }).first().click();
    await expect(page).toHaveURL(/\/therapist\/dashboard\/earnings$/);
    // A drawer left open over the page it just navigated to is the classic
    // mobile-nav bug: the destination is unreachable behind its own menu.
    await expect(page.getByRole("button", { name: "Close menu" })).toHaveCount(0);
  });

  test("N-3-003: no dashboard scrolls sideways on a phone", async ({ page }) => {
    await page.setViewportSize(PHONE);
    for (const [email, routes] of [
      [QA_EMAILS.patientA, PATIENT_ROUTES],
      [QA_EMAILS.therapistA, THERAPIST_ROUTES],
      [QA_EMAILS.hospital, HOSPITAL_ROUTES],
    ] as const) {
      await page.context().clearCookies();
      await page.context().addCookies(await browserCookiesFor(email));
      for (const route of routes) {
        await page.goto(`${BASE}${route}`);
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth
        );
        expect(overflow, `${route} overflows the viewport by ${overflow}px`).toBeLessThanOrEqual(2);
      }
    }
  });
});
