import "server-only";
import { after } from "next/server";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { deliverEmail } from "@/lib/emailServer";
import { getLayoutSettings } from "@/lib/siteSettingsCache";
import { parseAdminSettings } from "@/lib/adminSettings";
import { formatClinicDateTimeWithZone } from "@/lib/formatDateTime";
import {
  bookingCancelledEmail,
  bookingConfirmedEmail,
  bookingPaymentOf,
  bookingReceivedEmail,
  bookingReminderEmail,
  cancelRefundOf,
  cancellationIsWorthEmailing,
  sessionModeOf,
  type AppointmentEmailRow,
  type ReminderEvent,
} from "@/lib/bookingEmails";

// Sends the booking emails (bookingEmails.ts) for one appointment, ONCE each:
// received, confirmed, cancelled, and the two reminders (bookingReminders.ts).
//
// Once: the payment callback and Razorpay's webhook can both confirm the
// same booking, and both claims succeed (the claim accepts `confirmed`), so
// "the claim won" is not "this is the first time". The guard is a row in
// `appointment_emails` keyed on (appointment, event): the insert is the
// claim, and only the request whose insert lands sends. A skipped or failed
// send keeps its row -- switching emails back on later does not mail old
// bookings, and Settings -> Emails lists what happened.
//
// After the response: `after()` runs the work once the route has answered,
// so a slow mail provider never holds up a payment or a cancellation. Outside
// a request (a script, a test) it runs inline instead. Never throws.

export type AppointmentEmailEvent = "received" | "confirmed" | "cancelled" | ReminderEvent;

type AdminClient = ReturnType<typeof createAdminClient>;

export function queueAppointmentEmail(appointmentId: string, event: AppointmentEmailEvent, options: { byClinic?: boolean } = {}): void {
  const work = () => sendAppointmentEmailOnce(appointmentId, event, options).catch(() => undefined);
  try {
    after(work);
  } catch {
    void work();
  }
}

async function siteOrigin(): Promise<string> {
  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    if (host) {
      const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
      return `${proto}://${host}`;
    }
  } catch {
    // Not inside a request.
  }
  return "https://moverestorephysio.com";
}

async function claimOnce(admin: AdminClient, appointmentId: string, event: AppointmentEmailEvent): Promise<boolean> {
  const { data, error } = await admin
    .from("appointment_emails")
    .upsert({ appointment_id: appointmentId, event }, { onConflict: "appointment_id,event", ignoreDuplicates: true })
    .select("appointment_id");
  // A database without the table, or a failed write: send nothing rather
  // than risk sending twice.
  if (error) return false;
  return (data ?? []).length > 0;
}

export async function sendAppointmentEmailOnce(
  appointmentId: string,
  event: AppointmentEmailEvent,
  options: { byClinic?: boolean } = {}
): Promise<void> {
  const admin = createAdminClient();
  const { data: row, error } = await admin
    .from("appointments")
    .select(
      "id, patient_id, therapist_id, status, slot_time, duration_minutes, visit_mode, payment_status, payment_terms, amount_paid_paise, amount_due_paise, package_purchase_id, home_visit_purchase_id, refund_status, refund_amount_paise"
    )
    .eq("id", appointmentId)
    .maybeSingle();
  if (error || !row || !row.slot_time) return;
  const appointment = row as AppointmentEmailRow & {
    patient_id: string;
    therapist_id: string | null;
    slot_time: string;
    duration_minutes: number | null;
  };

  if (event === "cancelled" && !cancellationIsWorthEmailing(appointment)) return;
  // A confirmation or a reminder is only for a session that is (still)
  // confirmed: a reminder for one cancelled since would be wrong.
  if (event !== "received" && event !== "cancelled" && appointment.status !== "confirmed") return;
  if (!(await claimOnce(admin, appointmentId, event))) return;

  const ids = [appointment.patient_id, ...(appointment.therapist_id ? [appointment.therapist_id] : [])];
  const { data: people } = await admin.from("profiles").select("id, full_name, email").in("id", ids);
  const patient = (people ?? []).find((p) => p.id === appointment.patient_id);
  if (!patient?.email) return;
  const therapist = appointment.therapist_id ? (people ?? []).find((p) => p.id === appointment.therapist_id) : null;

  const { brand } = await getLayoutSettings();
  const origin = await siteOrigin();
  const site = { siteName: parseAdminSettings(brand).siteName, siteUrl: origin };
  const name = (patient.full_name as string | null)?.trim() || "there";
  const when = formatClinicDateTimeWithZone(appointment.slot_time);
  const dashboardUrl = `${origin}/patient/dashboard`;

  if (event === "cancelled") {
    const email = bookingCancelledEmail(site, {
      name,
      when,
      mode: sessionModeOf(appointment),
      byClinic: !!options.byClinic,
      refund: cancelRefundOf(appointment),
      dashboardUrl,
    });
    await deliverEmail(patient.email as string, email, { kind: "cancellation" });
    return;
  }
  const facts = {
    name,
    when,
    durationMinutes: appointment.duration_minutes,
    mode: sessionModeOf(appointment),
    therapistName: (therapist?.full_name as string | null)?.trim() || null,
    payment: bookingPaymentOf(appointment),
    dashboardUrl,
  };
  if (event === "reminder_24h" || event === "reminder_1h") {
    await deliverEmail(patient.email as string, bookingReminderEmail(site, facts, event), { kind: "reminder" });
    return;
  }
  const email = event === "confirmed" ? bookingConfirmedEmail(site, facts) : bookingReceivedEmail(site, facts);
  await deliverEmail(patient.email as string, email, { kind: "booking" });
}
