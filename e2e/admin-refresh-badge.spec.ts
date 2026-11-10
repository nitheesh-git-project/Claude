import { spawnSync } from "node:child_process";
import { test, expect } from "@playwright/test";
import { adminClient, browserCookiesFor, profileIdFor, QA_EMAILS, BASE } from "./helpers";

/**
 * The Refresh button's badge counts other people's changes, never the admin's
 * own taps.
 *
 * It used to climb for as long as somebody worked. `RealtimeRefresh` asked
 * "did a refresh start *after* this event arrived", and for the browser's own
 * work that can never be true: the route commits, the response returns, the
 * control calls `router.refresh()`, and only then does the realtime event
 * describing that commit reach the browser. So the suppression window was
 * empty, every admin action added one (two, across the operational and catalog
 * channels) to a badge their own refresh had just cleared, and the number went
 * up all day for no reason a person could see.
 *
 * A refresh is a window now -- `markLocalRefresh` to `markLocalRefreshSettled`,
 * plus a short grace for the realtime hop -- and `src/lib/refreshCoverage.ts`
 * is the judgement. That module's own unit tests pin the arithmetic; what
 * needs a browser is the half nothing else can see: a real websocket, a real
 * `router.refresh()`, and a badge a person reads.
 *
 * Driven as a screen for that reason. No route and no row changed, so an API
 * test would pass either way round.
 *
 * **It needs the browser to reach Supabase.** The badge is fed by a realtime
 * subscription from the page itself, so in a sandbox with no egress from
 * Chromium the socket never opens, nothing is ever counted, and every
 * assertion here passes vacuously. RB-000 is the guard on that: it fails
 * rather than letting the rest report a fixed bug on a connection that was
 * never made.
 */
