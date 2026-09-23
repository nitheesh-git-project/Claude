// NAV: a tap is acknowledged, and a screen already rendered is not fetched
// again.
//
// Two separate failures, both of which read as "the button does not work".
// A Today count linking to the rows it counted was an ordinary link to
// /admin/dashboard?section=…&tab=… -- the same route with a different query,
// so Next threw away a rendered dashboard and rebuilt it from ~49 queries to
// show markup already in the DOM. And nothing told the teal bar about a link
// click that was not written through ProgressLink or useRouter, so the wait
// itself was silent.
import { test, expect } from "@playwright/test";
import { BASE, browserCookiesFor, QA_EMAILS } from "./helpers";

test("NAV-001: an admin screen link switches in place, with no server round trip", async ({
  page,
  context,
}) => {
  await context.addCookies(await browserCookiesFor(QA_EMAILS.admin));
  await page.goto(`${BASE}/admin/dashboard?section=today&tab=overview`);
  await page.waitForLoadState("networkidle");

  let documentRequests = 0;
  let rscRequests = 0;
  page.on("request", (r) => {
    if (r.resourceType() === "document") documentRequests += 1;
    if (r.url().includes("_rsc=")) rscRequests += 1;
  });

  const screenLink = page.locator('a[href*="/admin/dashboard?section="]:visible').first();
  const href = await screenLink.getAttribute("href");
  expect(href, "a Today link to another screen").toBeTruthy();
  const wanted = new URL(href!, BASE);

  const startedAt = Date.now();
  await screenLink.click();
  await page.waitForFunction(
    (search) => window.location.search === search,
    wanted.search,
    { timeout: 10000 }
  );

  expect(documentRequests, "no full page load").toBe(0);
  expect(rscRequests, "no fetch for a screen already rendered").toBe(0);
  expect(Date.now() - startedAt, "switching screens is not a page build").toBeLessThan(3000);
});

test("NAV-003: a count's filter preset survives the switch", async ({ page, context }) => {
  // The screens read `?view=` through useSearchParams during render, and a
  // client-side switch changes the URL with history.pushState -- so this is
  // the assertion that the two still meet. Without it a count would link to
  // the rows it counted and open the whole table, which is the failure
  // `?view=` exists to prevent.
  await context.addCookies(await browserCookiesFor(QA_EMAILS.admin));
  await page.goto(`${BASE}/admin/dashboard?section=today&tab=overview`);
  await page.waitForLoadState("networkidle");

  const withPreset = page
    .locator('a[href*="/admin/dashboard?section=sessions&tab=all&view=today"]:visible')
    .first();
  test.skip((await withPreset.count()) === 0, "no session booked for today to link at");

  await withPreset.click();
  await page.waitForFunction(() => window.location.search.includes("view=today"), undefined, {
    timeout: 10000,
  });

  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const dates = await page
    .locator('input[type="date"]:visible')
    .evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
  expect(dates).toContain(today);
});

test("NAV-002: a real navigation draws the bar while it is in flight", async ({
  page,
  context,
}) => {
  await context.addCookies(await browserCookiesFor(QA_EMAILS.patientA));
  await page.goto(`${BASE}/patient/dashboard`);
  await page.waitForLoadState("networkidle");

  // The patient shell moves between sections with plain anchors, so the bar
  // lives on the *outgoing* document and is gone by the time the new one
  // loads. Recorded into sessionStorage, which survives the navigation the
  // observer is watching.
  await page.evaluate(() => {
    sessionStorage.removeItem("barSeen");
    new MutationObserver(() => {
      if (document.querySelector(".route-progress")) sessionStorage.setItem("barSeen", "yes");
    }).observe(document.body, { childList: true, subtree: true });
  });

  await page.locator('a[href^="/patient/dashboard/"]:visible').first().click({ noWaitAfter: true });
  await page.waitForURL("**/patient/dashboard/**", { timeout: 20000 });
  await page.waitForLoadState("domcontentloaded");

  expect(await page.evaluate(() => sessionStorage.getItem("barSeen"))).toBe("yes");
});
