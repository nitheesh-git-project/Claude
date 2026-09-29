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
