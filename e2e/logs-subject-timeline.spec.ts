// LOG-BACK: the way back between the two Logs dialogs.
//
// One dialog is open at a time in the Logs section, so a dialog that
// replaced another has to carry the way back itself. Nothing about that is
// visible to an API test -- the routes are unchanged and both dialogs read
// the same rows either way -- and the failure it guards against is a reader
// closing the record history and having to find their entry in the table
// again. So it is driven as a screen, like the pay-later UI cases.
import { test, expect } from "@playwright/test";
import { BASE, browserCookiesFor, QA_EMAILS } from "./helpers";

test("LOG-BACK: entry and record history each offer the way back", async ({ page, context }) => {
  await context.addCookies(await browserCookiesFor(QA_EMAILS.admin));
  await page.goto(`${BASE}/admin/dashboard?section=logs&tab=activity`);
  await page.waitForLoadState("networkidle");

  // Every admin screen stays mounted behind `hidden`, so the rows have to be
  // scoped to the visible one or this walks another screen's table.
  const rows = page.locator("tbody tr:visible");
  const traceLink = page.getByRole("button", { name: /See everything done to this record/ });

  // An entry with no target_id is offered no history, so the first one that
  // does is what this walks. A log with none at all (a freshly reset
  // database) has nothing to test rather than a failure to report.
  let opened = false;
  const count = await rows.count();
  for (let i = 0; i < Math.min(count, 12); i++) {
    await rows.nth(i).click();
    await page.waitForTimeout(300);
    if (await traceLink.isVisible().catch(() => false)) {
      opened = true;
      break;
    }
    await page.keyboard.press("Escape");
    await page.waitForTimeout(150);
  }
  test.skip(!opened, "no logged action names a record -- nothing to trace");

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
