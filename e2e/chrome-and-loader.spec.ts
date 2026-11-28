// CHROME: the navigation stays put while a page loads, and every dashboard
// wears the same light sidebar.
//
// Four complaints, each something only a browser shows:
//  - tapping Sign In removed Sign In / Get Started / Book from the nav
//    (Get Started stays in the header: it is how a therapist or a hospital
//    finds their own sign-in);
//  - tapping a dashboard tab flashed a dark sidebar (the old loading
//    skeleton) until the page arrived;
//  - the admin dashboard still had the dark blue sidebar;
//  - /conditions listed the areas of practice above the programmes.
import { test, expect } from "@playwright/test";
import { BASE, QA_EMAILS, browserCookiesFor, markDashboardTourSeen, waitForSplashToClear } from "./helpers";

const SHOT = "/tmp/claude-0/-home-user-Claude/92352852-44c7-581f-b775-ee8d1b4f4c9d/scratchpad/shots";

test("CHROME-001: the sign-in page keeps Sign In, Get Started and Book in the nav, and Get Started leads to the therapist and hospital doors", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto(`${BASE}/conditions`);
  await waitForSplashToClear(page);
  const nav = page.getByRole("navigation").filter({ has: page.getByRole("link", { name: "Sign In" }) }).first();
  await nav.getByRole("link", { name: "Sign In" }).click();
  await expect(page).toHaveURL(/\/patient\/login/);
  for (const name of ["Sign In", "Get Started", /Book a video session/]) {
    await expect(nav.getByRole("link", { name })).toBeVisible();
  }
  // Without it a therapist or a hospital has no way to their own sign-in from
  // the top bar: Sign In above is the patient's.
  await nav.getByRole("link", { name: "Get Started" }).click();
  await expect(page).toHaveURL(/\/get-started$/);
  await expect(page.getByRole("link", { name: /Therapist Login/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Partner Login/ })).toBeVisible();
  await page.goBack();
  // The therapist and partner doors moved to the footer, under their own heading.
  const footer = page.getByRole("contentinfo");
  await expect(footer.getByRole("heading", { name: "For clinicians and partners" })).toBeVisible();
  await expect(footer.getByRole("link", { name: /Therapist sign in/ })).toBeVisible();
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
  // only appears after 150ms by design. Installed before the dashboard
  // opens, and a prefetch of the tab is refused outright: the tabs are
  // prefetched links, so on a production build the tap would otherwise land
  // on a page already in hand (instant -- the point of prefetching) and
  // there would be no wait to show. This case is about the tap that has
  // nothing cached, which still happens: just after a refresh, before the
  // prefetch lands, or a tab whose entry was never on screen.
  await page.route("**/patient/dashboard/health-profile**", async (route) => {
    if (route.request().headers()["next-router-prefetch"]) return route.abort();
    await new Promise((r) => setTimeout(r, 2500));
    await route.continue();
  });
  await page.goto(`${BASE}/patient/dashboard`);
  const rail = page.getByRole("navigation", { name: /navigation$/ }).first();
  await expect(rail).toBeVisible();
  // The dashboard re-reads itself once after its first paint; the observer
  // below has to live in the document that stays.
  await page.waitForTimeout(3000);

  // The loader is watched from inside the page and reports back. (This
  // was a full page load once, when Playwright's locators looked for the
  // *next* document; a tab is a client-side Link now, but the watcher works
  // for either.)
  const seen = new Promise<string>((resolve) => {
    page.on("console", (m) => {
      if (m.text().startsWith("LOADER ")) resolve(m.text());
    });
  });
  await page.evaluate(() => {
    const t0 = performance.now();
    const tick = () => {
      if (document.querySelector("[data-testid=navigation-loader]")) {
        const nav = document.querySelector('nav[aria-label$=" navigation"]:not([data-tabbar])');
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
  // Health Profile, by address: it is on every patient's sidebar, where
  // Sessions only appears once the patient has some -- on the gate's fresh
  // stack this patient has none, and the case waited on a link that was
  // never drawn. The rail also shortens labels, so not by name.
  await rail.locator('a[href="/patient/dashboard/health-profile"]').first().click({ noWaitAfter: true });
  const report = await seen;
  // Waits its 150ms before appearing -- a fast tab never flashes it.
  expect(Number(/after=(\d+)/.exec(report)![1])).toBeGreaterThanOrEqual(130);
  // The sidebar never left, and nothing dark stands in for it.
  expect(report).toContain("rail=true");
  expect(report).toContain("bg=rgb(255, 255, 255)");
  // The loader is the word roll: the five steps, in order.
  expect(report).toContain("words=Move,Stretch,Strengthen,Recover,Restore");
  await page.screenshot({ path: `${SHOT}/chrome-loader.png` }).catch(() => {});

  await expect(page).toHaveURL(/\/patient\/dashboard\/health-profile/, { timeout: 30_000 });
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

test("CHROME-004: /how-it-works runs the four steps, the goals, the health profile, then the course", async ({ page }) => {
  await page.goto(`${BASE}/how-it-works`);
  const steps = page.locator("#the-steps");
  const goals = page.locator("#goals");
  const after = page.locator("#after-the-first");
  await expect(goals).toBeVisible();
  const order = [steps, goals];
  // The health profile band renders only for the kinds of care the clinic
  // offers; when it does, "Recovery is a course" comes after it.
  const profile = page.locator("#health-profile");
  if ((await profile.count()) > 0) order.push(profile);
  order.push(after);
  const ys = await Promise.all(order.map(async (l) => (await l.boundingBox())!.y));
  for (let i = 1; i < ys.length; i++) expect(ys[i - 1]).toBeLessThan(ys[i]);
  // /conditions no longer carries it.
  await page.goto(`${BASE}/conditions`);
  await expect(page.locator("#goals")).toHaveCount(0);
});

test("CHROME-005: every dashboard sends its loading frame before its data, and the page replaces it", async ({
  request,
  browser,
}) => {
  test.setTimeout(180_000);
  // The frame (DashboardLoading) is the dashboard's loading.tsx: streamed in
  // the first part of the response, before any of the page's reads finish,
  // so a slow load shows the dashboard's outline and the word roll instead
  // of a frozen screen. Read from the raw response: the frame comes first,
  // the real page after it.
  const cases = [
    { email: QA_EMAILS.patientA, path: "/patient/dashboard" },
    { email: QA_EMAILS.therapistA, path: "/therapist/dashboard" },
    { email: QA_EMAILS.hospital, path: "/hospital/dashboard" },
    { email: QA_EMAILS.admin, path: "/admin/dashboard" },
  ];
  for (const { email, path } of cases) {
    const cookie = (await browserCookiesFor(email)).map((c) => `${c.name}=${c.value}`).join("; ");
    const res = await request.get(`${BASE}${path}`, { headers: { cookie }, maxRedirects: 0 });
    expect(res.status(), path).toBe(200);
    const html = await res.text();
    const frame = html.indexOf('data-testid="dashboard-loading"');
    expect(frame, `${path} streams its loading frame`).toBeGreaterThan(-1);
    // The word roll is in it, saying what is loading.
    expect(html.slice(frame), path).toMatch(/Loading (your|the) dashboard/);
  }

  // In a browser the frame is gone once the page has arrived, and the real
  // navigation is there.
  await markDashboardTourSeen(QA_EMAILS.patientA);
  const context = await browser.newContext();
  await context.addCookies(await browserCookiesFor(QA_EMAILS.patientA));
  const page = await context.newPage();
  await page.goto(`${BASE}/patient/dashboard`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("dashboard-loading")).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: /navigation$/ }).first()).toBeVisible();
  await context.close();
});

test("CHROME-006: an in-app link that loads slowly shows the loader, not a page that looks frozen", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  // Hold back the in-app fetch of the next page, so the wait is long enough
  // to see. A next/link navigation fetches the page's data rather than the
  // document, and the loader used to be released the instant the link took
  // the click over -- which is every next/link.
  await page.route(/\/faq(\?|$).*_rsc/, async (route) => {
    await new Promise((r) => setTimeout(r, 2500));
    await route.continue();
  });
  await page.goto(`${BASE}/conditions`);
  await waitForSplashToClear(page);
  const faq = page.getByRole("contentinfo").getByRole("link", { name: "FAQ" });
  await faq.scrollIntoViewIfNeeded();
  await faq.click();
  await expect(page.getByTestId("navigation-loader")).toBeVisible({ timeout: 2_000 });
  await expect(page).toHaveURL(/\/faq/, { timeout: 30_000 });
  await expect(page.getByTestId("navigation-loader")).toHaveCount(0, { timeout: 30_000 });
});

test("CHROME-011: a way into an account on every width -- tablet bar, phone bottom bar, phone menu", async ({ browser }) => {
  // Below 1024px the header's Sign In / Book cluster was hidden and the only
  // way in was the menu. Tablets now carry Sign In and Get Started in the
  // bar; a phone, with no room beside the full name, carries Get Started
  // in the sticky bottom bar next to Book.
  const tablet = await browser.newContext({ viewport: { width: 820, height: 900 } });
  const t = await tablet.newPage();
  await t.goto(`${BASE}/faq`);
  await waitForSplashToClear(t);
  const bar = t.getByRole("navigation").first();
  await expect(bar.getByRole("link", { name: "Sign In" }).filter({ visible: true })).toBeVisible();
  await expect(bar.getByRole("link", { name: /Get Started/ }).filter({ visible: true })).toHaveAttribute("href", "/get-started");
  await tablet.close();

  const phone = await browser.newContext({ viewport: { width: 360, height: 780 } });
  const p = await phone.newPage();
  await p.goto(`${BASE}/faq`);
  await waitForSplashToClear(p);
  const bottom = p.locator("[data-tabbar]");
  await expect(bottom.getByRole("link", { name: "Get Started" })).toBeVisible();
  await expect(bottom.getByRole("link", { name: /Book a video session/ })).toBeVisible();
  // Nothing in the bottom bar is cut off at 360px.
  const overflow = await bottom.evaluate((el) =>
    [...el.querySelectorAll("a")].some((a) => a.scrollWidth > a.clientWidth + 1)
  );
  expect(overflow, "a bottom-bar button is truncated").toBe(false);
  await p.getByRole("button", { name: "Toggle menu" }).click();
  await expect(p.getByRole("navigation").getByRole("link", { name: "Get Started" }).filter({ visible: true })).toBeVisible();
  await expect(p.getByRole("navigation").getByRole("link", { name: "Sign In" }).filter({ visible: true })).toBeVisible();
  await phone.close();
});

test("CHROME-008: register and the holding pages show the home page's bar to a signed-out visitor", async ({ page }) => {
  // A bare /patient/register (the invite page without its invite) used to say
  // "Invalid Link" under a bar with no Sign In; it is the patient sign-up now.
  await page.goto(`${BASE}/patient/register`);
  await page.waitForURL(/\/patient\/login\?tab=register/);
  await expect(page.getByRole("button", { name: "Register Account" })).toBeVisible();
  await expect(page.getByText("Invalid Link")).toHaveCount(0);

  for (const path of ["/pending-approval", "/account-suspended"]) {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`${BASE}${path}`);
    await waitForSplashToClear(page);
    await expect(page.getByRole("navigation").getByRole("link", { name: "Sign In" }).filter({ visible: true })).toBeVisible();
  }
  // Nobody is signed in, so the suspended page offers no Sign Out.
  await page.waitForTimeout(1_000);
  await expect(page.getByRole("button", { name: /Sign Out/ })).toHaveCount(0);
});

