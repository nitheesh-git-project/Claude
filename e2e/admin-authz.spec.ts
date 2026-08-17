// Suite F -- authorization. The UI is not a security boundary: a valid
// session cookie can call any route directly, so every admin route has to
// refuse a non-admin itself. Hiding a section in the sidebar proves nothing.
//
// F-001 (unauthenticated) is covered here for the routes that matter most;
// the full 82-route sweep is a shell loop, since enumerating the filesystem
// is not something a spec should do.
import { test, expect } from "@playwright/test";
import { readdirSync } from "node:fs";
import path from "node:path";
import { BASE, QA_EMAILS, adminClient, cookieHeaderFor, profileIdFor } from "./helpers";

const ADMIN_ROUTES_DIR = path.resolve(__dirname, "../src/app/api/admin");

function adminRoutePaths(): string[] {
  return readdirSync(ADMIN_ROUTES_DIR, { withFileTypes: true, recursive: true })
    .filter((e) => e.isFile() && e.name === "route.ts")
    .map((e) => {
      const rel = path.relative(ADMIN_ROUTES_DIR, path.join(e.parentPath ?? e.path, e.name));
      return `/api/admin/${path.dirname(rel)}`;
    })
    .sort();
}

// GET-only routes answer POST with 405 before any auth check runs -- that is
// Next's method routing, not a hole. They're asserted separately below.
const GET_ONLY = new Set([
  "/api/admin/package-purchase-detail",
  "/api/admin/home-visit-purchase-detail",
]);

test.describe("Suite F: admin route authorization", () => {
  test("F-001: every admin route refuses an unauthenticated caller", async ({ request }) => {
    test.setTimeout(5 * 60_000);
    const routes = adminRoutePaths();
    expect(routes.length).toBeGreaterThan(70);

    const leaks: string[] = [];
    for (const route of routes) {
      const res = GET_ONLY.has(route)
        ? await request.get(`${BASE}${route}`)
        : await request.post(`${BASE}${route}`, { data: {} });
      if (![401, 403].includes(res.status())) leaks.push(`${res.status()} ${route}`);
    }
    expect(leaks, `routes that did not reject an anonymous caller:\n${leaks.join("\n")}`).toEqual(
      []
    );
  });

  test("F-002/F-003: a patient, therapist and hospital session are all refused", async ({
    request,
  }) => {
    // Three roles x ~80 routes against a dev server. Generous, because the
    // point of this test is coverage, not speed.
    test.setTimeout(10 * 60_000);
    const routes = adminRoutePaths().filter((r) => !GET_ONLY.has(r));
    // One representative session per non-admin role. Every role is checked
    // against every route -- a route that only remembered to exclude
    // patients is exactly the bug this catches.
    for (const email of [QA_EMAILS.patientA, QA_EMAILS.therapistA, QA_EMAILS.hospital]) {
      const cookie = await cookieHeaderFor(email);
      const leaks: string[] = [];
      // Batched rather than one-at-a-time: 240 sequential round trips against
      // a dev server is minutes of waiting for no extra signal.
      const BATCH = 8;
      for (let i = 0; i < routes.length; i += BATCH) {
        const batch = routes.slice(i, i + BATCH);
        const results = await Promise.all(
          batch.map(async (route) => {
            const res = await request.post(`${BASE}${route}`, {
              data: {},
              headers: { Cookie: cookie },
            });
            return { route, status: res.status() };
          })
        );
        for (const r of results) {
          if (![401, 403].includes(r.status)) leaks.push(`${r.status} ${r.route}`);
        }
      }
      expect(leaks, `${email} was not refused by:\n${leaks.join("\n")}`).toEqual([]);
    }
  });

  test("F-004: a limited scope cannot reach another section's routes", async () => {
    const admin = adminClient();
    const adminId = await profileIdFor(admin, QA_EMAILS.admin);
    const { data: before } = await admin
      .from("profiles")
      .select("admin_scope")
      .eq("id", adminId)
      .single();

    try {
      // 'operations' covers sessions/people/catalog and deliberately not money.
      await admin.from("profiles").update({ admin_scope: "operations" }).eq("id", adminId);
      const cookie = await cookieHeaderFor(QA_EMAILS.admin);

      const moneyRoute = await fetch(`${BASE}/api/admin/refund-session-partial`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify({ appointmentId: "x", amountPaise: 100, reason: "test" }),
      });
      expect(moneyRoute.status, "an operations admin reached a money route").toBe(403);

      // ...and can still reach its own section, so the scope isn't just
      // refusing everything.
      const sessionsRoute = await fetch(`${BASE}/api/admin/create-booking`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify({}),
      });
      expect(sessionsRoute.status, "an operations admin was locked out of sessions").toBe(400);
    } finally {
      await admin
        .from("profiles")
        .update({ admin_scope: before?.admin_scope ?? "full" })
        .eq("id", adminId);
    }
  });

  test("F-009: the activity log is append-only from any session", async () => {
    const admin = adminClient();
    const adminId = await profileIdFor(admin, QA_EMAILS.admin);
    // The admin's own (RLS-scoped) session, not the service role -- the
    // service role bypasses RLS by design and would prove nothing.
    const cookie = await cookieHeaderFor(QA_EMAILS.admin);
    const anonInsert = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/admin_activity_log`,
      {
        method: "POST",
        headers: {
          apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          "Content-Type": "application/json",
          Cookie: cookie,
        },
        body: JSON.stringify({ actor_id: adminId, action: "forged.entry" }),
      }
    );
    expect(anonInsert.ok, "an insert into the audit log succeeded").toBe(false);
  });
});