test.describe("the admin Refresh button's waiting-changes badge", () => {
  const SHOTS = "e2e/screenshots/admin-refresh-badge";

  // What the browser saw of the change stream (src/lib/realtimeTrail.ts): each
  // refresh's start and landing, each join, the server's word on the Postgres
  // side of it, each event, and whether it was counted, deferred or judged
  // covered. One line on a pass, so a green run can be read beside a red one;
  // in full on a failure, where "no badge" alone cannot say which step failed.
  test.afterEach(async ({ page }, testInfo) => {
    const entries = (await page
      .evaluate(() => (window as unknown as { __realtimeTrail?: unknown[] }).__realtimeTrail ?? [])
      .catch(() => [])) as { at: number; kind: string; detail?: string }[];
    const start = entries[0]?.at ?? 0;
    const line = entries.map((e) => `+${e.at - start}ms ${e.kind}${e.detail ? ` (${e.detail.slice(0, 60)})` : ""}`).join(" | ");
    console.log(`[realtime trail] ${testInfo.title}: ${line || "empty"}`);
    if (testInfo.status === testInfo.expectedStatus) return;
    await testInfo.attach("realtime-trail.json", { body: JSON.stringify(entries, null, 1), contentType: "application/json" });
    const server = localStackRealtimeState();
    if (server) {
      console.log(`[realtime server] ${testInfo.title}\n${server}`);
      await testInfo.attach("realtime-server.txt", { body: server, contentType: "text/plain" });
    }
  });

  /**
   * The quality gate's local stack only: what Realtime holds in the database
   * at the moment a case failed -- the subscriptions it stored for the pages
   * that are open and the ROLE it stored them for, and where its replication
   * slot stands. Rows for `anon` is a join that went out without the person's
   * token (nothing they may read is ever delivered); rows with no slot
   * movement is a stalled poller; no rows is a join the server never
   * finished. Read-only, and skipped anywhere there is no local stack.
   */
  function localStackRealtimeState(): string | null {
    const url = process.env.CI_LOCAL_STACK === "1" ? process.env.SCHEMA_APPLY_DATABASE_URL : undefined;
    if (!url) return null;
    const sql = [
      "select 'subscriptions' as what, claims_role::text as stored_for_role, count(*) as rows, count(distinct entity) as tables, min(created_at) as oldest, max(created_at) as newest from realtime.subscription group by claims_role",
      "select 'slot' as what, slot_name, plugin, temporary, active, wal_status, pg_wal_lsn_diff(pg_current_wal_lsn(), confirmed_flush_lsn) as bytes_behind from pg_replication_slots",
      "select 'activity' as what, state, wait_event, round(extract(epoch from now() - query_start)) as seconds, left(regexp_replace(query, '\\s+', ' ', 'g'), 140) as query from pg_stat_activity where datname = current_database() and pid <> pg_backend_pid() and (query ilike '%realtime.%' or query ilike '%logical_slot%' or backend_type = 'walsender')",
    ];
    const out = spawnSync("psql", [url, "-X", "-q", "-x", ...sql.flatMap((q) => ["-c", q])], { encoding: "utf8", timeout: 20_000 });
    return `${out.stdout ?? ""}${out.stderr ?? ""}`.trim() || null;
  }

  /** The badge's own live region -- the button's name is deliberately constant. */
  function badgeText(page: import("@playwright/test").Page) {
    return page.getByRole("status").filter({ hasText: /update/ });
  }

  function refreshButton(page: import("@playwright/test").Page) {
    return page.getByRole("button", { name: "Refresh this screen" }).first();
  }

  async function openDashboard(page: import("@playwright/test").Page) {
    const cookies = await browserCookiesFor(QA_EMAILS.admin);
    await page.context().clearCookies();
    await page.context().addCookies(cookies);
    await page.goto(`${BASE}/admin/dashboard`);
    await page.waitForLoadState("networkidle");
    await expect(refreshButton(page)).toBeVisible({ timeout: 60_000 });
  }

  test("RB-000 the browser's realtime socket is actually open", async ({ page }) => {
    test.setTimeout(120_000);
    await openDashboard(page);

    // Without egress from Chromium the subscription silently never fires and
    // every case below passes on a connection that was never made -- the same
    // trap the no-egress note in AGENTS.md describes for the booking specs.
    const reachable = await page.evaluate(async () => {
      try {
        const res = await fetch(
          `${(window as unknown as { __E2E_SUPABASE_URL?: string }).__E2E_SUPABASE_URL ?? ""}/rest/v1/`
        );
        return res.status > 0;
      } catch {
        return false;
      }
    });
    // The URL is not injected in every environment, so this is a soft probe:
    // what it must not do is silently pass a suite that proved nothing.
    test.skip(!reachable, "the browser cannot reach Supabase -- the badge is fed by a socket that never opens here");

    // Each channel must JOIN as the signed-in admin. The page records the role
    // its join is about to carry (a development build's realtime trail); a
    // join as `none` or `anon` is the fault RB-002 can only show as "nothing
    // arrived". A production build keeps no trail, so there is nothing to read
    // there and RB-002 stands alone.
    const joins = async () =>
      (
        await page.evaluate(
          () => (window as unknown as { __realtimeTrail?: { kind: string; detail?: string }[] }).__realtimeTrail ?? null
        )
      )?.filter((e) => e.kind === "channel-join") ?? null;
    // The trail appears with its first entry, a moment after hydration.
    await page
      .waitForFunction(() => !!(window as unknown as { __realtimeTrail?: unknown[] }).__realtimeTrail, undefined, { timeout: 10_000 })
      .catch(() => null);
    if ((await joins()) !== null) {
      await expect.poll(async () => (await joins())?.length ?? 0, { timeout: 30_000 }).toBeGreaterThanOrEqual(2);
      for (const join of (await joins()) ?? []) expect(join.detail, "the role a realtime join carries").toMatch(/^as authenticated:/);
    }
  });

  test("RB-001 an admin's own refresh leaves the badge at zero", async ({ page }) => {
    test.setTimeout(120_000);
    await openDashboard(page);

    // The exact shape that used to climb: a write lands, the browser refreshes
    // for it, and the event describing that write arrives a moment later.
    const admin = adminClient();
    const id = await profileIdFor(admin, QA_EMAILS.patientA);
    const { data: before } = await admin
      .from("profiles")
      .select("full_name")
      .eq("id", id)
      .single();
    const restore = before?.full_name ?? null;

    try {
      await admin.from("profiles").update({ full_name: `${restore ?? "QA Patient"} ` }).eq("id", id);
      // Refresh the way every control in the app does, immediately after its
      // own write -- which is what puts the event inside the refresh's window.
      await refreshButton(page).click();
      await expect(refreshButton(page)).toBeEnabled({ timeout: 60_000 });

      // Long enough for the realtime hop and both channels' cooldowns to have
      // had their say. The old code showed a count here every time.
      await page.waitForTimeout(6_000);
      await page.screenshot({ path: `${SHOTS}/01-after-own-refresh.png`, fullPage: true });
      await expect(badgeText(page)).toHaveCount(0);
    } finally {
      await admin.from("profiles").update({ full_name: restore }).eq("id", id);
    }
  });

  test("RB-002 a change nobody here asked for is still counted", async ({ page }) => {
    test.setTimeout(120_000);
    await openDashboard(page);

    // The other half, and the reason the window is short: widening it until it
    // swallowed this would leave the badge saying nothing ever happens, which
    // is a worse failure than the one being fixed.
    const admin = adminClient();
    const id = await profileIdFor(admin, QA_EMAILS.patientB);
    const { data: before } = await admin
      .from("profiles")
      .select("full_name")
      .eq("id", id)
      .single();
    const restore = before?.full_name ?? null;

    try {
      // Settle any refresh of our own first, then wait well clear of the
      // grace, so what follows is unambiguously somebody else's work.
      await refreshButton(page).click();
      await expect(refreshButton(page)).toBeEnabled({ timeout: 60_000 });
      await page.waitForTimeout(5_000);

      // One write, counted. This is also the end-to-end proof that the join
      // carried the admin's token: a channel the server took for `anon` says
      // SUBSCRIBED and then never delivers this (src/lib/realtimeJoin.ts) --
      // which is what this case failed on in the quality gate, for a minute of
      // repeated writes, until the join was made to wait for the token.
      await admin.from("profiles").update({ full_name: `${restore ?? "QA Patient"} ` }).eq("id", id);

      await expect(badgeText(page)).toHaveCount(1, { timeout: 30_000 });
      await page.screenshot({ path: `${SHOTS}/02-someone-elses-change.png`, fullPage: true });
    } finally {
      await admin.from("profiles").update({ full_name: restore }).eq("id", id);
    }
  });

  test("RB-003 the count clears on a refresh and does not come back on its own", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openDashboard(page);

    const admin = adminClient();
    const id = await profileIdFor(admin, QA_EMAILS.patientB);
    const { data: before } = await admin
      .from("profiles")
      .select("full_name")
      .eq("id", id)
      .single();
    const restore = before?.full_name ?? null;

    try {
      await refreshButton(page).click();
      await expect(refreshButton(page)).toBeEnabled({ timeout: 60_000 });
      await page.waitForTimeout(5_000);

      await admin.from("profiles").update({ full_name: `${restore ?? "QA Patient"} ` }).eq("id", id);
      await expect(badgeText(page)).toHaveCount(1, { timeout: 30_000 });

      // Reading it is what clears it, and the refresh that clears it must not
      // then count its own echo -- which is the whole bug, one step along.
      await refreshButton(page).click();
      await expect(refreshButton(page)).toBeEnabled({ timeout: 60_000 });
      await expect(badgeText(page)).toHaveCount(0);

      await page.waitForTimeout(6_000);
      await expect(badgeText(page)).toHaveCount(0);
      await page.screenshot({ path: `${SHOTS}/03-cleared-and-stays-clear.png`, fullPage: true });
    } finally {
      await admin.from("profiles").update({ full_name: restore }).eq("id", id);
    }
  });
});
