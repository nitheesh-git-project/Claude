// The back office should not be advertised to people who are not in it.
//
// None of this is an access hole -- src/proxy.ts, requireAdmin and
// requireAdminScope all hold -- it is disclosure. Two ways it leaked: a
// signed-in non-admin who reached /admin/dashboard was redirected to
// /admin/login, which confirms there is an admin login and names it; and the
// Navbar and booking wizard mapped role to dashboard path in client code, so
// /admin/dashboard shipped in the JavaScript bundle of every public page.
//
// The debug bar is deliberately not covered here: it still lists the admin
// routes, and is switched off before release.
import { test, expect, type Page } from "@playwright/test";
import { BASE, QA_EMAILS, browserCookiesFor } from "./helpers";

async function signInAs(page: Page, email: string) {
  await page.context().addCookies(await browserCookiesFor(email));
}

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

  test("AE-002: no public page's scripts carry the admin dashboard path", async ({ page }) => {
    // The debug bar names the admin routes on purpose and is switched off
    // before release, so it would fail this on its own terms. Where it is
    // on, there is nothing here worth asserting.
    await page.goto(`${BASE}/`);
    if ((await page.locator("select").first().count()) > 0) {
      test.skip(true, "debug bar enabled -- it lists the admin routes by design");
    }

    // Reads the scripts the page actually loads, rather than trusting that
    // no component mentions the path -- the point is what a visitor can find
    // in the bundle, whoever put it there.
    const scripts: string[] = [];
    page.on("response", async (res) => {
      if (!res.url().includes("/_next/static/")) return;
      if (!res.url().endsWith(".js")) return;
      scripts.push(await res.text().catch(() => ""));
    });

    for (const path of ["/", "/book", "/team", "/conditions"]) {
      await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
    }

    expect(scripts.length, "some scripts should have been captured").toBeGreaterThan(0);
    const offenders = scripts.filter((body) => body.includes("/admin/dashboard"));
    expect(offenders, "no public script should contain /admin/dashboard").toHaveLength(0);
  });

  test("AE-003: /dashboard sends each role to its own dashboard", async ({ page }) => {
    const cases = [
      { email: QA_EMAILS.patientA, path: "/patient/dashboard" },
      { email: QA_EMAILS.therapistA, path: "/therapist/dashboard" },
      { email: QA_EMAILS.hospital, path: "/hospital/dashboard" },
      { email: QA_EMAILS.admin, path: "/admin/dashboard" },
    ];
    for (const { email, path } of cases) {
      await signInAs(page, email);
      await page.goto(`${BASE}/dashboard`);
      await page.waitForURL(new RegExp(`${path}$`), { timeout: 30_000 });
    }
  });

  test("AE-004: /dashboard carries a section through, and refuses a smuggled hash", async ({
    page,
  }) => {
    await signInAs(page, QA_EMAILS.admin);
    await page.goto(`${BASE}/dashboard?section=sessions`);
    await page.waitForURL(/\/admin\/dashboard\?section=sessions$/, { timeout: 30_000 });

    // `hash` is the one param re-attached as a fragment, so it is the one
    // that could smuggle a host if it were passed through unchecked.
    await page.goto(`${BASE}/dashboard?hash=${encodeURIComponent("//evil.example/x")}`);
    await page.waitForURL(/localhost|127\.0\.0\.1|\/admin\/dashboard/, { timeout: 30_000 });
    expect(page.url()).not.toContain("evil.example");
  });

  test("AE-005: a signed-out visitor asking for a dashboard is sent to /get-started", async ({
    page,
  }) => {
    await page.goto(`${BASE}/dashboard`);
    await page.waitForURL(/\/get-started$/, { timeout: 30_000 });
  });

  test("AE-006: the admin login page is not indexable", async ({ page }) => {
    const res = await page.goto(`${BASE}/admin/login`);
    expect(res?.status()).toBe(200);
    const robots = await page
      .locator('meta[name="robots"]')
      .first()
      .getAttribute("content");
    expect(robots ?? "").toMatch(/noindex/);
  });
});
