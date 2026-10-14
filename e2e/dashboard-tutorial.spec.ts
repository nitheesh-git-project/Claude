// The first-visit dashboard tutorial, for all three roles that have one.
//
// It opens by itself over a first visit with dummy data, ends on Done (or a
// confirmed Skip) to reveal the real dashboard, records that it was seen,
// and stays shut afterwards; every page title's (i) replays just that
// page's chapter. Content: src/lib/tutorial.ts.
import { test, expect, type Page } from "@playwright/test";
import { BASE, QA_EMAILS, adminClient, browserCookiesFor } from "./helpers";

async function setSeen(email: string, seen: boolean) {
  const { error } = await adminClient()
    .from("profiles")
    .update({ onboarding_seen_at: seen ? new Date().toISOString() : null })
    .eq("email", email);
  expect(error, error?.message).toBeNull();
}

async function seenAt(email: string) {
  const { data } = await adminClient().from("profiles").select("onboarding_seen_at").eq("email", email).single();
  return data?.onboarding_seen_at ?? null;
}

async function openAs(browser: import("@playwright/test").Browser, email: string, path: string): Promise<Page> {
  const context = await browser.newContext();
  await context.addCookies(await browserCookiesFor(email));
  const page = await context.newPage();
  await page.goto(`${BASE}${path}`);
  return page;
}

test.describe("Dashboard tutorial", () => {
  test("TU-001: a patient's first visit plays the tour with dummy data, and Done shows the real dashboard", async ({ browser }) => {
    test.setTimeout(180_000);
    await setSeen(QA_EMAILS.patientA, false);
    const page = await openAs(browser, QA_EMAILS.patientA, "/patient/dashboard");
    try {
      const tour = page.getByRole("dialog", { name: "Welcome to your dashboard" });
      await expect(tour).toBeVisible({ timeout: 60_000 });
      await expect(tour).toContainText("dummy data");
      const next = page.getByTestId("tutorial").getByRole("button", { name: "Next" });

      // Next walks forward; the booking chapter explains the session states
      // in the screens' own words.
      await next.click();
      await next.click();
      await next.click();
      await expect(page.getByRole("heading", { name: "What happens after you pay" })).toBeVisible();
      await expect(page.getByTestId("tutorial")).toContainText("Waiting for a therapist");

      // A chapter chip jumps straight to the health profile.
      await page.getByRole("navigation", { name: "Tour chapters" }).getByRole("button", { name: "Health profile" }).click();
      await expect(page.getByRole("heading", { name: "Your therapist starts your health profile with you" })).toBeVisible();

      // Jump to the end and finish.
      await page.getByRole("navigation", { name: "Tour chapters" }).getByRole("button", { name: "You're ready" }).click();
      await next.click();
      await page.getByRole("button", { name: /Done - show my dashboard/ }).click();
      await expect(page.getByTestId("tutorial")).toHaveCount(0, { timeout: 10_000 });
      await expect.poll(() => seenAt(QA_EMAILS.patientA), { timeout: 10_000 }).not.toBeNull();

      // Seen: a reload does not bring it back.
      await page.reload();
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 60_000 });
      await page.waitForTimeout(1500);
      await expect(page.getByTestId("tutorial")).toHaveCount(0);
    } finally {
      await page.context().close();
      await setSeen(QA_EMAILS.patientA, true);
    }
  });

  test("TU-002: a therapist can skip after confirming, and a page title's (i) replays that page's chapter", async ({ browser }) => {
    test.setTimeout(180_000);
    await setSeen(QA_EMAILS.therapistA, false);
    const page = await openAs(browser, QA_EMAILS.therapistA, "/therapist/dashboard");
    try {
      await expect(page.getByRole("dialog", { name: "Welcome to your dashboard" })).toBeVisible({ timeout: 60_000 });
      await page.getByRole("button", { name: "Skip the tour" }).click();
      // Asked once, and "Keep going" keeps it.
      await page.getByRole("button", { name: "Keep going" }).click();
      await expect(page.getByTestId("tutorial")).toBeVisible();
      await page.getByRole("button", { name: "Skip the tour" }).click();
      await page.getByRole("button", { name: "Skip tour" }).click();
      await expect(page.getByTestId("tutorial")).toHaveCount(0, { timeout: 10_000 });
      await expect.poll(() => seenAt(QA_EMAILS.therapistA), { timeout: 10_000 }).not.toBeNull();

      await page.goto(`${BASE}/therapist/dashboard/availability`);
      await page.getByRole("button", { name: /How .* works/ }).first().click();
      const guide = page.getByTestId("tutorial");
      await expect(guide).toContainText("Quick guide");
      await expect(page.getByRole("heading", { name: "Set your weekly hours" })).toBeVisible();
      await page.getByRole("button", { name: "Got it" }).click();
      await expect(guide).toHaveCount(0, { timeout: 10_000 });
    } finally {
      await page.context().close();
      await setSeen(QA_EMAILS.therapistA, true);
    }
  });

  test("TU-003: a hospital's first visit opens its tour, and the referrals card explains each status", async ({ browser }) => {
    test.setTimeout(180_000);
    await setSeen(QA_EMAILS.hospital, false);
    const page = await openAs(browser, QA_EMAILS.hospital, "/hospital/dashboard/referrals");
    try {
      await expect(page.getByRole("dialog", { name: "Welcome to your partner dashboard" })).toBeVisible({ timeout: 60_000 });
      await page.getByRole("button", { name: "Skip the tour" }).click();
      await page.getByRole("button", { name: "Skip tour" }).click();
      await expect(page.getByTestId("tutorial")).toHaveCount(0, { timeout: 10_000 });

      // The card's own (i), not the page title's.
      await page.getByRole("button", { name: "How Your Referrals works" }).last().click();
      await expect(page.getByRole("heading", { name: "Follow each referral" })).toBeVisible();
      await expect(page.getByTestId("tutorial")).toContainText("Registration Link Sent");
    } finally {
      await page.context().close();
      await setSeen(QA_EMAILS.hospital, true);
    }
  });
});
