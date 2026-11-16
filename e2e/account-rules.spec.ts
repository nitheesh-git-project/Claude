// Two rule sets the owner asked to have checked against the app (bug list
// item 23), where no automated test held them yet:
//  - a booking-wizard account locked on signup opens itself after the
//    configured number of unsuccessful payment tries;
//  - only a Master Admin changes access levels or creates accounts, and
//    nobody changes their own.
import { test, expect } from "@playwright/test";
import { BASE, QA_EMAILS, adminClient, cookieHeaderFor, createFixtureAccount, profileIdFor, setQaAdminScope } from "./helpers";

async function post(path: string, body: object, email: string) {
  return fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: await cookieHeaderFor(email) },
    body: JSON.stringify(body),
  });
}

test.describe("account rules", () => {
  test.setTimeout(120_000);

  test("AR-001: a locked booking account opens after the configured payment tries, not before", async () => {
    const db = adminClient();
    const who = await createFixtureAccount("locked booking");
    try {
      await db.from("profiles").update({ approved: false }).eq("id", who.id);
      const { data: settings } = await db.from("site_settings").select("payment_tries_before_access").limit(1).single();
      const limit = Math.max(1, Number(settings?.payment_tries_before_access ?? 3));

      expect((await post("/api/patient/payment-try", { flow: "online", outcome: "nonsense" }, who.email)).status).toBe(400);
      for (let i = 1; i < limit; i++) {
        const res = await post("/api/patient/payment-try", { flow: "online", outcome: "dismissed" }, who.email);
        expect(res.status, await res.clone().text()).toBe(200);
        expect((await res.json()).unlocked, `try ${i} of ${limit}`).toBe(false);
      }
      const { data: still } = await db.from("profiles").select("approved").eq("id", who.id).single();
      expect(still?.approved).toBe(false);

      const last = await post("/api/patient/payment-try", { flow: "online", outcome: "failed" }, who.email);
      expect((await last.json()).unlocked).toBe(true);
      const { data: opened } = await db.from("profiles").select("approved").eq("id", who.id).single();
      expect(opened?.approved).toBe(true);
    } finally {
      await db.from("checkout_payment_tries").delete().eq("patient_id", who.id);
      await db.auth.admin.deleteUser(who.id).catch(() => {});
    }
  });

  test("AR-002: only a Master Admin changes access or creates accounts, and nobody changes their own", async () => {
    const db = adminClient();
    const adminId = await profileIdFor(db, QA_EMAILS.admin);
    const own = await post("/api/admin/set-admin-scope", { userId: adminId, scope: "finance" }, QA_EMAILS.admin);
    expect(own.status).toBe(409);
    expect((await own.json()).error).toContain("can't change your own access");

    await setQaAdminScope(db, adminId, "operations");
    try {
      expect((await post("/api/admin/set-admin-scope", { userId: adminId, scope: "full" }, QA_EMAILS.admin)).status).toBe(403);
      expect(
        (await post("/api/admin/create-account", { role: "admin", email: "nobody@example.test", fullName: "Nobody" }, QA_EMAILS.admin))
          .status
      ).toBe(403);
    } finally {
      await setQaAdminScope(db, adminId, "full");
    }
    const { data: me } = await db.from("profiles").select("admin_scope").eq("id", adminId).single();
    expect(me?.admin_scope).toBe("full");
  });
});
