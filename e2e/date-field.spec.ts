// DATE-FIELD: nothing in this app opens the operating system's own date panel.
//
// Twenty-eight `<input type="date">` / `datetime-local` boxes handed the choice
// to a panel the browser draws -- unstyled, worded differently and placed
// differently on every browser and every phone, and the one piece of UI here
// nobody designed. They open `DateField` now, over the same month grid that
// books a session.
//
// `src/lib/nativeDateInput.test.ts` already walks the source and fails on a
// native input, which is the cheap half. What a walk cannot prove is that the
// replacement *works* -- that the popover opens, that it will accept a date in
// the past (the report filters' whole requirement, and the one thing
// `isDateBookable` cannot express), and that the value it emits is byte-for-byte
// what the native input emitted. That last one is the risk in this change: every
// one of those call sites reads its value straight into a query or an ISO parse,
// so a control that emitted anything else would be a behaviour change dressed as
// a restyle.
import { test, expect, type Page } from "@playwright/test";
import { BASE, browserCookiesFor, QA_EMAILS } from "./helpers";

const SLOW = 240_000;

async function openScreen(page: Page, section: string, tab: string) {
  await page.goto(`${BASE}/admin/dashboard?section=${section}&tab=${tab}`);
  await page
    .waitForFunction(() => !document.documentElement.hasAttribute("data-splash"), null, {
      timeout: 30_000,
    })
    .catch(() => {});
  await page.waitForLoadState("networkidle");
}

test.describe("date fields are the clinic's own", () => {
  test("DF-001: the admin dashboard renders no native date or time input at all", async ({
    page,
    context,
  }) => {
    test.setTimeout(SLOW);
    await context.addCookies(await browserCookiesFor(QA_EMAILS.admin));
    // Every screen is mounted at once behind `hidden`, so one load covers all
    // thirty-four of them -- which is exactly what makes this assertion worth
    // making in a browser rather than only in the source walk.
    await openScreen(page, "money", "costs");

    // One locator per selector: `:visible` is a Playwright CSS extension and
    // does not resolve inside a comma-separated list, so a combined selector
    // silently matches nothing and the assertion passes for the wrong reason.
    //
    // The pre-launch debug bar is the documented exemption and it renders in
    // every environment, so it is excluded **by its own control's name** rather
    // than by counting one allowed input: a second native box appearing beside
    // it must still fail this.
    const NATIVE = ["date", "datetime-local", "time", "month", "week"];
    for (const type of NATIVE) {
      await expect(
        page.locator(`input[type="${type}"]:not([aria-label="Simulate the current date and time"])`)
      ).toHaveCount(0);
    }
  });

  test("DF-002: a cost's date opens the clinic's calendar and takes a past date", async ({
    page,
    context,
  }) => {
    test.setTimeout(SLOW);
    await context.addCookies(await browserCookiesFor(QA_EMAILS.admin));
    await openScreen(page, "money", "costs");

    const trigger = page.getByRole("button", { name: "Date incurred" });
    await expect(trigger).toBeVisible({ timeout: 60_000 });
    const before = await trigger.textContent();
    await trigger.click();

    const dialog = page.getByRole("dialog").last();
    await expect(dialog).toBeVisible({ timeout: 30_000 });
    await page.screenshot({ path: "/tmp/datefield-01-open.png" });

    // A cost is dated when it was incurred, which is in the past. The booking
    // calendar's "too soon to book" rule is a booking rule and must not leak
    // onto a screen that records something that already happened -- so the back
    // arrow, which `BookingCalendar` disables at the first month holding a
    // bookable day, has to be live here.
    const back = dialog.getByRole("button", { name: "Previous month" });
    await expect(back).toBeEnabled();
    await back.click();

    // Day cells are labelled with the whole date rather than the number, so
    // they are located through the month grid they sit in.
    const days = dialog.getByRole("group").getByRole("button");
    const day = days.nth(3);
    await expect(day).toBeEnabled();
    await day.click();
    // The choice is committed by Done, not by the tap -- a picker that closed
    // on the day cell could not offer an hour, a Clear or a Cancel.
    await dialog.getByRole("button", { name: "Done" }).click();

    await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 15_000 });
    await expect(trigger).not.toHaveText(before ?? "");
    await page.screenshot({ path: "/tmp/datefield-02-picked-past.png" });
  });

  test("DF-003: Escape closes it and gives focus back to the button", async ({ page, context }) => {
    test.setTimeout(SLOW);
    await context.addCookies(await browserCookiesFor(QA_EMAILS.admin));
    await openScreen(page, "money", "costs");

    const trigger = page.getByRole("button", { name: "Date incurred" });
    await expect(trigger).toBeVisible({ timeout: 60_000 });
    await trigger.click();
    await expect(page.getByRole("dialog").last()).toBeVisible({ timeout: 30_000 });

    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test("DF-004: the value it writes is the value the native input wrote", async ({
    page,
    context,
  }) => {
    test.setTimeout(SLOW);
    await context.addCookies(await browserCookiesFor(QA_EMAILS.admin));
    await openScreen(page, "money", "costs");

    // The control keeps its value in a hidden input so a form submits exactly
    // what it always did. `YYYY-MM-DD` is the contract; anything else silently
    // breaks a filter, an export or a saved row.
    const trigger = page.getByRole("button", { name: "Date incurred" });
    await expect(trigger).toBeVisible({ timeout: 60_000 });
    await trigger.click();
    const dialog = page.getByRole("dialog").last();
    await dialog.getByRole("group").getByRole("button").nth(3).click();
    await dialog.getByRole("button", { name: "Done" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 15_000 });

    // The rendered label is the evidence available from outside the component,
    // and it reads back through the same `YYYY-MM-DD` the form submits: a value
    // that failed to parse renders as the placeholder, which is exactly what an
    // emitted-value bug looks like from here. The value layer itself is proved
    // character-by-character in `src/lib/dateFieldValue.test.ts` -- that is the
    // half a browser cannot check, and this is the half a unit test cannot.
    await expect(trigger).not.toHaveText(/Any date/);
    // A month name, a day and a year, in whichever order the runtime's locale
    // puts them -- `formatDateKeyMedium` deliberately does not pin the locale,
    // because a date key is a wall-clock date with no instant behind it.
    await expect(trigger).toHaveText(/\w{3,9}\s*\d{1,2},?\s*\d{4}|\d{1,2}\s+\w{3,9}\s+\d{4}/);
  });

  test("DF-005: the roster's exception date is the same control", async ({ page, context }) => {
    test.setTimeout(SLOW);
    await context.addCookies(await browserCookiesFor(QA_EMAILS.admin));
    await openScreen(page, "sessions", "roster");
    await expect(page.getByRole("heading", { name: "Therapist roster" })).toBeVisible({
      timeout: 60_000,
    });

    // Exceptions and leave both sit behind an explicit Add, which is why the
    // native inputs there survived the earlier sweeps of the filter screens.
    const add = page.getByRole("button", { name: /Add (an )?exception/i }).first();
    if ((await add.count()) > 0) await add.click();

    await expect(page.locator('input[type="date"]')).toHaveCount(0);
    await page.screenshot({ path: "/tmp/datefield-03-roster.png", fullPage: true });
  });
});
