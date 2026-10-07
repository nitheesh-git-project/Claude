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
 * Every session and every person carries a timestamped history built from
 * what the platform records (src/lib/activityTimeline.ts): the session
 * drawer's "Session history", and the "Activity log" on a patient's,
 * therapist's or hospital's profile, with filters.
 */
test.describe("activity timelines", () => {
  test("TL-001 a session's history names the booking, the payment and the assignment, and a patient's log filters", async ({
    page,
    context,
  }) => {
    test.setTimeout(240_000);
    const admin = adminClient();
    const patientId = await profileIdFor(admin, QA_EMAILS.patientA);
    const therapistId = await profileIdFor(admin, QA_EMAILS.therapistB);
    const cookie = await cookieHeaderFor(QA_EMAILS.admin);
    const slot = clinicSlot(50 + Math.floor(Math.random() * 30), 6 + Math.floor(Math.random() * 17));
    const { data: appt } = await admin
      .from("appointments")
      .insert({
        patient_id: patientId,
        concern: "QA timeline",
        slot_time: slot,
        status: "requested",
        payment_status: "paid",
        paid_at: new Date().toISOString(),
        amount_paid_paise: 150_000,
        visit_mode: "online",
        duration_minutes: 60,
      })
      .select("id, session_code")
      .single();
    const close = await openTherapistHour(admin, therapistId, slot);
    try {
      const assigned = await fetch(`${BASE}/api/admin/assign-appointment`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify({ appointmentId: appt!.id, therapistId }),
      });
      expect(assigned.status, await assigned.text()).toBe(200);

      const res = await fetch(`${BASE}/api/admin/timeline`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify({ sessionId: appt!.id }),
      });
      expect(res.status).toBe(200);
      const { events } = (await res.json()) as { events: { title: string; actorRole: string; category: string }[] };
      const titles = events.map((e) => e.title);
      expect(titles).toContain("Session booked");
      expect(titles).toContain("Payment received");
      expect(titles.some((t) => t.startsWith("Assigned to"))).toBe(true);
      expect(events.find((e) => e.title.startsWith("Assigned to"))?.actorRole).toBe("admin");

      // A person's log needs the People scope; a session's the Sessions one.
      const person = await fetch(`${BASE}/api/admin/timeline`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify({ personId: patientId }),
      });
      expect(person.status).toBe(200);
      const personEvents = (await person.json()).events as { sessionCode?: string; title: string }[];
      expect(personEvents.some((e) => e.sessionCode === appt!.session_code && e.title === "Session booked")).toBe(true);

      // On the patient's profile, with a filter applied.
      await context.addCookies(await browserCookiesFor(QA_EMAILS.admin));
      await page.goto(`${BASE}/admin/dashboard/patients/${patientId}`, { waitUntil: "domcontentloaded" });
      const log = page.getByRole("region", { name: "Activity log" }).filter({ visible: true }).first();
      // The newest entries are this session's; a Payments filter keeps its
      // payment and drops its booking line.
      const booked = log.getByRole("listitem").filter({ hasText: appt!.session_code as string }).filter({ hasText: "Session booked" });
      const paid = log.getByRole("listitem").filter({ hasText: appt!.session_code as string }).filter({ hasText: "Payment received" });
      await expect(booked.first()).toBeVisible({ timeout: 90_000 });
      await log.getByRole("button", { name: "Payments" }).click();
      await expect(log.getByRole("button", { name: "Payments" })).toHaveAttribute("aria-pressed", "true");
      await expect(paid.first()).toBeVisible();
      await expect(booked).toHaveCount(0);
      await log.getByRole("button", { name: "Clear filters" }).click();
      await expect(booked.first()).toBeVisible();
      await log.screenshot({ path: "e2e/screenshots/activity/patient-log.png" });
    } finally {
      await close();
      await admin.from("appointment_reassignment_log").delete().eq("appointment_id", appt!.id);
      await admin.from("appointments").delete().eq("id", appt!.id);
    }
  });

  test("TL-002 a malformed request is a 400 and asks for exactly one id", async () => {
    const cookie = await cookieHeaderFor(QA_EMAILS.admin);
    const res = await fetch(`${BASE}/api/admin/timeline`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });
});
