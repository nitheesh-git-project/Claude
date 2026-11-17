// Phone sign-in (src/lib/phoneLogin.ts): built and switched off; for
// patients, therapists and hospitals; never for an admin.
//
// Nothing is texted. The local stack (supabase/config.toml) answers three
// fictional numbers -- 919990000101..103 -- with the fixed code 246810 and
// sends nothing; the gate's egress guard blocks the internet anyway. Linked
// numbers are set and cleared through the admin API, and the switch is
// restored to what it was.
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import {
  BASE,
  QA_EMAILS,
  SUPABASE_ANON_KEY,
  SUPABASE_URL,
  adminClient,
  cookieHeaderFor,
  createFixtureAccount,
  deleteFixtureAccount,
  profileIdFor,
  waitForSplashToClear,
} from "./helpers";

test.describe.configure({ mode: "serial" });

const db = adminClient();
const SEEN = { timeout: 60_000 };
const PATIENT_NUMBER = "919990000101";
const ADMIN_NUMBER = "919990000102";
const CODE = "246810";

let patient: { id: string; email: string } | undefined;
let adminId = "";
let saved: boolean | null = null;

async function post(path: string, data: unknown, cookie?: string) {
  return fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(data),
  });
}

async function setSwitch(enabled: boolean) {
  const res = await post("/api/admin/phone-login/settings", { enabled }, await cookieHeaderFor(QA_EMAILS.admin));
  expect(res.status).toBe(200);
}

/** A session minted straight from Supabase with a phone code -- the way
 *  somebody could, with the public key, without going through our routes. */
async function cookieFromPhoneCode(phone: string): Promise<string> {
  const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  // Asking the local stack to send answers "Unsupported phone provider" (no
  // real provider there), but a test number's fixed code verifies without a
  // send -- PL-002 signs in the same way. What matters here is that a session
  // exists at all.
  await anon.auth.signInWithOtp({ phone: `+${phone}`, options: { shouldCreateUser: false } });
  const { data, error } = await anon.auth.verifyOtp({ phone: `+${phone}`, token: CODE, type: "sms" });
  expect(error, error?.message).toBeNull();
  const collected: { name: string; value: string }[] = [];
  const ssr = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: { getAll: () => [], setAll: (c) => c.forEach(({ name, value }) => collected.push({ name, value })) },
  });
  await ssr.auth.setSession({ access_token: data.session!.access_token, refresh_token: data.session!.refresh_token });
  return collected.map((c) => `${c.name}=${encodeURIComponent(c.value)}`).join("; ");
}

test.beforeAll(async () => {
  const { data } = await db.from("phone_login_controls").select("enabled").eq("id", 1).single();
  saved = data?.enabled ?? false;
  patient = await createFixtureAccount("phone sign-in", { approved: true });
  const linked = await db.auth.admin.updateUserById(patient.id, { phone: PATIENT_NUMBER, phone_confirm: true });
  expect(linked.error, linked.error?.message).toBeNull();
  adminId = await profileIdFor(db, QA_EMAILS.admin);
});

test.afterAll(async () => {
  if (saved !== null) await db.from("phone_login_controls").update({ enabled: saved }).eq("id", 1);
  if (adminId) await db.auth.admin.updateUserById(adminId, { phone: "" });
  await deleteFixtureAccount(patient?.id);
});

test("PL-001: switched off, nothing offers it and the routes refuse", async ({ page }) => {
  await db.from("phone_login_controls").update({ enabled: false }).eq("id", 1);
  const send = await post("/api/auth/phone/send", { phone: `+${PATIENT_NUMBER}` });
  expect(send.status).toBe(409);
  expect((await send.json()).code).toBe("off");
  expect((await post("/api/auth/phone/verify", { phone: `+${PATIENT_NUMBER}`, code: CODE })).status).toBe(409);
  // Only an admin with Settings may switch it.
  for (const email of [QA_EMAILS.patientA, QA_EMAILS.therapistA]) {
    expect((await post("/api/admin/phone-login/settings", { enabled: true }, await cookieHeaderFor(email))).status).toBe(403);
  }
  await page.goto(`${BASE}/patient/login`, { waitUntil: "domcontentloaded" });
  await waitForSplashToClear(page);
  await expect(page.getByRole("button", { name: "Sign in", exact: false }).first()).toBeVisible(SEEN);
  await expect(page.getByRole("button", { name: "Sign in with a phone code instead" })).toHaveCount(0);
});

test("PL-002: switched on, a patient with a linked number signs in with the code it was texted", async ({ page }) => {
  await setSwitch(true);
  // A number with no account gets the same answer and no code.
  const unknown = await post("/api/auth/phone/send", { phone: "+919990000103" });
  expect(unknown.status).toBe(200);
  const known = await post("/api/auth/phone/send", { phone: `+${PATIENT_NUMBER}` });
  expect(await unknown.json()).toEqual(await known.json());
  expect((await post("/api/auth/phone/verify", { phone: `+${PATIENT_NUMBER}`, code: "000000" })).status).toBe(401);

  await page.goto(`${BASE}/patient/login`, { waitUntil: "domcontentloaded" });
  await waitForSplashToClear(page);
  await expect(async () => {
    await page.getByRole("button", { name: "Sign in with a phone code instead" }).click();
    await expect(page.getByTestId("phone-code-sign-in")).toBeVisible({ timeout: 3_000 });
  }).toPass(SEEN);
  await page.getByLabel("Mobile number").fill("+91 99900 00101");
  await page.getByRole("button", { name: "Send code" }).click();
  await page.getByLabel("6-digit code").fill(CODE);
  await page.getByRole("button", { name: "Verify and sign in" }).click();
  await expect(page).toHaveURL(/\/patient\/dashboard/, SEEN);
});

test("PL-003: an admin is never sent a code, and a code-started admin session never opens the back office", async () => {
  await setSwitch(true);
  const linked = await db.auth.admin.updateUserById(adminId, { phone: ADMIN_NUMBER, phone_confirm: true });
  expect(linked.error, linked.error?.message).toBeNull();

  // Through our route: the same neutral answer, and no session can follow.
  const send = await post("/api/auth/phone/send", { phone: `+${ADMIN_NUMBER}` });
  expect(send.status).toBe(200);
  const viaRoute = await post("/api/auth/phone/verify", { phone: `+${ADMIN_NUMBER}`, code: CODE });
  expect(viaRoute.status).toBe(401);

  // Around our routes, straight to Supabase with the public key: the session
  // exists, but every admin route refuses it.
  const cookie = await cookieFromPhoneCode(ADMIN_NUMBER);
  const refused = await post("/api/admin/phone-login/settings", { enabled: true }, cookie);
  expect(refused.status).toBe(403);
  // The same admin with their password is still let in.
  expect((await post("/api/admin/phone-login/settings", { enabled: true }, await cookieHeaderFor(QA_EMAILS.admin))).status).toBe(200);
});
