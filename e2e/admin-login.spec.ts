// The admin login page itself, driven through the real form.
//
// Every other browser spec injects a session cookie, because signing in
// needs the *browser* to reach Supabase and a sandboxed browser may have no
// outbound network. This spec runs against a second app instance whose
// NEXT_PUBLIC_SUPABASE_URL points at a localhost passthrough
// (scripts/.qa/supabase-relay.mjs), so the form talks to the real Supabase
// over Node's route. Nothing is mocked; it is skipped when that instance
// isn't running.
import { test, expect } from "@playwright/test";
import { QA_EMAILS, TEST_PASSWORD } from "./helpers";

const LOGIN_BASE = process.env.E2E_LOGIN_BASE_URL ?? "http://localhost:3100";

test.describe("Admin login", () => {
  test.beforeAll(async () => {
    const reachable = await fetch(`${LOGIN_BASE}/admin/login`)
      .then((r) => r.ok)
      .catch(() => false);
    test.skip(
      !reachable,
      `no app at ${LOGIN_BASE} -- start one with NEXT_PUBLIC_SUPABASE_URL pointed at the relay`
    );
  });

  test.beforeEach(async () => {
    test.setTimeout(120_000);
  });

  test("valid admin credentials reach the dashboard", async ({ page }) => {
    await page.goto(`${LOGIN_BASE}/admin/login`);
    await page.getByLabel("Email Address").fill(QA_EMAILS.admin);
    await page.getByLabel("Password").fill(TEST_PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();

    await page.waitForURL(/\/admin\/dashboard/, { timeout: 60_000 });
    await expect(page.getByRole("heading", { level: 1, name: /Today/ })).toBeVisible({
      timeout: 60_000,
    });
  });

  test("a wrong password is reported and does not sign anyone in", async ({ page }) => {
    await page.goto(`${LOGIN_BASE}/admin/login`);
    await page.getByLabel("Email Address").fill(QA_EMAILS.admin);
    await page.getByLabel("Password").fill("definitely-not-the-password");
    await page.getByRole("button", { name: /sign in/i }).click();

    // The message comes back and the button returns -- a failed sign-in must
    // never leave the form looking like it silently did nothing.
    await expect(page.locator("div.text-red-700")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: /sign in/i })).toBeEnabled();
    expect(page.url()).toContain("/admin/login");
  });

  test("a patient's credentials cannot open the admin dashboard", async ({ page }) => {
    await page.goto(`${LOGIN_BASE}/admin/login`);
    await page.getByLabel("Email Address").fill(QA_EMAILS.patientA);
    await page.getByLabel("Password").fill(TEST_PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();

    // Supabase accepts the credentials -- they are a real user -- so the
    // guard that matters is the proxy's role check, which sends them
    // straight back out.
    await page.waitForTimeout(8_000);
    expect(page.url()).toContain("/admin/login");
    await expect(page.getByRole("heading", { name: "Admin Login" })).toBeVisible();
  });

  test("the form is reachable by label, for a screen reader as much as a test", async ({
    page,
  }) => {
    await page.goto(`${LOGIN_BASE}/admin/login`);
    const email = page.getByLabel("Email Address");
    const password = page.getByLabel("Password");
    await expect(email).toHaveAttribute("type", "email");
    await expect(password).toHaveAttribute("type", "password");
    // Keyboard alone must get from the email field to the submit button.
    await email.focus();
    await page.keyboard.press("Tab");
    await expect(password).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: /sign in/i })).toBeFocused();
  });
});
