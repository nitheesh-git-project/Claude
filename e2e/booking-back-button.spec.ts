// The browser's Back button inside the booking wizard (I-19).
//
// Back from step 2 used to leave /book altogether and throw away the chosen
// slot and everything typed. Each step forward now adds a history entry, so
// Back shows the step before with the answers still there, and Forward
// returns to the details already typed. Nothing is booked or paid.
import { test, expect } from "@playwright/test";
import { BASE, answerCookieConsent, chooseAnyServiceOnStepOne, pickTimeOnStepOne, settleNetwork } from "./helpers";

test.describe("Booking wizard: browser Back", () => {
  test("BBB-001: Back from step 2 returns to step 1 with the slot kept, Forward returns to the typed details", async ({ page }) => {
    test.setTimeout(120_000);
    await answerCookieConsent(page);
    await page.goto(`${BASE}/book`);
    await settleNetwork(page);
    await chooseAnyServiceOnStepOne(page);
    await pickTimeOnStepOne(page);
    const times = page.getByRole("radiogroup", { name: /^(Time|Available times)$/ });
    await expect(times.getByRole("radio", { checked: true })).toHaveCount(1);
    const pickedBefore = await times.getByRole("radio", { checked: true }).innerText();

    await page.getByRole("button", { name: /Continue to your details/ }).click();
    const name = page.getByLabel("Your name");
    await expect(name).toBeVisible();
    await name.fill("Back Button Tester");

    await page.goBack();
    // Still on /book, on step 1, with the same time chosen.
    await expect(page).toHaveURL(/\/book/);
    await expect(page.getByRole("button", { name: /Continue to your details/ })).toBeVisible();
    await expect(times.getByRole("radio", { checked: true })).toHaveCount(1);
    expect(await times.getByRole("radio", { checked: true }).innerText()).toBe(pickedBefore);

    await page.goForward();
    await expect(page.getByLabel("Your name")).toHaveValue("Back Button Tester");
  });
});
