// A Master Admin changes a therapist's specialisation and a patient's
// condition type from their People profiles. Anyone else is refused, by the
// route as well as by the missing control. Every change is put back.
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

async function post(path: string, body: object, email = QA_EMAILS.admin) {
  return fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: await cookieHeaderFor(email) },
    body: JSON.stringify(body),
  });
}

test.describe("Master Admin type changes", () => {
  test.setTimeout(180_000);

  test("ATC-001: a therapist's specialisation changes from their profile, after a confirmation", async ({ browser }) => {
    const db = adminClient();
    const therapistId = await profileIdFor(db, QA_EMAILS.therapistB);
    const { data: before } = await db.from("profiles").select("specialization").eq("id", therapistId).single();
    const target = before?.specialization === "Sports" ? "Orthopaedic" : "Sports";
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    try {
      await ctx.addCookies(await browserCookiesFor(QA_EMAILS.admin));
      const page = await ctx.newPage();
      await page.goto(`${BASE}/admin/dashboard/therapists/${therapistId}`);
      await page.getByTestId("change-specialty").click({ timeout: 60_000 });
      await page.getByLabel("New specialisation").selectOption(target);
      await page.getByTestId("type-changer").getByRole("button", { name: "Save" }).click();
      await page.getByRole("alertdialog").getByRole("button", { name: "Keep as it is" }).click();
      const { data: still } = await db.from("profiles").select("specialization").eq("id", therapistId).single();
      expect(still?.specialization).toBe(before?.specialization ?? null);

      await page.getByTestId("type-changer").getByRole("button", { name: "Save" }).click();
      await page.getByRole("alertdialog").getByRole("button", { name: "Change it" }).click();
      await expect
        .poll(async () => (await db.from("profiles").select("specialization").eq("id", therapistId).single()).data?.specialization)
        .toBe(target);
      // Free text is refused; only the clinic's own list.
      expect((await post("/api/admin/set-therapist-specialty", { therapistId, specialty: "Wizardry" })).status).toBe(400);
    } finally {
      await ctx.close();
      await db.from("profiles").update({ specialization: before?.specialization ?? null }).eq("id", therapistId);
    }
  });

  test("ATC-002: a patient's condition type changes, keeps the answers, and is recorded", async () => {
    const db = adminClient();
    const fresh = await createFixtureAccount("condition type change");
    const onboarded = await createFixtureAccount("condition type onboarded");
    try {
      // Not onboarded: the therapist chooses the type first.
      expect(
        (await post("/api/admin/set-patient-condition-type", { patientId: fresh.id, specialty: "neuro" })).status
      ).toBe(409);

      await db.from("patient_condition_profiles").insert({
        patient_id: onboarded.id,
        specialty: "ortho",
        status: "active",
        data: { ortho_kept_answer: "kept" },
      });
      expect(
        (await post("/api/admin/set-patient-condition-type", { patientId: onboarded.id, specialty: "nonsense" })).status
      ).toBe(400);
      const res = await post("/api/admin/set-patient-condition-type", { patientId: onboarded.id, specialty: "neuro" });
      expect(res.status, await res.clone().text()).toBe(200);
      const { data: row } = await db
        .from("patient_condition_profiles")
        .select("specialty, data, last_submitted_role")
        .eq("patient_id", onboarded.id)
        .single();
      expect(row).toMatchObject({ specialty: "neuro", last_submitted_role: "admin" });
      expect((row?.data as Record<string, unknown>).ortho_kept_answer).toBe("kept");
      const { data: history } = await db
        .from("condition_change_requests")
        .select("status, submitted_by_role, proposed_specialty")
        .eq("patient_id", onboarded.id);
      expect(history).toEqual([{ status: "approved", submitted_by_role: "admin", proposed_specialty: "neuro" }]);
    } finally {
      await db.from("condition_change_requests").delete().in("patient_id", [fresh.id, onboarded.id]);
      await db.from("patient_condition_profiles").delete().in("patient_id", [fresh.id, onboarded.id]);
      await db.auth.admin.deleteUser(fresh.id).catch(() => {});
      await db.auth.admin.deleteUser(onboarded.id).catch(() => {});
    }
  });

  test("ATC-003: a scoped admin is refused both, and sees neither control", async ({ browser }) => {
    const db = adminClient();
    const adminId = await profileIdFor(db, QA_EMAILS.admin);
    const therapistId = await profileIdFor(db, QA_EMAILS.therapistB);
    const patientId = await profileIdFor(db, QA_EMAILS.patientA);
    await setQaAdminScope(db, adminId, "operations");
    try {
      expect((await post("/api/admin/set-therapist-specialty", { therapistId, specialty: "Sports" })).status).toBe(403);
      expect((await post("/api/admin/set-patient-condition-type", { patientId, specialty: "neuro" })).status).toBe(403);
      const ctx = await browser.newContext();
      await ctx.addCookies(await browserCookiesFor(QA_EMAILS.admin));
      const page = await ctx.newPage();
      await page.goto(`${BASE}/admin/dashboard/therapists/${therapistId}`);
      await expect(page.getByText(/Specialist in:/)).toBeVisible({ timeout: 60_000 });
      await expect(page.getByTestId("change-specialty")).toHaveCount(0);
      await ctx.close();
    } finally {
      await setQaAdminScope(db, adminId, "full");
    }
  });
});
