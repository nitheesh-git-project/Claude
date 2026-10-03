// The Risk screen's empty state is only an all-clear when the last
// detector sweep actually covered everything.
//
// runRiskSweep used to swallow every failure: a detector whose read failed
// returned "no findings", a rule the time budget did not reach was skipped,
// and a capped read looked complete -- so "Nothing waiting" could be a scan
// that never ran. The sweep now stores its own report in risk_sweep_runs,
// and the screen says when the last check was not complete, naming the
// rules.
//
// The report row is written here directly (the detectors themselves cannot
// be made to fail on demand against a live database) and put back after.
import { test, expect } from "@playwright/test";
import { BASE, QA_EMAILS, adminClient, browserCookiesFor } from "./helpers";

const db = adminClient();
let original: Record<string, unknown> | null = null;

test.beforeAll(async () => {
  const { data, error } = await db.from("risk_sweep_runs").select("*").eq("id", 1).maybeSingle();
  if (error) throw new Error(`risk_sweep_runs is missing - apply schema.sql: ${error.message}`);
  original = data;
});

test.afterAll(async () => {
  if (original) await db.from("risk_sweep_runs").upsert(original);
  else await db.from("risk_sweep_runs").delete().eq("id", 1);
});

async function openRisk(browser: import("@playwright/test").Browser) {
  const ctx = await browser.newContext();
  await ctx.addCookies(await browserCookiesFor(QA_EMAILS.admin));
  const page = await ctx.newPage();
  await page.goto(`${BASE}/admin/dashboard?section=today&tab=risk`);
  await expect(page.getByText("Risk signals").filter({ visible: true }).first()).toBeVisible({
    timeout: 60_000,
  });
  return { ctx, page };
}

test("RSK-001: an incomplete sweep is said, naming the rule", async ({ browser }) => {
  test.setTimeout(120_000);
  const { data: rule } = await db.from("risk_rules").select("rule_key, label").limit(1).single();
  await db.from("risk_sweep_runs").upsert({
    id: 1,
    finished_at: new Date().toISOString(),
    complete: false,
    failed_rules: [rule!.rule_key],
    unreached_rules: [],
    truncated_rules: [],
    unrecorded_count: 0,
  });

  const { ctx, page } = await openRisk(browser);
  const notice = page.getByText(/The last check wasn.t complete/).filter({ visible: true }).first();
  await expect(notice).toBeVisible();
  await expect(page.getByText(new RegExp(`Couldn.t run: ${rule!.label}`)).filter({ visible: true }).first()).toBeVisible();
  // And the reassuring empty state is not offered on the strength of it.
  await expect(page.getByText("Nothing waiting", { exact: true }).filter({ visible: true })).toHaveCount(0);
  await ctx.close();
});

test("RSK-002: a complete sweep carries no warning", async ({ browser }) => {
  test.setTimeout(120_000);
  await db.from("risk_sweep_runs").upsert({
    id: 1,
    finished_at: new Date().toISOString(),
    complete: true,
    failed_rules: [],
    unreached_rules: [],
    truncated_rules: [],
    unrecorded_count: 0,
  });
  const { ctx, page } = await openRisk(browser);
  await expect(page.getByText(/The last check wasn.t complete/).filter({ visible: true })).toHaveCount(0);
  await ctx.close();
});

test("RSK-003: the report is admin-only", async () => {
  // RLS: the anon key reads nothing from it.
  const { createClient } = await import("@supabase/supabase-js");
  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const { data } = await anon.from("risk_sweep_runs").select("*");
  expect(data ?? []).toEqual([]);
});
