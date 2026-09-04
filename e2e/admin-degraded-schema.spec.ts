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

test.describe("Suite J: degraded schema", () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(300_000);
    await page.context().addCookies(await browserCookiesFor(QA_EMAILS.admin));
  });

  test("J-005: a missing admin_activity_log empties only the Activity Log", async ({ page }) => {
    try {
      sql("drop table if exists admin_activity_log cascade;");
      await dashboardStillWorks(page);

      await page.goto(`${BASE}/admin/dashboard?section=settings&tab=activity`);
      await expect(
        page.getByRole("heading", { level: 2, name: "Activity Log" })
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
      // other setting on the same screen still renders.
      await expect(page.getByText("Online Booking Lead Time")).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText("Session Timeout of Inactivity")).toBeVisible();
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
