// Suite J -- the isolation rule this codebase is built around: a
// migration-dependent column or table that isn't there yet must empty its
// own panel and nothing else. Every query in the admin dashboard is written
// that way on purpose (see the comments beside each read in page.tsx), and
// this is what proves it still holds.
//
// Each test drops something, loads the dashboard, and puts it back in a
// finally block by re-applying schema.sql -- which is re-runnable by design.
// Scoped to what this change introduced: dropping older columns like
// session_code would also drop triggers and indexes that schema.sql rebuilds
// under `if not exists` guards, which risks leaving the project subtly
// different from where it started.
import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { BASE, QA_EMAILS, browserCookiesFor } from "./helpers";

const ROOT = path.resolve(__dirname, "..");

function sql(statement: string) {
  const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split(".")[0];
  const res = execFileSync(
    "node",
    [
      "-e",
      `fetch("https://api.supabase.com/v1/projects/${ref}/database/query",{method:"POST",headers:{Authorization:"Bearer "+process.env.SUPABASE_ACCESS_TOKEN,"Content-Type":"application/json"},body:JSON.stringify({query:process.argv[1]})}).then(async r=>{if(!r.ok){console.error(await r.text());process.exit(1)}})`,
      statement,
    ],
    { cwd: ROOT, encoding: "utf8" }
  );
  return res;
}

function restoreSchema() {
  execFileSync("node", ["scripts/run-schema.mjs"], { cwd: ROOT, encoding: "utf8" });
}

async function dashboardStillWorks(page: import("@playwright/test").Page) {
  // The whole page, not one panel: the point of the isolation rule is that
  // one missing column cannot take the other thirty-nine queries down.
  await page.goto(`${BASE}/admin/dashboard?section=sessions&tab=all`);
  await expect(page.getByRole("heading", { level: 2, name: /^All Sessions/ })).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByRole("table")).toBeVisible();
}

/**
 * Whether this suite is safe to run at all.
 *
 * Every test here drops something real and puts it back by re-applying
 * schema.sql. Both halves go through the Supabase Management API, and the
 * restore additionally shells out to `scripts/run-schema.mjs`, which needs a
 * direct Postgres connection.
 *
 * So the credential is not a convenience -- it is the *undo*. A run that can
 * drop but cannot restore leaves the project's schema broken, and the failure
 * would look like a product bug on every subsequent spec. Checked once, before
 * anything is dropped, and the whole suite stands down if the answer is no.
 *
 * It is checked by spending the token rather than testing that it is set,
 * for the same reason `googleConnectionHealth` spends its refresh token: a
 * token can be present and expired, and presence would have passed here while
 * an expired token was refusing every call.
 */
let restorable: { ok: boolean; why: string } | null = null;

async function canRestoreSchema(): Promise<{ ok: boolean; why: string }> {
  if (restorable) return restorable;
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token) {
    restorable = { ok: false, why: "SUPABASE_ACCESS_TOKEN is not set" };
    return restorable;
  }
  const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split(".")[0];
  try {
    const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: "select 1" }),
    });
    restorable = res.ok
      ? { ok: true, why: "" }
      : { ok: false, why: `the Management API answered ${res.status} -- the access token is expired or lacks rights on this project` };
  } catch (err) {
    restorable = { ok: false, why: `the Management API is unreachable (${err instanceof Error ? err.message : String(err)})` };
  }
  return restorable;
}

test.describe("Suite J: degraded schema", () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(300_000);
    const restore = await canRestoreSchema();
    test.skip(
      !restore.ok,
      `this suite drops real columns and restores them by re-applying schema.sql, ` +
        `and it cannot restore here: ${restore.why}. Refusing to drop anything ` +
        `rather than risk leaving the schema broken.`
    );
    await page.context().addCookies(await browserCookiesFor(QA_EMAILS.admin));
  });

  test("J-005: a missing admin_activity_log empties only the log screen", async ({ page }) => {
    try {
      sql("drop table if exists admin_activity_log cascade;");
      await dashboardStillWorks(page);

      await page.goto(`${BASE}/admin/dashboard?section=logs&tab=all`);
      await expect(
        page.getByRole("heading", { level: 2, name: "All Activity" })
      ).toBeVisible({ timeout: 30_000 });
      // Empty, and saying so -- not a crash and not a blank panel.
      await expect(page.getByText(/Nothing logged yet/)).toBeVisible();
    } finally {
      restoreSchema();
    }
  });

  test("J-008: a missing profiles.admin_scope leaves every admin at full access", async ({
    page,
  }) => {
    try {
      sql("alter table profiles drop column if exists admin_scope cascade;");
      await dashboardStillWorks(page);

      // parseAdminScope() treats absent as 'full', which is how every admin
      // behaved before scopes existed -- a migration must never lock the
      // only admin out of their own dashboard.
      await page.goto(`${BASE}/admin/dashboard?section=settings&tab=access`);
      await expect(page.getByRole("heading", { name: "Admins" })).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText("Create an account")).toBeVisible();
    } finally {
      restoreSchema();
    }
  });

  test("J-006: a missing site_settings column reads as its default, alone", async ({ page }) => {
    try {
      sql(
        "alter table site_settings drop column if exists online_booking_lead_time_hours cascade;"
      );
      await dashboardStillWorks(page);

      await page.goto(`${BASE}/admin/dashboard?section=settings&tab=booking`);
      // The setting falls back to the documented default (12) and every
      // other setting on the same screen still renders. Both headings were
      // reworded when Settings stopped naming its controls after the column
      // they write, and the idle timeout moved to Sign-in & Security in the
      // same change -- an idle timeout is not a booking rule -- so the
      // "and nothing else broke" half is asserted with a control that is
      // still on this screen.
      await expect(page.getByText("How far ahead a session must be booked")).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.getByText("Free cancellation window")).toBeVisible();
      await expect(page.getByText("Auto-Create Meet Links")).toBeVisible();
    } finally {
      restoreSchema();
    }
  });

  test("J-009: missing refund columns don't stop a session opening", async ({ page }) => {
    try {
      sql("alter table appointments drop column if exists refund_is_manual cascade;");
      sql("alter table appointments drop column if exists refund_reason cascade;");
      await dashboardStillWorks(page);

      // The list is the thing that must survive -- these columns are only
      // written by the discretionary-refund path.
      const rows = page.getByRole("row");
      expect(await rows.count()).toBeGreaterThan(1);
    } finally {
      restoreSchema();
    }
  });
});
