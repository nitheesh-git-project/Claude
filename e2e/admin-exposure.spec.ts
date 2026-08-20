// The back office should be invisible to everyone who is not in it.
//
// Two ways it leaked. The debug bar names the admin login and dashboard in
// its jump-to dropdown and carries the red data-reset button, and
// `.env.production` sets NEXT_PUBLIC_SHOW_DEBUG_NAV=true -- so every patient,
// therapist and hospital partner on the deployed site was shown where the
// back office is. And a signed-in non-admin who reached /admin/dashboard was
// redirected to /admin/login, which confirms there is one and names it.
//
// Neither was an access hole (src/proxy.ts, requireAdmin and the reset
// route's own four gates all held). Both were disclosure.
import { test, expect, type Page } from "@playwright/test";
import { BASE, QA_EMAILS, browserCookiesFor } from "./helpers";

async function signInAs(page: Page, email: string) {
  await page.context().addCookies(await browserCookiesFor(email));
}

const debugBar = (page: Page) => page.locator("select").first();

test.describe("The admin back office is not advertised", () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1280, height: 1000 });
  });

  test("AE-001: a signed-in non-admin is not sent to the admin login page", async ({ page }) => {
    for (const email of [QA_EMAILS.patientA, QA_EMAILS.therapistA, QA_EMAILS.hospital]) {
      await signInAs(page, email);
      await page.goto(`${BASE}/admin/dashboard`);
      await page.waitForURL(/\/get-started$/, { timeout: 30_000 });
      expect(page.url(), `${email} should not be shown /admin/login`).not.toContain("/admin");
    }
  });

  test("AE-002: the debug bar names no admin route to a non-admin", async ({ page }) => {
    await signInAs(page, QA_EMAILS.patientA);
    await page.goto(`${BASE}/`);
    // The bar only renders where NEXT_PUBLIC_SHOW_DEBUG_NAV allows it; where
    // it is off there is nothing to assert and nothing leaking.
    if ((await debugBar(page).count()) === 0) {
      test.skip(true, "debug bar not enabled in this environment");
    }
    const options = await debugBar(page).locator("option").allTextContents();
    expect(options.join(" ")).not.toMatch(/admin/i);
    const values = await debugBar(page).locator("option").evaluateAll((els) =>
      els.map((e) => e.getAttribute("value"))
    );
    expect(values.join(" ")).not.toContain("/admin");
    await expect(page.getByRole("button", { name: /Reset data/i })).toHaveCount(0);
  });

  test("AE-003: an admin still gets both", async ({ page }) => {
    await signInAs(page, QA_EMAILS.admin);
    await page.goto(`${BASE}/`);
    if ((await debugBar(page).count()) === 0) {
      test.skip(true, "debug bar not enabled in this environment");
    }
    // The role lookup is a round trip after mount, so the admin entries
    // appear a beat later than the rest of the bar.
    await expect(async () => {
      const options = await debugBar(page).locator("option").allTextContents();
      expect(options.join(" ")).toMatch(/Admin Dashboard/i);
    }).toPass({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: /Reset data/i })).toBeVisible();
  });
});
