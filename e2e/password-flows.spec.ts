// Passwords, for every role: change it from the profile (the current one is
// required and checked by the server), or set a new one through the reset
// link (no current password -- the email proves who it is). And the reset
// page shows its form only to somebody who arrived through a link: a
// signed-in person who typed /reset-password could otherwise set a new
// password without the current one.
//
// Fixtures: a throwaway patient per test, deleted afterwards. The profile
// section is the same component on all four dashboards.
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import {
  BASE,
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  TEST_PASSWORD,
  adminClient,
  browserCookiesFor,
  cookieHeaderFor,
  createFixtureAccount,
} from "./helpers";

async function canSignIn(email: string, password: string) {
  const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error } = await anon.auth.signInWithPassword({ email, password });
  return !error;
}

test.describe("passwords", () => {
  test.setTimeout(150_000);

  test("PW-001: Change password asks for the current one, and only the right one changes it", async ({ browser }) => {
    const who = await createFixtureAccount("password change");
    const ctx = await browser.newContext();
    try {
      await ctx.addCookies(await browserCookiesFor(who.email));
      const page = await ctx.newPage();
      await page.goto(`${BASE}/patient/dashboard/profile`);
      const section = page.getByTestId("account-security");
      await expect(section).toBeVisible({ timeout: 60_000 });

      await section.getByLabel("Current password").fill("not-my-password");
      await section.getByLabel("New password", { exact: true }).fill("brand-new-pass");
      await section.getByLabel("Confirm new password").fill("brand-new-pass");
      await section.getByRole("button", { name: "Change password" }).click();
      await expect(section.getByRole("alert")).toContainText("That is not your current password.");
      expect(await canSignIn(who.email, TEST_PASSWORD)).toBe(true);

      await section.getByLabel("Current password").fill(TEST_PASSWORD);
      await section.getByRole("button", { name: "Change password" }).click();
      await expect(section.getByRole("status")).toContainText("Your password is changed", { timeout: 30_000 });
      expect(await canSignIn(who.email, "brand-new-pass")).toBe(true);
      expect(await canSignIn(who.email, TEST_PASSWORD)).toBe(false);
      // The way in for somebody who has forgotten it sits beside it.
      await expect(section.getByRole("button", { name: "Email me a reset link" })).toBeVisible();
    } finally {
      await ctx.close();
      await adminClient().auth.admin.deleteUser(who.id).catch(() => {});
    }
  });

  test("PW-002: the route refuses without a session, without the current password, and a too-short new one", async () => {
    const who = await createFixtureAccount("password change api");
    try {
      const post = (body: object, cookie?: string) =>
        fetch(`${BASE}/api/change-password`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
          body: JSON.stringify(body),
        });
      expect((await post({ currentPassword: TEST_PASSWORD, newPassword: "abcdefgh" })).status).toBe(401);
      const cookie = await cookieHeaderFor(who.email);
      expect((await post({ newPassword: "abcdefgh" }, cookie)).status).toBe(400);
      expect((await post({ currentPassword: TEST_PASSWORD, newPassword: "abc" }, cookie)).status).toBe(400);
      expect(await canSignIn(who.email, TEST_PASSWORD)).toBe(true);
    } finally {
      await adminClient().auth.admin.deleteUser(who.id).catch(() => {});
    }
  });

  test("PW-003: /reset-password typed in shows no password form, signed in or not", async ({ browser }) => {
    const who = await createFixtureAccount("reset typed");
    try {
      const anon = await browser.newContext();
      const a = await anon.newPage();
      await a.goto(`${BASE}/reset-password`);
      await expect(a.getByTestId("reset-not-from-link")).toBeVisible({ timeout: 30_000 });
      await expect(a.locator('input[type="password"]')).toHaveCount(0);
      await anon.close();

      const signed = await browser.newContext();
      await signed.addCookies(await browserCookiesFor(who.email));
      const b = await signed.newPage();
      await b.goto(`${BASE}/reset-password`);
      await expect(b.getByTestId("reset-not-from-link")).toContainText("Change password");
      await expect(b.locator('input[type="password"]')).toHaveCount(0);
      await signed.close();
    } finally {
      await adminClient().auth.admin.deleteUser(who.id).catch(() => {});
    }
  });

  test("PW-004: through a reset link the form appears, needs no current password, and survives a refresh", async ({
    browser,
  }) => {
    const who = await createFixtureAccount("reset link");
    const ctx = await browser.newContext();
    try {
      const { data, error } = await adminClient().auth.admin.generateLink({ type: "recovery", email: who.email });
      expect(error).toBeNull();
      const tokenHash = data.properties!.hashed_token;
      const page = await ctx.newPage();
      await page.goto(`${BASE}/reset-password?token_hash=${encodeURIComponent(tokenHash)}&type=recovery`);
      await expect(page.getByLabel("New Password", { exact: true })).toBeVisible({ timeout: 30_000 });
      // The token leaves the address bar; a refresh keeps the form.
      await expect.poll(() => page.evaluate(() => window.location.search)).toBe("");
      await page.reload();
      await expect(page.getByLabel("New Password", { exact: true })).toBeVisible({ timeout: 30_000 });
      await expect(page.getByLabel(/Current password/i)).toHaveCount(0);

      await page.getByLabel("New Password", { exact: true }).fill("from-the-link");
      await page.getByLabel(/Confirm/i).fill("from-the-link");
      await page.getByRole("button", { name: "Set New Password" }).click();
      await expect(page.getByText("Your password has been updated")).toBeVisible({ timeout: 30_000 });
      expect(await canSignIn(who.email, "from-the-link")).toBe(true);
    } finally {
      await ctx.close();
      await adminClient().auth.admin.deleteUser(who.id).catch(() => {});
    }
  });
});
