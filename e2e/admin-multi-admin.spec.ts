// Suite H -- two admins at once, and the realtime wiring that keeps them in
// step.
//
// One caveat stated up front: Supabase Realtime is a WebSocket the *browser*
// opens, so in a sandbox whose browser has no outbound network the live
// push cannot be exercised. What is tested here instead is everything that
// determines whether it would work and whether the dashboard stays correct
// without it: the table list the subscription is built from, and what
// actually happens when two admins act on the same row at the same time.
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { BASE, QA_EMAILS, adminClient, browserCookiesFor, cookieHeaderFor, profileIdFor } from "./helpers";

test.describe("Suite H: two admins", () => {
  test("H-006: every table the dashboard reads is in the realtime publication", async () => {
    const shell = readFileSync(
      path.resolve(__dirname, "../src/components/admin/AdminShell.tsx"),
      "utf8"
    );
    const page = readFileSync(
      path.resolve(__dirname, "../src/app/admin/dashboard/page.tsx"),
      "utf8"
    );
    const schema = readFileSync(path.resolve(__dirname, "../supabase/schema.sql"), "utf8");

    const subscribed = new Set(
      [...shell.matchAll(/^\s*"([a-z_]+)",$/gm)].map((m) => m[1])
    );
    // Every base table the dashboard actually queries.
    const queried = new Set(
      [...page.matchAll(/\.from\("([a-z_]+)"\)/g)].map((m) => m[1])
    );
    // package_purchase_summary is a view; postgres_changes only streams base
    // tables, and its underlying table is covered instead.
    queried.delete("package_purchase_summary");
    // therapist_schedule_state holds one version number per therapist -- the
    // roster's compare-and-swap counter, not anything the dashboard renders.
    // It is never written without a write to therapist_availability_template
    // or therapist_availability_override beside it, and both of those are
    // subscribed, so the refresh that re-reads the version already happens.
    // Subscribing to it as well would mean a second rebuild per schedule
    // save carrying no information the first one lacked.
    queried.delete("therapist_schedule_state");

    const missing = [...queried].filter((t) => !subscribed.has(t));
    expect(
      missing,
      `read by the dashboard but not in ADMIN_REALTIME_TABLES: ${missing.join(", ")}`
    ).toEqual([]);

    // ...and being in that list is pointless unless the table is actually
    // published, which is a schema.sql concern.
    const unpublished = [...subscribed].filter(
      (t) => !schema.includes(`alter publication supabase_realtime add table ${t};`)
    );
    expect(
      unpublished,
      `subscribed but never added to the publication: ${unpublished.join(", ")}`
    ).toEqual([]);
  });

  test("H-003: a second admin's approval removes the row from the first admin's inbox", async ({
    browser,
  }) => {
    test.setTimeout(180_000);
    const admin = adminClient();

    // A pending signup that both admins can see.
    const email = `qa.pending.${Date.now()}@example.test`;
    const { data: created } = await admin.auth.admin.createUser({
      email,
      password: "QaTest!2024pass",
      email_confirm: true,
      user_metadata: { full_name: "QA Pending Signup" },
    });
    await admin
      .from("profiles")
      .update({ role: "patient", approved: false, active: true, full_name: "QA Pending Signup" })
      .eq("id", created!.user!.id);

    const contextA = await browser.newContext();
    await contextA.addCookies(await browserCookiesFor(QA_EMAILS.admin));
    const pageA = await contextA.newPage();

    try {
      await pageA.goto(`${BASE}/admin/dashboard?section=people&tab=patients`);
      // Scoped to what is actually on screen: every section stays mounted and
      // is hidden with CSS, so an unscoped match can latch onto a copy inside
      // a hidden screen and then wait forever for it to appear.
      await expect(
        pageA.getByText("QA Pending Signup").filter({ visible: true }).first()
      ).toBeVisible({ timeout: 60_000 });

      // Admin B acts -- here through the API, which is the same route the
      // second browser's button would call.
      const cookieB = await cookieHeaderFor(QA_EMAILS.admin);
      const res = await fetch(`${BASE}/api/admin/approve-account`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookieB },
        body: JSON.stringify({ userId: created!.user!.id }),
      });
      expect(res.ok).toBe(true);

      // Admin A's next read must reflect it. (With realtime reachable this
      // happens on its own; without it, a reload is what an admin would do.)
      await pageA.reload();
      const stillPending = pageA
        .locator("li", { hasText: "QA Pending Signup" })
        .filter({ hasText: /Approve/ });
      await expect(stillPending).toHaveCount(0, { timeout: 30_000 });
    } finally {
      await contextA.close();
      await admin.auth.admin.deleteUser(created!.user!.id);
    }
  });

  test("H-020: two admins assigning different therapists to one session cannot both win", async () => {
    const admin = adminClient();
    const patientId = await profileIdFor(admin, QA_EMAILS.patientA);
    const therapistA = await profileIdFor(admin, QA_EMAILS.therapistA);
    const therapistB = await profileIdFor(admin, QA_EMAILS.therapistB);
    const cookie = await cookieHeaderFor(QA_EMAILS.admin);

    const slot = new Date(Date.now() + 30 * 86_400_000).toISOString();
    const { data: appointment } = await admin
      .from("appointments")
      .insert({
        patient_id: patientId,
        concern: "QA concurrent assign",
        slot_time: slot,
        status: "requested",
        payment_status: "paid",
        amount_paid_paise: 100_000,
        visit_mode: "online",
        duration_minutes: 60,
      })
      .select("id")
      .single();

    try {
      const [resA, resB] = await Promise.all(
        [therapistA, therapistB].map((therapistId) =>
          fetch(`${BASE}/api/admin/assign-appointment`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Cookie: cookie },
            body: JSON.stringify({ appointmentId: appointment!.id, therapistId }),
          })
        )
      );

      const { data: after } = await admin
        .from("appointments")
        .select("therapist_id, status")
        .eq("id", appointment!.id)
        .single();

      // Whatever the two responses said, the row must name exactly one
      // therapist -- and it must be one of the two that were attempted.
      expect([therapistA, therapistB]).toContain(after?.therapist_id);
      // And at least one request must have been told it lost, rather than
      // both being told they won.
      expect(
        [resA.ok, resB.ok].filter(Boolean).length,
        "both concurrent assignments reported success"
      ).toBeLessThanOrEqual(1);
    } finally {
      await admin.from("appointments").delete().eq("id", appointment!.id);
    }
  });
});
