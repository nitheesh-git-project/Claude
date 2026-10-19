// The public pages and /book hydrate without a server/client mismatch.
//
// F-06: QA saw React error #418 repeatedly on the public pages and /book.
// Three sources were found by reading the code, and each needs a browser
// that differs from the server in one specific way to show itself -- which
// is exactly what a default Playwright browser does not do (en-US, motion
// on, real clock), and why the suite never saw any of them:
//
//  - a locale-less toLocaleDateString in the health-profile showcase's
//    charts ("Oct 5" from Node, "5 Oct" in an en-GB/en-IN browser);
//  - motion's useReducedMotion answering on the first client render, so the
//    showcase's pause button existed on the server and not on the client;
//  - the debug bar reading its simulated clock from localStorage in a lazy
//    useState, so "Reset to Real Time" rendered on the client only.
//
// So this browser is all three: en-GB, reduced motion, and a simulated
// clock set before the page loads.
import { test, expect, type Page } from "@playwright/test";
import { BASE, waitForSplashToClear } from "./helpers";

test.use({ locale: "en-GB", contextOptions: { reducedMotion: "reduce" } });

const PUBLIC_PAGES = [
  "/",
  "/conditions",
  "/how-it-works",
  "/home-visit",
  "/team",
  "/mission",
  "/faq",
  "/hospitals",
];

const HYDRATION = /hydrat|Minified React error #(418|423|425)/i;

function collectHydrationErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" && HYDRATION.test(msg.text())) errors.push(msg.text());
  });
  page.on("pageerror", (e) => {
    if (HYDRATION.test(e.message)) errors.push(e.message);
  });
  return errors;
}

async function settle(page: Page, path: string) {
  await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
  await waitForSplashToClear(page);
  await page.waitForLoadState("networkidle");
}

test("HY-001: every public page hydrates cleanly for an en-GB, reduced-motion visitor on the debug clock", async ({
  page,
}) => {
  test.setTimeout(180_000);
  // A simulated "now" a day ahead, as a tester sets it from the debug bar
  // (src/lib/debugNow.ts keeps it as an offset in localStorage).
  await page.addInitScript(() => {
    window.localStorage.setItem("debugNowOffsetMs", String(24 * 3_600_000));
  });
  const errors = collectHydrationErrors(page);
  for (const path of PUBLIC_PAGES) {
    await settle(page, path);
    expect(errors, `${path}: ${errors[0]}`).toEqual([]);
  }
});

test("HY-002: /book hydrates cleanly for the same visitor", async ({ page }) => {
  test.setTimeout(90_000);
  // No simulated clock here: the wizard reads debugNow() deliberately, once,
  // and in production it renders on the client only (its useSearchParams
  // sits under the page's Suspense boundary), so the layout around it is
  // what this checks.
  const errors = collectHydrationErrors(page);
  await settle(page, "/book");
  expect(errors, errors[0]).toEqual([]);
});
