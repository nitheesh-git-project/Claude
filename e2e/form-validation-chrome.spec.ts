// FORM-VAL: the browser's own validation bubble, replaced app-wide.
//
// Driven as a screen because that is the whole of the change: no route, no
// row and no form's own handling moves, and what a person meets on a
// refused submit is either the operating system's grey tooltip or the
// clinic's own message. The two cases are deliberately one admin screen and
// one public page -- this is a single listener at the root rather than an
// edit to each form, so the thing worth proving is that a form which has
// never heard of it is covered.
import { test, expect } from "@playwright/test";
import { BASE, browserCookiesFor, QA_EMAILS } from "./helpers";

test("FORM-VAL-001: an admin form refuses in the app's own words", async ({ page, context }) => {
  await context.addCookies(await browserCookiesFor(QA_EMAILS.admin));
  await page.goto(`${BASE}/admin/dashboard?section=catalog&tab=conditions`);
  await page.waitForLoadState("networkidle");

  await page.getByRole("button", { name: /Add (a )?(new )?(Category|Condition)/i }).first().click();
  await page.getByRole("button", { name: /Add Category/i }).last().click();

  // Named, and naming the *first* refused field rather than whichever
  // control the browser happened to fire last.
  const message = page.getByRole("alert").filter({ hasText: "Category Name needs filling in." });
  await expect(message).toBeVisible();

  const refused = page.locator('input[data-invalid="true"]');
  await expect(refused).toHaveCount(1);

  // Typing clears the message and the ring together: a red field the reader
  // has already corrected says something untrue.
  await refused.fill("QA Validation Check");
  await expect(page.getByRole("alert").filter({ hasText: "needs filling in" })).toHaveCount(0);
  await expect(page.locator('[data-invalid="true"]')).toHaveCount(0);
});

test("FORM-VAL-002: a public form gets the same treatment", async ({ page }) => {
  await page.goto(`${BASE}/hospitals`);
  await page.waitForLoadState("networkidle");

  const submit = page.getByRole("button", { name: /Request a call|Send|Submit/i }).last();
  await submit.scrollIntoViewIfNeeded();
  await submit.click();

  const message = page.getByRole("alert").filter({ hasText: /needs filling in|Choose|has to be/ });
  await expect(message.first()).toBeVisible();
  await expect(page.locator('[data-invalid="true"]')).toHaveCount(1);
  // One message, never one per refused field -- a form of five blanks must
  // not answer with five tooltips.
  await expect(message).toHaveCount(1);
});
