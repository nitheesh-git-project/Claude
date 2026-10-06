// CHROME: the navigation stays put while a page loads, and every dashboard
// wears the same light sidebar.
//
// Four complaints, each something only a browser shows:
//  - tapping Sign In removed Sign In / Get Started / Book from the nav;
//  - tapping a dashboard tab flashed a dark sidebar (the old loading
//    skeleton) until the page arrived;
//  - the admin dashboard still had the dark blue sidebar;
//  - /conditions listed the areas of practice above the programmes.
import { test, expect } from "@playwright/test";
import { BASE, QA_EMAILS, browserCookiesFor, markDashboardTourSeen, waitForSplashToClear } from "./helpers";

const SHOT = "/tmp/claude-0/-home-user-Claude/92352852-44c7-581f-b775-ee8d1b4f4c9d/scratchpad/shots";

test("CHROME-001: the sign-in page keeps Sign In, Get Started and Book in the nav", async ({ page }) => {
  // Wide enough that Get Started shows at all (it is 2xl-only by design).
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto(`${BASE}/conditions`);
  await waitForSplashToClear(page);
  const nav = page.getByRole("navigation").filter({ has: page.getByRole("link", { name: "Sign In" }) }).first();
  await nav.getByRole("link", { name: "Sign In" }).click();
  await expect(page).toHaveURL(/\/patient\/login/);
  for (const name of ["Sign In", "Get Started", /Book a video session/]) {
    await expect(nav.getByRole("link", { name })).toBeVisible();
  }
  await page.screenshot({ path: `${SHOT}/chrome-login-nav.png` });
});

test("CHROME-002: a slow dashboard tab shows the word-roll loader with the sidebar still in place", async ({
  page,
  context,
}) => {
  test.setTimeout(120_000);
  await markDashboardTourSeen(QA_EMAILS.patientA);
  await context.addCookies(await browserCookiesFor(QA_EMAILS.patientA));
  // Hold the next page back so the wait is long enough to see -- the loader
  // only appears after 300ms by design. Installed before the dashboard
  // opens, so Next's prefetch of the tab is held back too: otherwise the tap
  // lands on a page already in hand and there is no wait to show.
  await page.route("**/patient/dashboard/sessions**", async (route) => {
    await new Promise((r) => setTimeout(r, 2500));
    await route.continue();
  });
  await page.goto(`${BASE}/patient/dashboard`);
  const rail = page.getByRole("navigation", { name: "Patient Panel navigation" }).first();
  await expect(rail).toBeVisible();
  // The dashboard re-reads itself once after its first paint; the observer
  // below has to live in the document that stays.
  await page.waitForTimeout(3000);

  // The tab is a full page load, and while one is pending Playwright's
  // locators look for the *next* document -- so the old page, the one the
  // loader is drawn on, is watched from inside instead and reports back.
  const seen = new Promise<string>((resolve) => {
    page.on("console", (m) => {
      if (m.text().startsWith("LOADER ")) resolve(m.text());
    });
  });
  await page.evaluate(() => {
    const t0 = performance.now();
    const tick = () => {
      if (document.querySelector("[data-testid=navigation-loader]")) {
        const nav = document.querySelector('nav[aria-label="Patient Panel navigation"]:not([data-tabbar])');
        const visible = nav ? nav.getBoundingClientRect().width > 0 : false;
        const words = [...document.querySelectorAll("[data-testid=navigation-loader] .word-roll__row")]
          .slice(0, 5)
          .map((w) => w.textContent)
          .join(",");
        console.log(`LOADER after=${Math.round(performance.now() - t0)} rail=${visible} bg=${nav ? getComputedStyle(nav).backgroundColor : "none"} words=${words}`);
        return;
      }
      setTimeout(tick, 50);
    };
    tick();
  });
  await rail.getByRole("link", { name: /Sessions/ }).first().click({ noWaitAfter: true });
  const report = await seen;
  // Waits its 300ms before appearing -- a fast tab never flashes it.
  expect(Number(/after=(\d+)/.exec(report)![1])).toBeGreaterThanOrEqual(280);
  // The sidebar never left, and nothing dark stands in for it.
  expect(report).toContain("rail=true");
  expect(report).toContain("bg=rgb(255, 255, 255)");
  // The loader is the word roll: the five steps, in order.
  expect(report).toContain("words=Move,Stretch,Strengthen,Recover,Restore");
  await page.screenshot({ path: `${SHOT}/chrome-loader.png` }).catch(() => {});

  await expect(page).toHaveURL(/\/patient\/dashboard\/sessions/, { timeout: 30_000 });
  await expect(page.getByTestId("navigation-loader")).toHaveCount(0);
});

test("CHROME-003: the admin sidebar is the same light sidebar as the other dashboards", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  for (const width of [1280, 1600]) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 } });
    await ctx.addCookies(await browserCookiesFor(QA_EMAILS.admin));
    const page = await ctx.newPage();
    await page.goto(`${BASE}/admin/dashboard`);
    const nav = page.getByRole("navigation", { name: "Admin sections" }).filter({ visible: true }).first();
    await expect(nav).toBeVisible({ timeout: 30_000 });
    expect(await nav.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(255, 255, 255)");
    await page.screenshot({ path: `${SHOT}/chrome-admin-${width}.png` });
    await ctx.close();
  }
});

test("CHROME-004: /conditions lists the programmes before the areas of practice", async ({ page }) => {
  await page.goto(`${BASE}/conditions`);
  const programs = page.locator("#programs");
  const areas = page.locator("#areas");
  await expect(areas).toBeVisible();
  // Programmes only render when the catalog has some; when it does, they lead.
  if ((await programs.count()) > 0) {
    const [p, a] = await Promise.all([programs.boundingBox(), areas.boundingBox()]);
    expect(p!.y).toBeLessThan(a!.y);
  }
});
