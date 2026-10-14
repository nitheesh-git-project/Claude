import { test, expect } from "@playwright/test";
import {
  BASE,
  QA_EMAILS,
  adminClient,
  browserCookiesFor,
  clinicSlot,
  cookieHeaderFor,
  openTherapistHour,
  profileIdFor,
} from "./helpers";

/**
 * An admin cannot put a therapist on a session they are not available for:
 * not working that hour, on leave, or already booked. The route answers 409
 * with every reason, which the "Unable to assign this therapist" dialog
 * lists. See src/lib/therapistAssignability.ts.
 */
test.describe("assigning only an available therapist", () => {
  test("AV-001 an hour they don't work is refused with the reason; opening it lets the assignment through", async () => {
    test.setTimeout(120_000);
    const admin = adminClient();
    const patientId = await profileIdFor(admin, QA_EMAILS.patientA);
    const therapistId = await profileIdFor(admin, QA_EMAILS.therapistB);
    const cookie = await cookieHeaderFor(QA_EMAILS.admin);
    const slot = clinicSlot(45 + Math.floor(Math.random() * 40), 6 + Math.floor(Math.random() * 17));

    // An exception marking the hour off wins over any weekly schedule.
    const ist = new Date(new Date(slot).getTime() + 5.5 * 3_600_000);
    const date = ist.toISOString().slice(0, 10);
    const hour = ist.getUTCHours();
    await admin
      .from("therapist_availability_override")
      .upsert({ therapist_id: therapistId, date, hour, available: false, note: "e2e" }, { onConflict: "therapist_id,date,hour" });

    const { data: appointment } = await admin
      .from("appointments")
      .insert({
        patient_id: patientId,
        concern: "QA availability guard",
        slot_time: slot,
        status: "requested",
        payment_status: "paid",
        amount_paid_paise: 100_000,
        visit_mode: "online",
        duration_minutes: 60,
      })
      .select("id")
      .single();

    const assign = () =>
      fetch(`${BASE}/api/admin/assign-appointment`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify({ appointmentId: appointment!.id, therapistId }),
      });

    try {
      const refused = await assign();
      expect(refused.status).toBe(409);
      const body = await refused.json();
      expect(body.code).toBe("therapist_unavailable");
      // "no_schedule" when the fixture has no weekly hours at all, else
      // "not_working_that_hour" from the exception above -- both say why.
      const codes = body.reasons.map((r: { code: string }) => r.code);
      expect(codes.some((c: string) => c === "not_working_that_hour" || c === "no_schedule"), codes.join()).toBe(true);
      const { data: still } = await admin.from("appointments").select("therapist_id").eq("id", appointment!.id).single();
      expect(still?.therapist_id).toBeNull();

      // Open the hour on the roster and the same request goes through.
      const close = await openTherapistHour(admin, therapistId, slot);
      try {
        const ok = await assign();
        expect(ok.status, await ok.text()).toBe(200);
      } finally {
        await close();
      }
    } finally {
      await admin.from("appointments").delete().eq("id", appointment!.id);
      await admin
        .from("therapist_availability_override")
        .delete()
        .eq("therapist_id", therapistId)
        .eq("date", date)
        .eq("hour", hour)
        .eq("note", "e2e");
    }
  });
  test("AV-002 'Open the roster' closes the dialog and the drawer and lands on that therapist's hours", async ({ browser }) => {
    test.setTimeout(120_000);
    const admin = adminClient();
    const patientId = await profileIdFor(admin, QA_EMAILS.patientA);
    const therapistId = await profileIdFor(admin, QA_EMAILS.therapistB);
    const { data: therapist } = await admin.from("profiles").select("full_name").eq("id", therapistId).single();
    const slot = clinicSlot(45 + Math.floor(Math.random() * 40), 6 + Math.floor(Math.random() * 17));
    const ist = new Date(new Date(slot).getTime() + 5.5 * 3_600_000);
    const date = ist.toISOString().slice(0, 10);
    const hour = ist.getUTCHours();
    await admin
      .from("therapist_availability_override")
      .upsert({ therapist_id: therapistId, date, hour, available: false, note: "e2e" }, { onConflict: "therapist_id,date,hour" });
    const { data: appointment } = await admin
      .from("appointments")
      .insert({
        patient_id: patientId,
        concern: "QA roster link",
        slot_time: slot,
        status: "requested",
        payment_status: "paid",
        amount_paid_paise: 100_000,
        visit_mode: "online",
        duration_minutes: 60,
      })
      .select("id, session_code")
      .single();

    const ctx = await browser.newContext();
    try {
      await ctx.addCookies(await browserCookiesFor(QA_EMAILS.admin));
      const page = await ctx.newPage();
      await page.goto(`${BASE}/admin/dashboard?section=sessions&tab=all`, { waitUntil: "domcontentloaded" });
      await page.getByPlaceholder("Session ID", { exact: true }).fill(appointment!.session_code!);
      const row = page.getByRole("row").filter({ hasText: appointment!.session_code! });
      await row.first().waitFor({ timeout: 60_000 });
      await row.first().click();
      const drawer = page.getByRole("dialog").filter({ has: page.getByLabel("Therapist to assign") });
      // The drawer names the day, not only the time.
      const day = new Intl.DateTimeFormat("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "Asia/Kolkata",
      }).format(new Date(slot));
      await expect(drawer.getByText(day)).toBeVisible();
      await drawer.getByLabel("Therapist to assign").selectOption(therapistId);
      await drawer.getByRole("button", { name: "Assign & Confirm" }).click();
      const unavailable = page.getByRole("alertdialog", { name: "Unable to assign this therapist" });
      await expect(unavailable).toBeVisible({ timeout: 30_000 });

      await unavailable.getByRole("link", { name: "Open the roster" }).click();
      // Both overlays go at once, and the roster is the screen showing,
      // opened on the therapist who could not be assigned.
      await expect(unavailable).toBeHidden();
      await expect(drawer).toBeHidden();
      await expect(page).toHaveURL(/tab=roster/);
      await expect(page.getByLabel(`${therapist!.full_name} - roster`)).toBeVisible();
    } finally {
      await ctx.close();
      await admin.from("appointments").delete().eq("id", appointment!.id);
      await admin
        .from("therapist_availability_override")
        .delete()
        .eq("therapist_id", therapistId)
        .eq("date", date)
        .eq("hour", hour)
        .eq("note", "e2e");
    }
  });
});
