// Trusted-patient codes: an admin pre-approves pay later for one named
// person; that person redeems it once from their own account. Money, so the
// refusals matter as much as the success. Pay later is switched on for the
// file and put back; the fixture accounts are deleted (a spent code stays --
// it is append-only by design, and only its account link clears).
import { test, expect } from "@playwright/test";
import {
  BASE,
  QA_EMAILS,
  adminClient,
  browserCookiesFor,
  cookieHeaderFor,
  createFixtureAccount,
  profileIdFor,
  setQaAdminScope,
} from "./helpers";

async function post(path: string, body: object, email: string) {
  return fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: await cookieHeaderFor(email) },
    body: JSON.stringify(body),
  });
}

test.describe("trusted-patient codes", () => {
  test.setTimeout(180_000);
  let payLaterWasOn = false;
  test.beforeAll(async () => {
    const { data } = await adminClient().from("site_settings").select("pay_later_enabled").limit(1).single();
    payLaterWasOn = data?.pay_later_enabled === true;
    await adminClient().from("site_settings").update({ pay_later_enabled: true }).not("id", "is", null);
  });
  test.afterAll(async () => {
    await adminClient().from("site_settings").update({ pay_later_enabled: payLaterWasOn }).not("id", "is", null);
  });

  test("TC-001: an admin creates one from Money -> Costs and it is listed as waiting", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.addCookies(await browserCookiesFor(QA_EMAILS.admin));
    const page = await ctx.newPage();
    await page.goto(`${BASE}/admin/dashboard?section=money&tab=costs`);
    const card = page.getByTestId("trusted-codes");
    await card.getByRole("button", { name: "Tap here to create a trusted-patient code" }).click({ timeout: 60_000 });
    const form = page.getByTestId("trusted-code-form");
    await form.getByLabel(/Patient's name/).fill("E2E Trusted Ui");
    await form.getByLabel(/Why are they trusted/).fill("short");
    await form.getByLabel("Email", { exact: true }).fill("e2e.trusted.ui@example.test");
    await form.getByRole("button", { name: "Create the code" }).click();
    await expect(form.getByRole("alert")).toContainText("at least 10 characters");
    await form.getByLabel(/Why are they trusted/).fill("Long-standing family patient, settles monthly");
    await form.getByLabel(/Note/).fill("Agreed by phone");
    await form.getByRole("button", { name: "Create the code" }).click();
    const made = page.getByTestId("trusted-code-made");
    await expect(made).toBeVisible({ timeout: 30_000 });
    const code = ((await made.locator("p.font-mono").textContent()) ?? "").trim();
    expect(code).toMatch(/^TRUST-[A-Z0-9]{6}$/);
    await made.getByRole("button", { name: "Done" }).click();
    const row = card.getByTestId("trusted-code-row").filter({ hasText: code });
    await expect(row).toContainText("Waiting to be used");
    await expect(row).toContainText("Long-standing family patient");
    // Cancel it so it cannot be used.
    await row.getByRole("button", { name: "Cancel code" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Cancel the code" }).click();
    await expect(card.getByTestId("trusted-code-row").filter({ hasText: code })).toContainText("Cancelled", { timeout: 30_000 });
    await ctx.close();
  });

  test("TC-002: only the named account redeems it, once, and it grants pay later with the reason", async () => {
    const db = adminClient();
    const right = await createFixtureAccount("trusted right");
    const wrong = await createFixtureAccount("trusted wrong");
    try {
      const create = await post(
        "/api/admin/trusted-codes/create",
        { patientName: "E2E Trusted Right", reason: "Known to the clinic for years", email: right.email },
        QA_EMAILS.admin
      );
      expect(create.status).toBe(200);
      const { id, code } = await create.json();

      // Another account, a mistyped code: the same answer, nothing changes.
      const notYours = await post("/api/patient/redeem-trusted-code", { code }, wrong.email);
      expect(notYours.status).toBe(400);
      expect((await post("/api/patient/redeem-trusted-code", { code: "TRUST-ZZZZZZ" }, right.email)).status).toBe(400);

      const ok = await post("/api/patient/redeem-trusted-code", { code: code.toLowerCase() }, right.email);
      expect(ok.status, await ok.clone().text()).toBe(200);
      const { data: profile } = await db
        .from("profiles")
        .select("pay_later_enabled, pay_later_reason, pay_later_code_id, pay_later_granted_by")
        .eq("id", right.id)
        .single();
      expect(profile?.pay_later_enabled).toBe(true);
      expect(profile?.pay_later_reason).toContain("Known to the clinic for years");
      expect(profile?.pay_later_code_id).toBe(id);
      expect(profile?.pay_later_granted_by).toBe(await profileIdFor(db, QA_EMAILS.admin));

      const { data: row } = await db.from("trusted_patient_codes").select("status, redeemed_by").eq("id", id).single();
      expect(row).toEqual({ status: "redeemed", redeemed_by: right.id });

      // Once: spent for everyone, and it cannot be cancelled or rewritten now.
      expect((await post("/api/patient/redeem-trusted-code", { code }, wrong.email)).status).toBe(400);
      expect((await post("/api/admin/trusted-codes/revoke", { id }, QA_EMAILS.admin)).status).toBe(409);
      const { error: rewrite } = await db.from("trusted_patient_codes").update({ reason: "changed later" }).eq("id", id);
      expect(rewrite?.message ?? "").toContain("append-only");
      const { error: removed } = await db.from("trusted_patient_codes").delete().eq("id", id);
      expect(removed?.message ?? "").toContain("append-only");
    } finally {
      await db.from("profiles").update({ pay_later_enabled: false, pay_later_code_id: null }).in("id", [right.id, wrong.id]);
      await db.auth.admin.deleteUser(right.id).catch(() => {});
      await db.auth.admin.deleteUser(wrong.id).catch(() => {});
    }
  });

  test("TC-003: only a money admin creates one; a patient and a clinical admin are refused", async () => {
    const db = adminClient();
    const body = { patientName: "E2E Nobody", reason: "Should never be created", email: "nobody@example.test" };
    expect((await post("/api/admin/trusted-codes/create", body, QA_EMAILS.patientA)).status).toBe(403);
    const adminId = await profileIdFor(db, QA_EMAILS.admin);
    await setQaAdminScope(db, adminId, "clinical");
    try {
      expect((await post("/api/admin/trusted-codes/create", body, QA_EMAILS.admin)).status).toBe(403);
    } finally {
      await setQaAdminScope(db, adminId, "full");
    }
    const { count } = await db.from("trusted_patient_codes").select("id", { count: "exact", head: true }).eq("patient_name", "E2E Nobody");
    expect(count).toBe(0);
  });
});
