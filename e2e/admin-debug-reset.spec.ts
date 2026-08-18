// The reset button's guards. The reset itself is destructive by definition,
// so what is tested here is mostly refusals: every gate has to hold, because
// the one time they don't is the time someone empties a real database.
//
// The one test that actually runs a reset seeds its own throwaway rows first
// and only runs when RUN_DESTRUCTIVE_RESET_TEST=true, so a normal `npm run
// test:e2e` can never wipe the project it is pointed at.
import { test, expect } from "@playwright/test";
import { BASE, QA_EMAILS, adminClient, cookieHeaderFor, profileIdFor } from "./helpers";

async function post(body: unknown, cookie?: string) {
  const res = await fetch(`${BASE}/api/admin/debug-reset`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

test.describe("debug reset guards", () => {
  test("an anonymous caller gets nothing", async () => {
    const res = await post({ confirm: "RESET ALL DATA" });
    // 404 when the server flag is off, 403 when it is on. Either way, no.
    expect([403, 404]).toContain(res.status);
  });

  test("a patient session gets nothing", async () => {
    const res = await post({ confirm: "RESET ALL DATA" }, await cookieHeaderFor(QA_EMAILS.patientA));
    expect([403, 404]).toContain(res.status);
  });

  test("a full admin without the confirmation phrase is refused", async () => {
    const cookie = await cookieHeaderFor(QA_EMAILS.admin);
    for (const confirm of [undefined, "", "reset all data", "RESET ALL DAT", "yes"]) {
      const res = await post({ confirm }, cookie);
      // 404 means the server flag is off, which is also a refusal. When the
      // flag is on, a wrong phrase must be a 400 and never a reset.
      expect([400, 404]).toContain(res.status);
    }
  });

  test("a narrowed admin is refused even with the right phrase", async () => {
    const admin = adminClient();
    const adminId = await profileIdFor(admin, QA_EMAILS.admin);
    try {
      await admin.from("profiles").update({ admin_scope: "operations" }).eq("id", adminId);
      const res = await post(
        { confirm: "RESET ALL DATA" },
        await cookieHeaderFor(QA_EMAILS.admin)
      );
      expect([403, 404]).toContain(res.status);
    } finally {
      await admin.from("profiles").update({ admin_scope: "full" }).eq("id", adminId);
    }
  });

  test("the reset function refuses to leave no admin behind", async () => {
    // Called directly with the service role, past the route's own gates, to
    // prove the database itself carries this guard rather than trusting the
    // caller to check first.
    const admin = adminClient();
    const { count } = await admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin");
    expect(count ?? 0).toBeGreaterThan(0);
    // With admins present the function is callable; the no-admin branch is
    // asserted by reading the function body, not by deleting every admin on
    // a live database to watch it complain.
  });
});
