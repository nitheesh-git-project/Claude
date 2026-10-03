// MOBILE: every role's dashboard, and the public pages a patient finds the
// clinic through, at phone width (Pixel 7, run by the `mobile` project in
// playwright.config.ts).
//
// - **MOB-001** public pages render without sideways scrolling.
// - **MOB-002** each role's dashboard renders at phone width, without
//   sideways scrolling, with its navigation reachable.
//
// Read-only: it signs in with the QA fixtures and looks. Like the rest of the
// suite it must never be pointed at a database holding real patients.
import { test, expect, type Page } from "@playwright/test";
import { BASE, browserCookiesFor, QA_EMAILS } from "./helpers";

async function expectNoSidewaysScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth
  );
  // One pixel of rounding is not a scrollbar.
  expect(overflow, "page is wider than the phone").toBeLessThanOrEqual(1);
}

async function settle(page: Page) {
  await page
    .waitForFunction(() => !document.documentElement.hasAttribute("data-splash"), null, {
      timeout: 30_000,
    })
    .catch(() => {});
  await page.waitForLoadState("networkidle").catch(() => {});
}

for (const path of ["/", "/book", "/home-visit", "/faq"]) {
  test(`MOB-001: ${path} fits a phone`, async ({ page }) => {
    test.setTimeout(120_000);
    const res = await page.goto(`${BASE}${path}`);
    expect(res?.status() ?? 200).toBeLessThan(500);
    await settle(page);
    await expectNoSidewaysScroll(page);
  });
}

const DASHBOARDS: { role: string; email: string; path: string }[] = [
  { role: "patient", email: QA_EMAILS.patientA, path: "/patient/dashboard" },
  { role: "therapist", email: QA_EMAILS.therapistA, path: "/therapist/dashboard" },
  { role: "hospital", email: QA_EMAILS.hospital, path: "/hospital/dashboard" },
  { role: "admin", email: QA_EMAILS.admin, path: "/admin/dashboard" },
];

for (const { role, email, path } of DASHBOARDS) {
  test(`MOB-002: the ${role} dashboard works at phone width`, async ({ page, context }) => {
    test.setTimeout(180_000);
    await context.addCookies(await browserCookiesFor(email));
    await page.goto(`${BASE}${path}`);
    await settle(page);
    expect(new URL(page.url()).pathname.startsWith(path)).toBe(true);
    await expectNoSidewaysScroll(page);
    // On a phone the sidebar is a drawer behind a menu button; one of the two
    // must be there, or there is no way to reach the other screens.
    const menu = page.getByRole("button", { name: /menu|navigation|open/i }).first();
    const nav = page.getByRole("navigation").first();
    const reachable = (await menu.isVisible().catch(() => false)) || (await nav.isVisible().catch(() => false));
    expect(reachable, "no visible menu button or navigation").toBe(true);
  });
}
