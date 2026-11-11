// DTA: the debug bar's Test accounts panel.
//
// It makes throwaway logins and removes them with everything they did, so the
// spec proves both halves of its safety: nobody but a Master Admin reaches
// it, and removal never touches an account the panel did not make.
//
// The route follows the debug bar: it answers 404 where
// NEXT_PUBLIC_SHOW_DEBUG_NAV is "false", which is also a refusal. The case
// that needs it on asserts the switched-off answer instead when it is off,
// the way admin-debug-reset.spec.ts treats ALLOW_DEBUG_DATA_RESET.
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { BASE, QA_EMAILS, adminClient, browserCookiesFor, cookieHeaderFor } from "./helpers";

const ROUTE = `${BASE}/api/admin/debug-test-accounts`;

async function post(cookie: string | null, body: unknown) {
  return fetch(ROUTE, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
}

test.describe("Debug test accounts", () => {
  test("DTA-001: only a signed-in Master Admin reaches it", async () => {
    const anon = await fetch(ROUTE);
    expect([401, 404]).toContain(anon.status);
    expect(await anon.text()).not.toContain("/admin/dashboard");

    for (const email of [QA_EMAILS.patientA, QA_EMAILS.therapistA, QA_EMAILS.hospital]) {
      const res = await post(await cookieHeaderFor(email), { action: "create" });
      expect([403, 404], `${email} must be refused`).toContain(res.status);
    }
  });

  test("DTA-002: a real account is never removed, whatever is sent", async () => {
    const admin = adminClient();
    const { data: real } = await admin.from("profiles").select("id").eq("email", QA_EMAILS.patientA).single();
    const res = await post(await cookieHeaderFor(QA_EMAILS.admin), { action: "delete", userId: real!.id });
    expect([404, 409]).toContain(res.status);
    const { data: still } = await admin.from("profiles").select("id").eq("id", real!.id).maybeSingle();
    expect(still?.id).toBe(real!.id);
  });

  test("DTA-003: a set is made, signs in, and is removed with its payment", async ({ browser }) => {
    test.setTimeout(240_000);
    const cookie = await cookieHeaderFor(QA_EMAILS.admin);
    const list = await fetch(ROUTE, { headers: { cookie } });
    if (list.status === 404) {
      // Switched off on this server: the panel says so rather than looking empty.
      const context = await browser.newContext();
      await context.addCookies(await browserCookiesFor(QA_EMAILS.admin));
      const page = await context.newPage();
      await page.goto(`${BASE}/faq`);
      await page.getByTestId("debug-test-accounts-button").click();
      await expect(page.getByTestId("debug-test-accounts-off")).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId("debug-test-card")).toBeVisible();
      await context.close();
      return;
    }
    expect(list.status).toBe(200);

    const created = await post(cookie, { action: "create" });
    expect(created.status, await created.clone().text()).toBe(200);
    const { accounts } = (await created.json()) as {
      accounts: { user_id: string; label: string; email: string; password: string; role: string }[];
    };
    expect(accounts.map((a) => a.label)).toEqual([
      "Patient",
      "Therapist",
      "Hospital partner",
      "Operations admin",
      "Finance admin",
      "Clinical admin",
    ]);
    const admin = adminClient();
    try {
      // Each login works with the password the panel shows.
      const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
        auth: { persistSession: false },
      });
      const patient = accounts[0];
      const { error: signInError } = await anon.auth.signInWithPassword({ email: patient.email, password: patient.password });
      expect(signInError, signInError?.message).toBeNull();

      const { data: profiles } = await admin
        .from("profiles")
        .select("id, role, approved, admin_scope")
        .in("id", accounts.map((a) => a.user_id));
      expect(profiles?.length).toBe(6);
      expect(profiles!.every((p) => p.approved)).toBe(true);
      expect(profiles!.some((p) => p.admin_scope === "full")).toBe(false);
      const therapistId = accounts[1].user_id;
      const { count: hours } = await admin
        .from("therapist_availability_template")
        .select("id", { count: "exact", head: true })
        .eq("therapist_id", therapistId);
      expect(hours).toBe(6 * 18);

      // A payment, which an ordinary delete is refused for.
      const { error: payError } = await admin.from("payments").insert({
        patient_id: patient.user_id,
        purpose: "appointment",
        razorpay_order_id: `order_dta_${Date.now()}`,
        amount_paise: 99900,
        status: "created",
      });
      expect(payError, payError?.message).toBeNull();

      const removed = await post(cookie, { action: "delete", userId: patient.user_id });
      expect(removed.status, await removed.clone().text()).toBe(200);
      const { count: payments } = await admin
        .from("payments")
        .select("id", { count: "exact", head: true })
        .eq("patient_id", patient.user_id);
      expect(payments).toBe(0);
      const { data: gone } = await admin.from("profiles").select("id").eq("id", patient.user_id).maybeSingle();
      expect(gone).toBeNull();
      const { data: authUser } = await admin.auth.admin.getUserById(patient.user_id);
      expect(authUser?.user ?? null).toBeNull();
    } finally {
      const all = await post(cookie, { action: "delete_all" });
      expect(all.status).toBe(200);
      const { count } = await admin
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .in("id", accounts.map((a) => a.user_id));
      expect(count).toBe(0);
    }
  });
});
