// A partner's referrals: the one-open-referral-per-patient rule holding
// under concurrency, and the withdraw control saying something when the
// network drops.
//
// REF-001 is the audit finding it exists for: the route checked for an open
// referral and inserted in a separate statement, so simultaneous submissions
// for one phone number all passed the check. The partial unique index
// `patient_referrals_one_open_per_phone` is what holds it now.
//
// Fixtures are marked by patient name and deleted before and after.
import { test, expect } from "@playwright/test";
import { BASE, QA_EMAILS, adminClient, browserCookiesFor, cookieHeaderFor, profileIdFor } from "./helpers";

const db = adminClient();
const MARKER = "E2E Referral Rule";
// A real-shaped Indian mobile the QA data does not otherwise use.
const PHONE = "+91 98111 22334";

async function cleanup() {
  await db.from("patient_referrals").delete().like("patient_name", `${MARKER}%`);
}

test.beforeAll(cleanup);
test.afterAll(cleanup);

test("REF-001: simultaneous referrals for one patient leave exactly one open", async () => {
  const hospitalId = await profileIdFor(db, QA_EMAILS.hospital);
  const cookie = await cookieHeaderFor(QA_EMAILS.hospital);
  const submit = () =>
    fetch(`${BASE}/api/hospital/submit-referral`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        patientName: `${MARKER} race`,
        patientPhone: PHONE,
        medicalIssue: "Lower back pain after a fall",
        visitMode: "online",
      }),
    });

  const responses = await Promise.all(Array.from({ length: 5 }, submit));
  const statuses = responses.map((r) => r.status).sort();
  expect(statuses.filter((s) => s === 200), statuses.join(",")).toHaveLength(1);
  // Every other one is the friendly refusal, never a 500.
  expect(statuses.filter((s) => s === 409), statuses.join(",")).toHaveLength(4);

  const { data } = await db
    .from("patient_referrals")
    .select("id")
    .eq("hospital_id", hospitalId)
    .eq("patient_phone", PHONE)
    .in("status", ["pending_review", "therapist_assigned", "invite_sent"]);
  expect(data ?? []).toHaveLength(1);
});

test("REF-002: a withdrawn referral frees the number for a new one", async () => {
  const hospitalId = await profileIdFor(db, QA_EMAILS.hospital);
  await cleanup();
  const { data: first } = await db
    .from("patient_referrals")
    .insert({
      hospital_id: hospitalId,
      patient_name: `${MARKER} first`,
      patient_phone: PHONE,
      medical_issue: "Knee pain",
      visit_mode: "online",
      status: "withdrawn",
    })
    .select("id")
    .single();
  expect(first?.id).toBeTruthy();

  const cookie = await cookieHeaderFor(QA_EMAILS.hospital);
  const res = await fetch(`${BASE}/api/hospital/submit-referral`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({
      patientName: `${MARKER} second`,
      patientPhone: PHONE,
      medicalIssue: "Knee pain again",
      visitMode: "online",
    }),
  });
  expect(res.status, await res.text()).toBe(200);
});

test("REF-003: a dropped connection while withdrawing is said, not swallowed", async ({ browser }) => {
  const hospitalId = await profileIdFor(db, QA_EMAILS.hospital);
  await cleanup();
  await db.from("patient_referrals").insert({
    hospital_id: hospitalId,
    patient_name: `${MARKER} withdraw`,
    patient_phone: PHONE,
    medical_issue: "Shoulder stiffness",
    visit_mode: "online",
    status: "pending_review",
  });

  const ctx = await browser.newContext();
  await ctx.addCookies(await browserCookiesFor(QA_EMAILS.hospital));
  const page = await ctx.newPage();
  await page.route("**/api/hospital/withdraw-referral", (route) => route.abort("failed"));
  await page.goto(`${BASE}/hospital/dashboard/referrals`);

  const row = page.locator("tr, li").filter({ hasText: `${MARKER} withdraw` }).first();
  await row.getByRole("button", { name: "Withdraw" }).click();
  // The confirm dialog.
  await page.getByRole("button", { name: /^(Withdraw|Confirm|Yes)/ }).last().click();

  await expect(page.getByText(/Couldn't reach the clinic/)).toBeVisible({ timeout: 20_000 });
  await ctx.close();
});
