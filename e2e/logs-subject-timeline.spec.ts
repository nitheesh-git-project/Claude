// LOG-BACK: the way back between the two Logs dialogs.
//
// One dialog is open at a time in the Logs section, so a dialog that
// replaced another has to carry the way back itself. Nothing about that is
// visible to an API test -- the routes are unchanged and both dialogs read
// the same rows either way -- and the failure it guards against is a reader
// closing the record history and having to find their entry in the table
// again. So it is driven as a screen, like the pay-later UI cases.
import { test, expect } from "@playwright/test";
import { BASE, browserCookiesFor, QA_EMAILS, adminClient, profileIdFor, settleNetwork } from "./helpers";

test("LOG-BACK: entry and record history each offer the way back", async ({ page, context }) => {
  // The admin dashboard, then up to a dozen rows and the timeline's own
  // reads: against a hosted project 30s is not enough (testing.md).
  test.setTimeout(90_000);
  // Its own entry naming a record, newest of all, so there is always one to
  // trace: which entries the log holds otherwise depends on what ran before
  // on the same database, and on a fresh one the newest dozen can all be
  // record-less (test-account and settings entries name no record).
  const db = adminClient();
  const adminId = await profileIdFor(db, QA_EMAILS.admin);
  const patientId = await profileIdFor(db, QA_EMAILS.patientA);
  const { error: logError } = await db.from("admin_activity_log").insert({
    actor_id: adminId,
    action: "account.set_active",
    target_id: patientId,
    target_label: "QA Patient A (patient)",
    details: { active: true, e2e: "LOG-BACK" },
  });
  expect(logError, logError?.message).toBeNull();

  await context.addCookies(await browserCookiesFor(QA_EMAILS.admin));
  await page.goto(`${BASE}/admin/dashboard?section=logs&tab=activity`);
  await settleNetwork(page);

  // Every admin screen stays mounted behind `hidden`, so the rows have to be
  // scoped to the visible one or this walks another screen's table.
  const rows = page.locator("tbody tr:visible");
  const traceLink = page.getByRole("button", { name: /See everything done to this record/ });

  // The entry written above is the newest, so it is the first row; it names
  // a record, so its dialog offers that record's history. Waited for rather
  // than glanced at: the dialog renders after the click, not with it.
  const ours = rows.filter({ hasText: "Changed account status" }).filter({ hasText: "QA Patient A" }).first();
  await expect(ours).toBeVisible({ timeout: 30_000 });
  await ours.click();
  await expect(traceLink).toBeVisible({ timeout: 15_000 });

  const dialog = page.getByRole("dialog");
  const entryTitle = await dialog.locator("h3").first().innerText();

  // Entry -> history, and back to the same entry.
  await traceLink.click();
  const backToEntry = page.getByRole("button", { name: "Back to this entry" });
  await expect(backToEntry).toBeVisible();
  await expect(dialog.locator("ol > li > button").first()).toBeVisible();
  await backToEntry.click();
  await expect(dialog.locator("h3").first()).toHaveText(entryTitle);
  // Opened from the table in the first place, so there is no history behind
  // this one to go back to and no button claiming there is.
  await expect(page.getByRole("button", { name: "Back to this record's history" })).toHaveCount(0);

  // History -> one of its entries, and back to the history.
  await traceLink.click();
  await expect(dialog.locator("ol > li > button").first()).toBeVisible();
  await dialog.locator("ol > li > button").first().click();
  const backToHistory = page.getByRole("button", { name: "Back to this record's history" });
  await expect(backToHistory).toBeVisible();
  await backToHistory.click();
  await expect(backToEntry).toBeVisible();
  await expect(dialog.locator("ol > li > button").first()).toBeVisible();

  // Escape still closes rather than going back.
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});
