// The admin login page itself, driven through the real form.
//
// Every other browser spec injects a session cookie, because signing in
// needs the *browser* to reach Supabase and a sandboxed browser may have no
// outbound network. This spec runs against a second app instance whose
// NEXT_PUBLIC_SUPABASE_URL points at a localhost passthrough
// (scripts/.qa/supabase-relay.mjs), so the form talks to the real Supabase
// over Node's route. Nothing is mocked; it is skipped when that instance
// isn't running -- except in the quality gate, where the browser reaches the
// local stack directly, the same dev server serves the form, and an
// unreachable form fails the run instead.
import { test, expect, type Request } from "@playwright/test";
import { QA_EMAILS, TEST_PASSWORD } from "./helpers";

const LOGIN_BASE = process.env.E2E_LOGIN_BASE_URL ?? "http://localhost:3100";

test.describe("Admin login", () => {
  test.beforeAll(async () => {
    const reachable = await fetch(`${LOGIN_BASE}/admin/login`)
      .then((r) => r.ok)
      .catch(() => false);
    // In the quality gate the same dev server serves the form
    // (run-runner.mjs sets E2E_LOGIN_BASE_URL), so an unreachable form is a
    // broken run, not an environment without the relay.
    if (!reachable && process.env.E2E_GATE === "1") {
      throw new Error(`the admin login form did not answer at ${LOGIN_BASE} inside the quality gate`);
    }
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
    await page.getByLabel("Password", { exact: true }).fill(TEST_PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();

    await page.waitForURL(/\/admin\/dashboard/, { timeout: 60_000 });
    await expect(page.getByRole("heading", { level: 1, name: /Today/ })).toBeVisible({
      timeout: 60_000,
    });
  });

  test("a wrong password is reported and does not sign anyone in", async ({ page }) => {
    await page.goto(`${LOGIN_BASE}/admin/login`);
    await page.getByLabel("Email Address").fill(QA_EMAILS.admin);
    await page.getByLabel("Password", { exact: true }).fill("definitely-not-the-password");
    await page.getByRole("button", { name: /sign in/i }).click();

    // The message comes back and the button returns -- a failed sign-in must
    // never leave the form looking like it silently did nothing.
    await expect(page.locator("div.text-red-700")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: /sign in/i })).toBeEnabled();
    expect(page.url()).toContain("/admin/login");
    // ...and no session was handed out for it.
    const sessionCookies = (await page.context().cookies()).filter((c) => /^sb-.*-auth-token/.test(c.name));
    expect(sessionCookies).toEqual([]);
  });

  test("a patient's credentials cannot open the admin dashboard", async ({ page }) => {
    await page.goto(`${LOGIN_BASE}/admin/login`);
    await page.getByLabel("Email Address").fill(QA_EMAILS.patientA);
    await page.getByLabel("Password", { exact: true }).fill(TEST_PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();

    // Supabase accepts the credentials -- they are a real user -- so the
    // guard that matters is the proxy's role check, which sends them
    // straight back out. Out to /get-started, not back to /admin/login:
    // "A signed-in non-admin reaching /admin/dashboard is redirected to
    // /get-started, never to /admin/login, which would confirm the back
    // office exists and name its door" (docs/rules/ops-security.md). This
    // case asserted the old bounce and, since it skips itself wherever the
    // login relay is not running, never ran against the rule that replaced
    // it until the quality gate's local stack.
    await page.waitForURL((url) => !url.pathname.startsWith("/admin"), { timeout: 30_000 });
    expect(new URL(page.url()).pathname).toBe("/get-started");
    await expect(page.getByRole("heading", { name: "Admin Login" })).toHaveCount(0);
  });

  test("a therapist's or a hospital's credentials are sent to /get-started, never back to the admin door", async ({
    page,
  }) => {
    // The same rule as the patient case above, for the other two roles, and
    // asserted on the redirect itself: the proxy's answer to a signed-in
    // non-admin names /get-started, and no hop of the walk passes through
    // /admin/login -- which would confirm the back office and name its door.
    for (const email of [QA_EMAILS.therapistA, QA_EMAILS.hospital]) {
      await page.context().clearCookies();
      await page.goto(`${LOGIN_BASE}/admin/login`);
      await page.getByLabel("Email Address").fill(email);
      await page.getByLabel("Password", { exact: true }).fill(TEST_PASSWORD);

      const hops: string[] = [];
      const onRequest = (request: Request) => {
        if (request.isNavigationRequest() && request.frame() === page.mainFrame()) {
          hops.push(new URL(request.url()).pathname);
        }
      };
      page.on("request", onRequest);
      const bounce = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === "/admin/dashboard" && response.request().isNavigationRequest(),
        { timeout: 60_000 }
      );
      await page.getByRole("button", { name: /sign in/i }).click();
      const response = await bounce;
      expect(response.status(), email).toBeGreaterThanOrEqual(300);
      expect(response.status(), email).toBeLessThan(400);
      expect(new URL(response.headers()["location"] ?? "", LOGIN_BASE).pathname, email).toBe("/get-started");
      await page.waitForURL((url) => url.pathname === "/get-started", { timeout: 30_000 });
      page.off("request", onRequest);
      expect(hops, email).not.toContain("/admin/login");
      await expect(page.getByRole("heading", { name: "Admin Login" })).toHaveCount(0);
    }
  });

  test("the form is reachable by label, for a screen reader as much as a test", async ({
    page,
  }) => {
    await page.goto(`${LOGIN_BASE}/admin/login`);
    const email = page.getByLabel("Email Address");
    const password = page.getByLabel("Password", { exact: true });
    await expect(email).toHaveAttribute("type", "email");
    await expect(password).toHaveAttribute("type", "password");
    // Keyboard alone must get from the email field to the submit button.
    await email.focus();
    await page.keyboard.press("Tab");
    await expect(password).toBeFocused();
    // The eye toggle sits between the password and Sign In, and works from
    // the keyboard: Space shows the password, Space again hides it.
    await page.keyboard.press("Tab");
    const eye = page.getByRole("button", { name: "Show password" });
    await expect(eye).toBeFocused();
    await expect(eye).toHaveAttribute("aria-pressed", "false");
    await page.keyboard.press("Space");
    await expect(password).toHaveAttribute("type", "text");
    await expect(page.getByRole("button", { name: "Hide password" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await page.getByRole("button", { name: "Hide password" }).click();
    await expect(password).toHaveAttribute("type", "password");
    await page.getByRole("button", { name: "Show password" }).focus();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: /sign in/i })).toBeFocused();
  });
});
