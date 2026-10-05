import { test, expect } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  BASE,
  QA_EMAILS,
  SUPABASE_ANON_KEY,
  SUPABASE_URL,
  TEST_PASSWORD,
  adminClient,
  browserCookiesFor,
  cookieHeaderFor,
  profileIdFor,
} from "./helpers";

/**
 * One partner hospital never sees, or acts on, another's referrals.
 *
 * Hospital A refers a patient through the real route; hospital B (the
 * second partner seed:qa creates) must not find that referral through its
 * own RLS-scoped client, must not be able to withdraw it through the route,
 * and must not see it on its Referrals screen -- while hospital A sees all
 * three. The positive half is what makes the negative half mean anything: a
 * hospital that saw nothing at all would pass every refusal.
 */

const HOSPITAL_B = "qa.hospital.b@example.test";
const MARKER = "E2E Partner Isolation";
const PHONE = "+91 98111 44556";

const db = adminClient();
let referralId = "";

async function rlsClientFor(email: string): Promise<SupabaseClient> {
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password: TEST_PASSWORD });
  if (error) throw new Error(`sign-in for ${email} failed: ${error.message}`);
  return client;
}

async function cleanup() {
  await db.from("patient_referrals").delete().like("patient_name", `${MARKER}%`);
}

test.describe.configure({ mode: "serial" });
test.beforeAll(cleanup);
test.afterAll(cleanup);

test("HI-001: hospital A's referral lands, owned by hospital A", async () => {
  const hospitalA = await profileIdFor(db, QA_EMAILS.hospital);
  // Hospital B must exist as a second, independent partner, or every
  // refusal below would be against nobody.
  const hospitalB = await profileIdFor(db, HOSPITAL_B);
  expect(hospitalB).not.toBe(hospitalA);

  const res = await fetch(`${BASE}/api/hospital/submit-referral`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: await cookieHeaderFor(QA_EMAILS.hospital) },
    body: JSON.stringify({
      patientName: `${MARKER} patient`,
      patientPhone: PHONE,
      medicalIssue: "Shoulder stiffness after surgery",
      visitMode: "online",
    }),
  });
  expect(res.status, await res.clone().text()).toBe(200);
  const { data } = await db
    .from("patient_referrals")
    .select("id, hospital_id, status")
    .eq("patient_phone", PHONE)
    .like("patient_name", `${MARKER}%`)
    .single();
  expect(data?.hospital_id).toBe(hospitalA);
  referralId = data!.id;
});

test("HI-002: hospital B's own client cannot read it; hospital A's can", async () => {
  expect(referralId, "HI-001 created the referral").toBeTruthy();
  const b = await rlsClientFor(HOSPITAL_B);
  const { data: seenByB, error: errB } = await b.from("patient_referrals").select("id, patient_name, patient_phone").eq("id", referralId);
  expect(errB).toBeNull();
  expect(seenByB ?? []).toHaveLength(0);
  const { data: phoneSearch } = await b.from("patient_referrals").select("id").eq("patient_phone", PHONE);
  expect(phoneSearch ?? [], "enumerating by phone finds nothing either").toHaveLength(0);

  const a = await rlsClientFor(QA_EMAILS.hospital);
  const { data: seenByA } = await a.from("patient_referrals").select("id").eq("id", referralId);
  expect(seenByA ?? []).toHaveLength(1);
});

test("HI-003: hospital B cannot withdraw it, and the refusal changes nothing", async () => {
  expect(referralId, "HI-001 created the referral").toBeTruthy();
  const res = await fetch(`${BASE}/api/hospital/withdraw-referral`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: await cookieHeaderFor(HOSPITAL_B) },
    body: JSON.stringify({ referralId }),
  });
  // "Not found" rather than "forbidden": the route does not confirm to
  // another partner that the id exists.
  expect(res.status).toBe(404);
  const { data } = await db.from("patient_referrals").select("status, withdrawn_at").eq("id", referralId).single();
  expect(data?.status).toBe("pending_review");
  expect(data?.withdrawn_at).toBeNull();
});

test("HI-004: only hospital A's Referrals screen lists it", async ({ browser }) => {
  expect(referralId, "HI-001 created the referral").toBeTruthy();
  for (const [email, visible] of [
    [QA_EMAILS.hospital, true],
    [HOSPITAL_B, false],
  ] as const) {
    const ctx = await browser.newContext();
    await ctx.addCookies(await browserCookiesFor(email));
    const page = await ctx.newPage();
    await page.goto(`${BASE}/hospital/dashboard/referrals`);
    // Wait for the screen itself, so an absence is an absence and not a page
    // that had not rendered yet.
    await expect(page.getByRole("heading").first()).toBeVisible({ timeout: 60_000 });
    await page.waitForLoadState("networkidle");
    const row = page.getByText(`${MARKER} patient`);
    if (visible) await expect(row.first(), `${email} sees its own referral`).toBeVisible({ timeout: 30_000 });
    else await expect(row, `${email} must not see another partner's referral`).toHaveCount(0);
    await ctx.close();
  }
});

test("HI-005: hospital A withdraws its own referral", async () => {
  expect(referralId, "HI-001 created the referral").toBeTruthy();
  const res = await fetch(`${BASE}/api/hospital/withdraw-referral`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: await cookieHeaderFor(QA_EMAILS.hospital) },
    body: JSON.stringify({ referralId }),
  });
  expect(res.status).toBe(200);
  const { data } = await db.from("patient_referrals").select("status, withdrawn_by").eq("id", referralId).single();
  expect(data?.status).toBe("withdrawn");
  expect(data?.withdrawn_by).toBe(await profileIdFor(db, QA_EMAILS.hospital));
});