test("CHROME-009: a signed-in visitor on the suspended page still gets Sign Out", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addCookies(await browserCookiesFor(QA_EMAILS.patientB));
  const page = await ctx.newPage();
  await page.goto(`${BASE}/account-suspended`);
  await expect(page.getByRole("button", { name: /Sign Out/ })).toBeVisible({ timeout: 15_000 });
  await ctx.close();
});

test("CHROME-010: an empty phone field starts on the visitor's country, not the browser language's", async ({ browser }) => {
  // A phone set to "English (US)" in a time zone the table does not know
  // used to open every phone field on United States. The site resolves the
  // visitor's country from where they are (the one prices use); in this
  // environment that is India. The browser below is en-US in UTC on purpose.
  const ctx = await browser.newContext({ locale: "en-US", timezoneId: "UTC", viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const country = page.getByRole("combobox", { name: "Country code" }).first();
  await page.goto(`${BASE}/hospitals`);
  await waitForSplashToClear(page);
  await country.scrollIntoViewIfNeeded();
  await expect(country).toHaveValue("IN", { timeout: 15_000 });
  // A country chosen by hand stays chosen.
  await country.selectOption("AE");
  await page.waitForTimeout(1_000);
  await expect(country).toHaveValue("AE");

  const res = await page.goto(`${BASE}/developer/lets-talk`);
  if (res?.status() === 200) {
    await expect(page.getByRole("combobox", { name: "Country code" }).first()).toHaveValue("IN", { timeout: 15_000 });
  }
  await ctx.close();
});

test("CHROME-007: Sign In, Get Started and Book fit the header on one row from 1024px, with no sideways scroll", async ({ page }) => {
  // Three buttons beside the brand's full name is tight at the smallest laptop
  // width: Our team and Home visit step into More below xl to make room.
  for (const width of [1024, 1100, 1280, 1536]) {
    await page.setViewportSize({ width, height: 800 });
    await page.addInitScript(() =>
      localStorage.setItem("mr_cookie_consent", JSON.stringify({ version: "2026-11-12", analytics: false, marketing: false, at: Date.now() }))
    );
    await page.goto(`${BASE}/`);
    await waitForSplashToClear(page);
    const nav = page.getByRole("navigation").filter({ has: page.getByRole("link", { name: "Sign In" }) }).first();
    const boxes = [];
    for (const name of ["Sign In", "Get Started", /Book a video session/] as const) {
      const link = nav.getByRole("link", { name });
      await expect(link, `${width}px`).toBeVisible();
      boxes.push((await link.boundingBox())!);
    }
    // One row, left to right, and the last one inside the window.
    expect(Math.abs(boxes[0].y - boxes[1].y), `${width}px: Sign In and Get Started share a row`).toBeLessThan(6);
    expect(Math.abs(boxes[1].y - boxes[2].y), `${width}px: Get Started and Book share a row`).toBeLessThan(6);
    expect(boxes[0].x + boxes[0].width, `${width}px`).toBeLessThanOrEqual(boxes[1].x + 1);
    expect(boxes[1].x + boxes[1].width, `${width}px`).toBeLessThanOrEqual(boxes[2].x + 1);
    expect(boxes[2].x + boxes[2].width, `${width}px: Book is inside the window`).toBeLessThanOrEqual(width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), `${width}px: sideways scroll`).toBe(false);
  }
  // Home visit is not lost below xl: it is under More.
  await page.setViewportSize({ width: 1024, height: 800 });
  await page.goto(`${BASE}/`);
  await waitForSplashToClear(page);
  await page.getByRole("button", { name: /^More/ }).click();
  await expect(page.getByRole("link", { name: "Home visit" }).first()).toBeVisible();
});

test("CHROME-012: with no internet the page says so in plain words -- a banner, and no browser 'Load failed' text", async ({ page, context }) => {
  await page.addInitScript(() =>
    localStorage.setItem("mr_cookie_consent", JSON.stringify({ version: "2026-11-12", analytics: false, marketing: false, at: Date.now() }))
  );
  await page.goto(`${BASE}/admin/login`);
  await waitForSplashToClear(page);
  await expect(page.getByTestId("offline-banner")).toHaveCount(0);

  await context.setOffline(true);
  const banner = page.getByTestId("offline-banner");
  await expect(banner).toContainText("You're offline", { timeout: 10_000 });
  await expect(banner).toContainText(/Connect to the internet/);

  // A sign-in attempt while offline: the form's own message is ours, never
  // Safari's "Load failed" / Chrome's "Failed to fetch".
  await page.getByLabel("Email Address").fill("someone@example.com");
  await page.getByLabel("Password", { exact: true }).fill("not-a-real-password");
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page.getByText(/No internet connection/)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/Load failed|Failed to fetch/)).toHaveCount(0);

  await context.setOffline(false);
  await expect(banner).toContainText("You're back online", { timeout: 10_000 });
  await expect(banner).toHaveCount(0, { timeout: 10_000 });
});
