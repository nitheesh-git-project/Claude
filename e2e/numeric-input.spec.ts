// NUM: a number box takes digits, and nothing else.
//
// `<input type="number">` accepts `e`, `E` and `+` in every browser, and
// Chromium keeps them on screen while reporting the value as empty -- so a
// letter typed into the condition form's Order box left a stray character
// there, refused everything after it, and submitted as though the box were
// blank. The rule itself is unit-tested; this is the half that needs a real
// browser, since it is the browser's own handling being overridden.
import { test, expect } from "@playwright/test";
import { BASE, browserCookiesFor, QA_EMAILS } from "./helpers";

test("NUM-001: a whole-number box refuses everything but digits", async ({ page, context }) => {
  await context.addCookies(await browserCookiesFor(QA_EMAILS.admin));
  await page.goto(`${BASE}/admin/dashboard?section=catalog&tab=conditions`);
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: /Add (a )?(new )?(Category|Condition)/i }).first().click();

  const order = page.locator("form input[type=number][step='1'][min='0']").last();
  await order.scrollIntoViewIfNeeded();
  await order.fill("");
  await order.type("e12e3abc+-");
  expect(await order.inputValue()).toBe("123");

  // The guard reads the field rather than imposing one rule on all of them:
  // a price's step allows a fraction, so one decimal point still goes in
  // and a second one does not.
  const price = page.locator("form input[type=number][step='0.01']").last();
  await price.fill("");
  await price.type("49e9.5.5");
  expect(await price.inputValue()).toBe("499.55");
});
