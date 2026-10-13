// Approving a therapist asks for their revenue share in the same step.
//
// Approve used to be one tap, so the share -- what their pay is worked out
// from -- was a second visit to the profile that was easy to forget. The
// dialog now collects it, and the route writes it in the same update as
// `approved`. Rules: src/lib/therapistApproval.ts.
import { test, expect } from "@playwright/test";
import { BASE, QA_EMAILS, adminClient, browserCookiesFor, cookieHeaderFor, TEST_PASSWORD } from "./helpers";

async function createPendingTherapist(name: string) {
  const admin = adminClient();
  const { data: created, error } = await admin.auth.admin.createUser({
    email: `qa.approve.${Date.now()}@example.test`,
    password: TEST_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: name },
  });
  expect(error, error?.message).toBeNull();
  const id = created!.user!.id;
  await admin
    .from("profiles")
    .update({
      role: "therapist",
      approved: false,
      active: true,
      full_name: name,
      credentials: "MPT (Ortho)",
      revenue_share_percent: null,
      home_visit_revenue_share_percent: null,
    })
    .eq("id", id);
  return { admin, id };
}

test.describe("Approving a therapist", () => {
  test("AT-001: the dialog requires the revenue share and saves it with the approval", async ({ browser }) => {
    test.setTimeout(120_000);
    const name = `QA Approve Therapist ${Date.now()}`;
    const { admin, id } = await createPendingTherapist(name);
    const context = await browser.newContext();
    await context.addCookies(await browserCookiesFor(QA_EMAILS.admin));
    const page = await context.newPage();

    try {
      await page.goto(`${BASE}/admin/dashboard?section=today&tab=approvals`);
      const row = page.locator("li", { hasText: name }).filter({ visible: true }).first();
      await expect(row).toBeVisible({ timeout: 60_000 });
      await row.getByRole("button", { name: "Approve" }).click();

      const dialog = page.getByRole("dialog", { name: `Approve ${name}` });
      await expect(dialog).toBeVisible();
      await expect(dialog).toContainText("MPT (Ortho)");

      // No share: refused in place, nothing written.
      await dialog.getByRole("button", { name: "Approve therapist" }).click();
      await expect(dialog.getByRole("alert")).toContainText("revenue share");
      const { data: stillPending } = await admin.from("profiles").select("approved").eq("id", id).single();
      expect(stillPending?.approved).toBe(false);

      await dialog.getByLabel(/Therapist's share/).fill("60");
      await expect(dialog).toContainText("Clinic keeps 40%");
      await dialog.getByLabel(/Show on the Our Team page/).uncheck();
      await dialog.getByLabel(/Internal note/).fill("Licence verified");
      await dialog.getByRole("button", { name: "Approve therapist" }).click();

      await expect(page.getByTestId("approve-therapist-done")).toContainText(`${name} is approved`);
      await expect(page.getByTestId("approve-therapist-done")).toContainText("working hours");

      const { data: profile } = await admin
        .from("profiles")
        .select("approved, revenue_share_percent, home_visit_revenue_share_percent, visible_on_team")
        .eq("id", id)
        .single();
      expect(profile).toMatchObject({
        approved: true,
        revenue_share_percent: 60,
        home_visit_revenue_share_percent: null,
        visible_on_team: false,
      });

      await page.getByRole("button", { name: "Done" }).click();
      await expect(page.locator("li", { hasText: name }).filter({ visible: true })).toHaveCount(0, {
        timeout: 30_000,
      });
    } finally {
      await context.close();
      await admin.auth.admin.deleteUser(id);
    }
  });

  test("AT-002: the route refuses a therapist approval without a share from a money-scoped admin", async () => {
    const { admin, id } = await createPendingTherapist(`QA Approve API ${Date.now()}`);
    try {
      const cookie = await cookieHeaderFor(QA_EMAILS.admin);
      const res = await fetch(`${BASE}/api/admin/approve-account`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify({ userId: id }),
      });
      expect(res.status).toBe(400);
      expect((await res.json()).code).toBe("revenue_share_required");
      const { data } = await admin.from("profiles").select("approved").eq("id", id).single();
      expect(data?.approved).toBe(false);
    } finally {
      await admin.auth.admin.deleteUser(id);
    }
  });
});
