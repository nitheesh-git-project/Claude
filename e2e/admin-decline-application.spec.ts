// Declining an application asks why, and the decline is listed afterwards.
//
// Decline used to be a bare confirm: a signup's account was deleted and a
// hospital inquiry's status flipped, and nothing said why or kept the person
// anywhere. Now the dialog requires a reason, the route records the
// applicant in declined_applications in the same statement, People ->
// Declined lists them, and a returning applicant is flagged in Approvals.
// Rules: src/lib/declineReasons.ts.
import { test, expect } from "@playwright/test";
import { BASE, QA_EMAILS, adminClient, browserCookiesFor, cookieHeaderFor, TEST_PASSWORD } from "./helpers";

async function createPendingPatient(name: string, email: string) {
  const admin = adminClient();
  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: name },
  });
  expect(error, error?.message).toBeNull();
  const id = created!.user!.id;
  await admin
    .from("profiles")
    .update({ role: "patient", approved: false, active: true, full_name: name })
    .eq("id", id);
  return id;
}

test.describe("Declining an application", () => {
  test("DA-001: a declined signup needs a reason, is listed on People -> Declined, and is flagged when they return", async ({
    browser,
  }) => {
    test.setTimeout(180_000);
    const admin = adminClient();
    const stamp = Date.now();
    const name = `QA Decline Patient ${stamp}`;
    const email = `qa.decline.${stamp}@example.test`;
    const firstId = await createPendingPatient(name, email);
    let secondId: string | null = null;
    const context = await browser.newContext();
    await context.addCookies(await browserCookiesFor(QA_EMAILS.admin));
    const page = await context.newPage();

    try {
      await page.goto(`${BASE}/admin/dashboard?section=today&tab=approvals`);
      const row = page.locator("li", { hasText: name }).filter({ visible: true }).first();
      await expect(row).toBeVisible({ timeout: 60_000 });
      await row.getByRole("button", { name: "Decline" }).click();

      const dialog = page.getByRole("dialog", { name: `Decline ${name}` });
      await expect(dialog).toBeVisible();

      // No reason: refused in place, the account is untouched.
      await dialog.getByRole("button", { name: "Decline", exact: true }).click();
      await expect(dialog.getByRole("alert")).toContainText("Pick a reason");

      // "Other" without enough words: refused too.
      await dialog.getByRole("button", { name: "Other" }).click();
      await dialog.getByLabel(/What happened/).fill("spam");
      await dialog.getByRole("button", { name: "Decline", exact: true }).click();
      await expect(dialog.getByRole("alert")).toContainText("at least 10 characters");
      const { data: stillThere } = await admin.from("profiles").select("id").eq("id", firstId).maybeSingle();
      expect(stillThere).toBeTruthy();

      await dialog.getByRole("button", { name: "Incomplete details" }).click();
      await dialog.getByLabel(/Note/).fill("No address or phone given");
      await dialog.getByRole("button", { name: "Decline", exact: true }).click();
      await expect(dialog).toBeHidden({ timeout: 30_000 });
      await expect(page.locator("li", { hasText: name }).filter({ visible: true })).toHaveCount(0, {
        timeout: 30_000,
      });

      // The account is gone, and the record of it is not.
      const { data: gone } = await admin.from("profiles").select("id").eq("id", firstId).maybeSingle();
      expect(gone).toBeNull();
      const { data: record } = await admin
        .from("declined_applications")
        .select("kind, email, full_name, reason_code, reason_note, declined_by")
        .eq("source_id", firstId)
        .single();
      expect(record).toMatchObject({
        kind: "patient",
        email,
        full_name: name,
        reason_code: "incomplete_details",
        reason_note: "No address or phone given",
      });
      expect(record?.declined_by).toBeTruthy();

      await page.goto(`${BASE}/admin/dashboard?section=people&tab=declined`);
      const card = page.getByTestId("declined-application").filter({ hasText: name }).first();
      await expect(card).toBeVisible({ timeout: 60_000 });
      await expect(card).toContainText("Incomplete details");
      await expect(card).toContainText("No address or phone given");
      await expect(card).toContainText(email);

      // They sign up again with the same email: Approvals says so.
      secondId = await createPendingPatient(name, email);
      await page.goto(`${BASE}/admin/dashboard?section=today&tab=approvals`);
      const again = page.locator("li", { hasText: name }).filter({ visible: true }).first();
      await expect(again).toBeVisible({ timeout: 60_000 });
      await expect(again.getByTestId("prior-decline")).toContainText("Declined before");
      await expect(again.getByTestId("prior-decline")).toContainText("Incomplete details");
    } finally {
      await context.close();
      if (secondId) await admin.auth.admin.deleteUser(secondId).catch(() => {});
      await admin.auth.admin.deleteUser(firstId).catch(() => {});
      await admin.from("declined_applications").delete().eq("source_id", firstId);
    }
  });

  test("DA-002: declining a hospital inquiry asks why and lists it under Hospitals", async ({ browser }) => {
    test.setTimeout(120_000);
    const admin = adminClient();
    const name = `QA Decline Hospital ${Date.now()}`;
    const { data: lead, error } = await admin
      .from("b2b_leads")
      .insert({ name, phone: "+91 90000 11111", source: "Other", org_details: "QA decline fixture" })
      .select("id")
      .single();
    expect(error, error?.message).toBeNull();
    const context = await browser.newContext();
    await context.addCookies(await browserCookiesFor(QA_EMAILS.admin));
    const page = await context.newPage();

    try {
      await page.goto(`${BASE}/admin/dashboard?section=people&tab=partners`);
      const row = page.locator("li", { hasText: name }).filter({ visible: true }).first();
      await expect(row).toBeVisible({ timeout: 60_000 });
      await row.getByRole("button", { name: "Decline" }).click();

      const dialog = page.getByRole("dialog", { name: `Decline ${name}` });
      await dialog.getByRole("button", { name: "Outside our service area" }).click();
      await dialog.getByRole("button", { name: "Decline", exact: true }).click();
      await expect(dialog).toBeHidden({ timeout: 30_000 });
      await expect(row).toContainText("Outside our service area", { timeout: 30_000 });

      const { data: after } = await admin.from("b2b_leads").select("status").eq("id", lead!.id).single();
      expect(after?.status).toBe("declined");

      await page.goto(`${BASE}/admin/dashboard?section=people&tab=declined`);
      const card = page.getByTestId("declined-application").filter({ hasText: name }).first();
      await expect(card).toBeVisible({ timeout: 60_000 });
      await expect(card).toContainText("Hospital");
      await expect(card).toContainText("Outside our service area");
    } finally {
      await context.close();
      await admin.from("declined_applications").delete().eq("source_id", lead!.id);
      await admin.from("b2b_leads").delete().eq("id", lead!.id);
    }
  });

  test("DA-003: the route refuses a decline without a reason and leaves the account alone", async () => {
    const admin = adminClient();
    const id = await createPendingPatient(`QA Decline API ${Date.now()}`, `qa.decline.api.${Date.now()}@example.test`);
    try {
      const cookie = await cookieHeaderFor(QA_EMAILS.admin);
      const res = await fetch(`${BASE}/api/admin/decline-account`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify({ userId: id }),
      });
      expect(res.status).toBe(400);
      expect((await res.json()).code).toBe("reason_required");
      const { data } = await admin.from("profiles").select("approved").eq("id", id).single();
      expect(data?.approved).toBe(false);
    } finally {
      await admin.auth.admin.deleteUser(id);
    }
  });
});
