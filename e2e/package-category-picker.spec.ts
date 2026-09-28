// PKG-CAT: a package's category is chosen when it is created.
//
// The new-package form rendered its Category select `disabled`, with a hint
// underneath saying it could not be changed -- so every package ever
// created was pinned to whichever condition sorts first, and the hint made
// that read as a rule rather than as a control nobody had enabled. The
// lock is real only *after* creation, where live purchases reference it.
import { test, expect } from "@playwright/test";
import { BASE, browserCookiesFor, QA_EMAILS } from "./helpers";

test("PKG-CAT-001: the new-package form offers every condition", async ({ page, context }) => {
  await context.addCookies(await browserCookiesFor(QA_EMAILS.admin));
  await page.goto(`${BASE}/admin/dashboard?section=catalog&tab=packages`);
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "+ Add Package" }).click();

  // Every admin screen stays mounted behind `hidden`, so the controls have
  // to be scoped to the visible form.
  const select = page.locator("form:visible select:visible").first();
  await select.scrollIntoViewIfNeeded();
  await expect(select).toBeEnabled();

  const options = select.locator("option");
  expect(await options.count()).toBeGreaterThan(1);
  // The list price is part of the choice: every saving figure on this form
  // is computed against it.
  await expect(options.first()).toContainText("a session");

  // A category other than the first can actually be selected -- the whole
  // of the bug.
  const other = await options.nth(1).getAttribute("value");
  await select.selectOption(other!);
  await expect(select).toHaveValue(other!);
});
