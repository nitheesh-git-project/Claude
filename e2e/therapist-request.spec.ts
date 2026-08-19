// Booking a specific specialist from their profile on /team.
//
// Browser-only: the whole feature is a query parameter surviving a
// navigation and turning into visible, honest copy in the wizard, none of
// which the API can see. The therapists come from global-setup's seeded QA
// accounts, which are approved, active and (by column default)
// visible_on_team, so they appear on the public page.
import { test, expect } from "@playwright/test";
import { adminClient, BASE, QA_EMAILS, profileIdFor } from "./helpers";

let therapistId = "";
let therapistName = "";

test.describe("Requesting a specialist from their profile", () => {
  test.beforeAll(async () => {
    const admin = adminClient();
    therapistId = await profileIdFor(admin, QA_EMAILS.therapistA);
    // Stated as a precondition rather than assumed: a therapist hidden from
    // the team page would fail these tests as "card not found", which says
    // nothing about the handoff being broken.
    await admin
      .from("profiles")
      .update({ approved: true, active: true, visible_on_team: true })
      .eq("id", therapistId);
    const { data } = await admin
      .from("profiles")
      .select("full_name")
      .eq("id", therapistId)
      .single();
    therapistName = data?.full_name ?? "";
    expect(therapistName, "seeded therapist name").not.toBe("");
  });

  test.beforeEach(async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1280, height: 1000 });
  });

  test("TR-001: the profile dialog's book button carries the therapist", async ({ page }) => {
    await page.goto(`${BASE}/team`);
    await page.getByText(therapistName, { exact: false }).first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.locator(`a[href="/book?therapist=${therapistId}"]`)).toBeVisible();
  });

  test("TR-002: the wizard names the requested therapist and can drop them", async ({ page }) => {
    await page.goto(`${BASE}/book?therapist=${therapistId}`);
    // The request is shown on the details step, beside the other optional
    // preferences, not on the calendar step.
    await page.getByRole("button", { name: /Continue/i }).first().click();
    await expect(page.getByText(`Requested: ${therapistName}`)).toBeVisible();

    await page.getByRole("button", { name: "Remove" }).click();
    await expect(page.getByText(`Requested: ${therapistName}`)).toHaveCount(0);
  });

  test("TR-003: a therapist who is not publicly bookable is dropped silently", async ({
    page,
  }) => {
    const admin = adminClient();
    await admin.from("profiles").update({ visible_on_team: false }).eq("id", therapistId);
    try {
      await page.goto(`${BASE}/book?therapist=${therapistId}`);
      await page.getByRole("button", { name: /Continue/i }).first().click();
      // No request, no error, no dead end -- an ordinary booking.
      await expect(page.getByText("Requested:")).toHaveCount(0);
      await expect(page.getByRole("button", { name: /Continue|Book/i }).first()).toBeVisible();
    } finally {
      await admin.from("profiles").update({ visible_on_team: true }).eq("id", therapistId);
    }
  });

  test("TR-004: an unknown therapist id is dropped silently", async ({ page }) => {
    await page.goto(`${BASE}/book?therapist=00000000-0000-4000-8000-000000000000`);
    await page.getByRole("button", { name: /Continue/i }).first().click();
    await expect(page.getByText("Requested:")).toHaveCount(0);
  });
});
