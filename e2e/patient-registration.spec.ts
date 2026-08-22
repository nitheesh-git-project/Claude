// Patient (and therapist) self-registration: no email confirmation step.
//
// Access here is gated by the admin's approval, never by an inbox round
// trip, and the two together were two queues a patient had to clear before
// they could do anything. This spec pins both halves of that: the signup
// itself must hand back a usable session immediately, and the account must
// still sit unapproved until an admin says otherwise.
//
// The first case doubles as a configuration check. Email confirmation is a
// Supabase *project* setting, not something this codebase can enforce at
// runtime, so a project with "Confirm email" switched back on would put the
// step back without a single line of code changing. Here that fails a test
// instead of reaching a patient.
import { test, expect, request, type APIRequestContext } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import {
  BASE,
  QA_EMAILS,
  SUPABASE_ANON_KEY,
  SUPABASE_URL,
  TEST_PASSWORD,
  adminClient,
  browserCookiesFor,
  cookieHeaderFor,
} from "./helpers";

const db = adminClient();
const createdUserIds: string[] = [];

function anonClient() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// Unique per run: these accounts are real auth users, and a rerun must not
// collide with one a previous run left behind.
function freshEmail(prefix: string) {
  return `qa.signup.${prefix}.${Date.now()}.${Math.floor(Math.random() * 1e4)}@example.test`;
}

async function signUp(role: "patient" | "therapist", email: string) {
  const anon = anonClient();
  const { data, error } = await anon.auth.signUp({
    email,
    password: TEST_PASSWORD,
    options: {
      data: {
        role,
        full_name: role === "patient" ? "QA Signup Patient" : "QA Signup Therapist",
        phone: "+919999000012",
        ...(role === "therapist" ? { credentials: "QA" } : {}),
      },
    },
  });
  if (data.user) createdUserIds.push(data.user.id);
  return { data, error };
}

test.describe("Self-registration without email confirmation", () => {
  test.afterAll(async () => {
    for (const id of createdUserIds) {
      await db.auth.admin.deleteUser(id).catch(() => {});
    }
  });

  test("PR-001 a patient signup returns a usable session, with no confirmation step", async () => {
    const { data, error } = await signUp("patient", freshEmail("patient"));
    expect(error).toBeNull();
    // The whole point: a session in hand the moment the form is submitted.
    // No session here means the project has "Confirm email" switched on.
    expect(data.session).not.toBeNull();
    expect(data.user?.email_confirmed_at).toBeTruthy();
  });

  test("PR-002 the new account lands unapproved, waiting on the admin", async () => {
    const { data } = await signUp("patient", freshEmail("pending"));
    const { data: profile } = await db
      .from("profiles")
      .select("role, approved, active")
      .eq("id", data.user!.id)
      .maybeSingle();
    expect(profile).toMatchObject({ role: "patient", approved: false, active: true });
  });

  test("PR-003 an unapproved patient is held at /pending-approval, not at an email step", async ({
    browser,
  }) => {
    const email = freshEmail("held");
    await signUp("patient", email);

    const ctx = await browser.newContext();
    await ctx.addCookies(await browserCookiesFor(email));
    const page = await ctx.newPage();
    await page.goto(`${BASE}/patient/dashboard`, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/pending-approval/);
    // Nothing on that screen may send them to their inbox.
    await expect(page.getByText(/confirm your email|check your email/i)).toHaveCount(0);
    await ctx.close();
  });

  test("PR-004 the admin's approval is the only thing standing between signup and the dashboard", async ({
    browser,
  }) => {
    const email = freshEmail("approve");
    const { data } = await signUp("patient", email);

    let adminCtx: APIRequestContext | null = null;
    try {
      adminCtx = await request.newContext({
        baseURL: BASE,
        extraHTTPHeaders: { Cookie: await cookieHeaderFor(QA_EMAILS.admin) },
      });
      const res = await adminCtx.post("/api/admin/approve-account", {
        data: { userId: data.user!.id },
      });
      expect(res.ok()).toBe(true);
    } finally {
      await adminCtx?.dispose();
    }

    // Same credentials, no extra verification: straight into the dashboard.
    const ctx = await browser.newContext();
    await ctx.addCookies(await browserCookiesFor(email));
    const page = await ctx.newPage();
    await page.goto(`${BASE}/patient/dashboard`, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/patient\/dashboard/);
    await ctx.close();
  });

  test("PR-005 the register form never promises a confirmation email", async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(`${BASE}/patient/login`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Register Account" }).click();
    await expect(page.locator('input[name="fullName"]')).toBeVisible();
    // What the form tells a new patient to expect: an admin review, and
    // nothing about their inbox.
    await expect(page.getByText(/reviewed by our team/i)).toBeVisible();
    await expect(page.getByText(/confirm your email|check your email/i)).toHaveCount(0);
    await ctx.close();
  });

  // The one case that submits the real form. Registering needs the *browser*
  // to reach Supabase, which a sandboxed browser may not be able to do (the
  // symptom is a bare "Failed to fetch"), so it runs against the relay
  // instance admin-login.spec.ts documents and skips when that is not up.
  test("PR-006 submitting the real form lands on the waiting screen, not an inbox prompt", async ({
    browser,
  }) => {
    const registerBase = process.env.E2E_LOGIN_BASE_URL ?? "http://localhost:3100";
    const reachable = await fetch(`${registerBase}/patient/login`)
      .then((r) => r.ok)
      .catch(() => false);
    test.skip(
      !reachable,
      `no app at ${registerBase} -- start one with NEXT_PUBLIC_SUPABASE_URL pointed at the relay`
    );
    test.setTimeout(120_000);

    const email = freshEmail("form");
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(`${registerBase}/patient/login`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Register Account" }).click();

    // Selected by name rather than label: these inputs carry plain <label>
    // text with no htmlFor, so getByLabel does not resolve them.
    const form = page.locator("form");
    await form.locator('input[name="fullName"]').fill("QA Form Patient");
    await form.locator('input[name="email"]').fill(email);
    // The phone field posts a hidden composed value built from the country
    // selector plus the visible national part. The country is pinned here
    // rather than left to the headless browser's locale -- an Indian number
    // under a US country code is correctly refused.
    await form.getByLabel("Country code").selectOption("IN");
    await form.locator('input[type="tel"]').fill("9999000013");
    await form.locator('input[name="password"]').fill(TEST_PASSWORD);
    await form.locator('input[name="confirmPassword"]').fill(TEST_PASSWORD);
    await page.getByRole("button", { name: "Create Account" }).click();

    await page.waitForURL(/\/pending-approval/, { timeout: 60_000 });
    await expect(page.getByText(/confirm your email|check your email/i)).toHaveCount(0);
    await ctx.close();

    const { data } = await db
      .from("profiles")
      .select("id, approved")
      .eq("email", email)
      .maybeSingle();
    if (data?.id) createdUserIds.push(data.id);
    expect(data?.approved).toBe(false);
  });

  test("PR-007 a therapist application gets the same treatment", async () => {
    const { data, error } = await signUp("therapist", freshEmail("therapist"));
    expect(error).toBeNull();
    expect(data.session).not.toBeNull();
    const { data: profile } = await db
      .from("profiles")
      .select("role, approved")
      .eq("id", data.user!.id)
      .maybeSingle();
    expect(profile).toMatchObject({ role: "therapist", approved: false });
  });
});
