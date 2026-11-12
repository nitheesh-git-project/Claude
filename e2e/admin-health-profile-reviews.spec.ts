// Today -> Health Profile reviews: the rows behind the Today counts.
//
// "Care intake submissions" and "Therapist access requests" used to be counts
// that linked to the patients directory, which listed everybody and not the
// ones counted. They are rows now -- who, for whom, how long -- with Approve
// and Decline on the row, and a confirmation in the two people's names before
// access is granted or removed. Rules: docs/rules/admin.md.
//
// Disposable project only: it clears and re-creates the open access request
// for the QA patient (one open request per patient is a unique index).
import { test, expect } from "@playwright/test";
import { BASE, QA_EMAILS, adminClient, browserCookiesFor, profileIdFor } from "./helpers";

test.describe("Health Profile reviews", () => {
  test("HPR-001: a therapist's access request is a row with the names, and Approve asks first", async ({
    browser,
  }) => {
    test.setTimeout(180_000);
    const admin = adminClient();
    const patientId = await profileIdFor(admin, QA_EMAILS.patientA);
    const therapistId = await profileIdFor(admin, QA_EMAILS.therapistA);

    await admin
      .from("condition_access_grants")
      .delete()
      .eq("patient_id", patientId)
      .in("status", ["requested", "approved"]);
    const { data: grant, error } = await admin
      .from("condition_access_grants")
      .insert({ patient_id: patientId, therapist_id: therapistId, status: "requested" })
      .select("id")
      .single();
    expect(error, error?.message).toBeNull();

    const { data: names } = await admin
      .from("profiles")
      .select("id, full_name")
      .in("id", [patientId, therapistId]);
    const patientName = names?.find((n) => n.id === patientId)?.full_name ?? "";
    const therapistName = names?.find((n) => n.id === therapistId)?.full_name ?? "";

    const context = await browser.newContext();
    try {
      await context.addCookies(await browserCookiesFor(QA_EMAILS.admin));
      const page = await context.newPage();
      await page.goto(`${BASE}/admin/dashboard?section=today&tab=health-reviews`);

      const screen = page.getByTestId("health-profile-reviews").filter({ visible: true });
      const row = screen.getByTestId("health-review-access").filter({ hasText: therapistName });
      await expect(row.first()).toBeVisible({ timeout: 90_000 });
      await expect(row.first()).toContainText(`${patientName}'s Health Profile`);
      await expect(row.first()).toContainText(/Waiting since today|Waiting \d+ days?/);

      // Approve asks, in both names, and "Not yet" leaves the request open.
      await row.first().getByRole("button", { name: "Approve" }).click();
      const dialog = page.getByRole("alertdialog");
      await expect(dialog).toContainText(`Let ${therapistName} edit ${patientName}'s Health Profile?`);
      await dialog.getByRole("button", { name: "Not yet" }).click();
      const { data: stillOpen } = await admin
        .from("condition_access_grants")
        .select("status")
        .eq("id", grant!.id)
        .single();
      expect(stillOpen?.status).toBe("requested");

      // Declining records it and the toast names both people.
      await row.first().getByRole("button", { name: "Decline" }).click();
      await expect(page.getByText(`Declined ${therapistName}'s request`)).toBeVisible({ timeout: 30_000 });
      await expect
        .poll(async () => {
          const { data } = await admin
            .from("condition_access_grants")
            .select("status")
            .eq("id", grant!.id)
            .single();
          return data?.status;
        })
        .toBe("declined");
    } finally {
      await admin.from("condition_access_grants").delete().eq("id", grant!.id);
      await context.close();
    }
  });

  test("HPR-002: removing a therapist's access asks, and says their notes stay", async ({ browser }) => {
    test.setTimeout(180_000);
    const admin = adminClient();
    const patientId = await profileIdFor(admin, QA_EMAILS.patientA);
    const therapistId = await profileIdFor(admin, QA_EMAILS.therapistA);

    await admin
      .from("condition_access_grants")
      .delete()
      .eq("patient_id", patientId)
      .in("status", ["requested", "approved"]);
    const { data: grant, error } = await admin
      .from("condition_access_grants")
      .insert({ patient_id: patientId, therapist_id: therapistId, status: "approved" })
      .select("id")
      .single();
    expect(error, error?.message).toBeNull();
    const { data: names } = await admin.from("profiles").select("id, full_name").in("id", [therapistId]);
    const therapistName = names?.[0]?.full_name ?? "";

    const context = await browser.newContext();
    try {
      await context.addCookies(await browserCookiesFor(QA_EMAILS.admin));
      const page = await context.newPage();
      await page.goto(`${BASE}/admin/dashboard/conditions/${patientId}`);

      const access = page.getByTestId("health-profile-therapist-access").filter({ visible: true });
      await expect(access).toContainText(therapistName, { timeout: 90_000 });
      await access.getByRole("button", { name: "Remove access" }).click();
      const dialog = page.getByRole("alertdialog");
      await expect(dialog).toContainText("They stop seeing it immediately; their notes stay.");
      await dialog.getByRole("button", { name: "Keep access" }).click();
      const { data: still } = await admin
        .from("condition_access_grants")
        .select("status")
        .eq("id", grant!.id)
        .single();
      expect(still?.status).toBe("approved");
    } finally {
      await admin.from("condition_access_grants").delete().eq("id", grant!.id);
      await context.close();
    }
  });

  test("HPR-003: the Health Profile record opens on a summary and folds the answers away", async ({
    browser,
  }) => {
    test.setTimeout(180_000);
    const admin = adminClient();
    const patientId = await profileIdFor(admin, QA_EMAILS.patientA);
    const context = await browser.newContext();
    try {
      await context.addCookies(await browserCookiesFor(QA_EMAILS.admin));
      const page = await context.newPage();
      await page.goto(`${BASE}/admin/dashboard/conditions/${patientId}`);

      const summary = page.getByTestId("health-profile-summary").filter({ visible: true });
      await expect(summary).toBeVisible({ timeout: 90_000 });
      await expect(page.getByTestId("health-profile-pending-line").filter({ visible: true })).toBeVisible();

      // The intake answers are folded: nothing editable until asked for.
      const answers = page.getByTestId("health-profile-intake-answers").filter({ visible: true });
      await expect(answers).toContainText("Intake answers");
      await expect(answers.getByRole("button", { name: "Edit answers" })).not.toBeVisible();
      await answers.getByText("Intake answers").click();
      await expect(answers.getByRole("button", { name: "Edit answers" })).toBeVisible();
    } finally {
      await context.close();
    }
  });
});
