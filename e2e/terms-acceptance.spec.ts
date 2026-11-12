// Phase 2 of the legal work: agreeing to the Terms, and the consents a booking
// records (src/lib/policyAcceptance.ts -> policy_acceptances).
//
//  TA-001 an account that never agreed (made by staff, or before the tick
//         box) is stopped at "Before you continue" and let in once it agrees
//  TA-002 a signup that ticked the box is recorded by the database trigger
//         and goes straight in
//  TA-003 a booking for a child needs the parent or guardian box; with it,
//         the guardian and telehealth consents are recorded against the
//         booking
//  TA-004 the signup form will not create an account without the tick box
//
// Every account made here is deleted afterwards, and its agreements go with
// it (the append-only guard lets a row go with its profile).
import { test, expect } from "@playwright/test";
import {
  BASE,
  QA_EMAILS,
  TEST_PASSWORD,
  TERMS_METADATA,
  adminClient,
  browserCookiesFor,
  cookieHeaderFor,
  profileIdFor,
  wholeHourFromNow,
} from "./helpers";
import { currentTermsVersion } from "../src/lib/policyAcceptance";

const admin = adminClient();
const created: string[] = [];

async function makePatient(label: string, metadata: Record<string, string> = {}) {
  const email = `e2e.terms.${label}.${Date.now()}.${Math.random().toString(36).slice(2, 6)}@example.test`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
    user_metadata: { role: "patient", full_name: `E2E Terms ${label}`, ...metadata },
  });
  if (error || !data.user) throw new Error(`could not create ${label}: ${error?.message}`);
  created.push(data.user.id);
  await admin.from("profiles").update({ approved: true, active: true, onboarding_seen_at: new Date().toISOString() }).eq("id", data.user.id);
  return { id: data.user.id, email };
}

async function acceptances(userId: string) {
  const { data, error } = await admin
    .from("policy_acceptances")
    .select("document, version, context, appointment_id")
    .eq("user_id", userId)
    .order("accepted_at", { ascending: true });
  expect(error).toBeNull();
  return data ?? [];
}

test.afterAll(async () => {
  for (const id of created) await admin.auth.admin.deleteUser(id).catch(() => undefined);
});

test("TA-001 an account that never agreed is stopped at the dashboard until it agrees", async ({ browser }) => {
  test.setTimeout(120_000);
  const { id, email } = await makePatient("never");
  expect(await acceptances(id)).toEqual([]);

  const ctx = await browser.newContext();
  await ctx.addCookies(await browserCookiesFor(email));
  const page = await ctx.newPage();
  await page.goto(`${BASE}/patient/dashboard`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Before you continue" })).toBeVisible({ timeout: 30_000 });
  const agree = page.getByRole("button", { name: "Agree and continue" });
  await expect(agree).toBeDisabled();
  await page.getByRole("checkbox", { name: /I have read and agree/ }).check();
  await agree.click();
  await expect(page.getByRole("heading", { name: "Before you continue" })).toHaveCount(0, { timeout: 30_000 });
  await ctx.close();

  expect(await acceptances(id)).toEqual([
    { document: "terms_privacy", version: currentTermsVersion(), context: "reaccept", appointment_id: null },
  ]);
});

test("TA-002 a signup that ticked the box is recorded by the database and goes straight in", async ({ browser }) => {
  const { id, email } = await makePatient("ticked", TERMS_METADATA);
  expect(await acceptances(id)).toEqual([
    { document: "terms_privacy", version: currentTermsVersion(), context: "signup", appointment_id: null },
  ]);
  const ctx = await browser.newContext();
  await ctx.addCookies(await browserCookiesFor(email));
  const page = await ctx.newPage();
  await page.goto(`${BASE}/patient/dashboard`, { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/patient\/dashboard/);
  await page.waitForTimeout(1500);
  await expect(page.getByRole("heading", { name: "Before you continue" })).toHaveCount(0);
  await ctx.close();
});

test("TA-003 a booking for a child needs the guardian box, and records both consents", async () => {
  test.setTimeout(90_000);
  const patientId = await profileIdFor(admin, QA_EMAILS.patientA);
  const cookie = await cookieHeaderFor(QA_EMAILS.patientA);
  const { data: category } = await admin.from("treatment_categories").select("id").eq("active", true).limit(1).single();
  const child = { who: "family", name: "E2E Child", age: 9, relationship: "my son", someoneWithThem: "yes" };
  const book = (bookingFor: Record<string, unknown>) =>
    fetch(`${BASE}/api/appointments/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        categoryId: category!.id,
        timezone: "Asia/Kolkata",
        slotTime: wholeHourFromNow(110),
        bookingFor,
        telehealthConsent: true,
      }),
    });

  const refused = await book(child);
  expect(refused.status).toBe(400);
  expect((await refused.json()).error).toMatch(/parent or legal guardian/);

  let appointmentId: string | undefined;
  try {
    const ok = await book({ ...child, guardianConfirmed: true });
    expect(ok.status).toBe(200);
    appointmentId = (await ok.json()).appointmentId;
    const { data } = await admin
      .from("policy_acceptances")
      .select("document, context, version")
      .eq("user_id", patientId)
      .eq("appointment_id", appointmentId!)
      .order("document");
    expect(data).toEqual([
      { document: "guardian_consent", context: "booking", version: currentTermsVersion() },
      { document: "telehealth_consent", context: "booking", version: currentTermsVersion() },
    ]);
  } finally {
    if (appointmentId) await admin.from("appointments").delete().eq("id", appointmentId);
  }
});

test("TA-004 the patient signup form will not create an account without the tick box", async ({ browser }) => {
  const email = `e2e.terms.form.${Date.now()}@example.test`;
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/patient/login`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Register Account" }).click();
  const form = page.locator("form");
  await form.locator('input[name="fullName"]').fill("E2E Terms Form");
  await form.locator('input[name="email"]').fill(email);
  await form.getByLabel("Country code").selectOption("IN");
  await form.locator('input[type="tel"]').fill("9999000014");
  await form.locator('input[name="password"]').fill(TEST_PASSWORD);
  await form.locator('input[name="confirmPassword"]').fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Create Account" }).click();
  await expect(page.getByText("Please agree to the Terms of use and Privacy policy to create your account.")).toBeVisible();
  const { data } = await admin.from("profiles").select("id").eq("email", email).maybeSingle();
  expect(data).toBeNull();
  await ctx.close();
});
