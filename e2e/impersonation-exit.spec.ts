// IMP-EXIT: "Exit and go back to admin" puts the admin back in their own
// account, on the dashboard -- not on the login page.
//
// It used to sign them out every time. The exit route restored the admin's
// parked session with setSession({ access_token: "", refresh_token }), and
// setSession refuses a session with no access token before it looks at the
// refresh token -- so the restore always failed, and the route fell through
// to its "could not restore, sign in again" branch. Driven end to end
// because the failure produced no error anyone saw: a 200, a redirect, and
// an admin looking at a login form.
import { test, expect } from "@playwright/test";
import { BASE, QA_EMAILS, adminClient, browserCookiesFor, profileIdFor } from "./helpers";

test("IMP-EXIT-001: exiting an impersonation returns the admin to the dashboard, still signed in", async ({
  page,
  context,
}) => {
  test.setTimeout(120_000);
  const patientId = await profileIdFor(adminClient(), QA_EMAILS.patientA);
  await context.addCookies(await browserCookiesFor(QA_EMAILS.admin));

  // page.request shares the browser's cookie jar, so the session swap the
  // start route performs lands in this context exactly as it would for a tap.
  const start = await page.request.post(`${BASE}/api/admin/start-impersonation`, {
    data: { userId: patientId, reason: "e2e: checking the exit puts me back" },
  });
  expect(start.status(), await start.text()).toBe(200);

  const stop = await page.request.post(`${BASE}/api/admin/stop-impersonation`);
  expect(stop.status()).toBe(200);
  const body = await stop.json();
  expect(body.note, "the admin's own session was restored").toBeUndefined();
  expect(body.redirectTo).toBe("/admin/dashboard");

  await page.goto(`${BASE}${body.redirectTo}`);
  // Still the admin: the back office renders, rather than the proxy sending
  // a signed-out (or still-impersonating patient) browser elsewhere.
  await page.waitForLoadState("domcontentloaded");
  await expect(page).toHaveURL(/\/admin\/dashboard/);
  await expect(page.locator("h1").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Exit and go back to admin" })).toHaveCount(0);
});
