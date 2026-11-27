import "server-only";
import { after } from "next/server";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { deliverEmail } from "@/lib/emailServer";
import { deliverWhatsApp } from "@/lib/whatsappServer";
import { bookingMovedMessage } from "@/lib/whatsappTemplates";
import { getLayoutSettings } from "@/lib/siteSettingsCache";
import { parseAdminSettings } from "@/lib/adminSettings";
import { formatClinicDateTimeWithZone } from "@/lib/formatDateTime";
import {
  clinicNoTherapistAlertEmail,
  sessionMovedEmail,
  therapistSessionReleasedEmail,
  type MoveReason,
} from "@/lib/sessionChangeEmails";
import type { SessionMode } from "@/lib/bookingEmails";
import { adminScreenHref } from "@/lib/adminNav";

// Who hears about a session that changed after it was booked
// (sessionChangeEmails.ts has the words):
//
//   moved      -> the patient (email + WhatsApp), the physiotherapist who was
//                 on it, and the clinic when nobody had been confirmed in time
//   cancelled  -> the physiotherapist who was on it (the patient's own email
//                 is the booking "cancelled" email), and the clinic when the
//                 patient took the refund because nobody was confirmed
//
// Not once-only like the booking emails: a session can move more than once,
// and each route calls this exactly once per change it actually made (its
// write is a compare-and-set). After the response, like the booking emails,
// so a slow mail provider never holds up the patient. Never throws.

type AdminClient = ReturnType<typeof createAdminClient>;

function runAfter(work: () => Promise<void>): void {
  const safe = () => work().catch(() => undefined);
  try {
    after(safe);
  } catch {
    void safe();
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

async function context() {
  const { brand } = await getLayoutSettings();
  const settings = parseAdminSettings(brand);
  return {
    site: { siteName: settings.siteName, siteUrl: await siteOrigin() },
    clinicInbox: settings.contactEmail?.trim() || null,
  };
}

async function person(admin: AdminClient, id: string | null) {
  if (!id) return null;
  const { data } = await admin.from("profiles").select("id, full_name, email, phone").eq("id", id).maybeSingle();
  return data as { id: string; full_name: string | null; email: string | null; phone: string | null } | null;
}

export type SessionChange = {
  appointmentId: string;
  patientId: string;
  /** Who was on it before the change; null when nobody was. */
  previousTherapistId: string | null;
  sessionRef: string | null;
  mode: SessionMode;
  /** The time it had. */
  oldSlotTime: string;
  /** True when the patient used the "no physiotherapist in time" way out. */
  noTherapistInTime: boolean;
};

/** A session moved to `newSlotTime`. */
export function queueSessionMovedNotices(change: SessionChange & { newSlotTime: string; reason: MoveReason }): void {
  runAfter(async () => {
    const admin = createAdminClient();
    const { site, clinicInbox } = await context();
    const oldWhen = formatClinicDateTimeWithZone(change.oldSlotTime);
    const newWhen = formatClinicDateTimeWithZone(change.newSlotTime);
    const ref = change.sessionRef ?? change.appointmentId.slice(0, 8);
    const [patient, therapist] = await Promise.all([
      person(admin, change.patientId),
      person(admin, change.previousTherapistId),
    ]);
    const work: Promise<unknown>[] = [];
    if (patient) {
      const facts = {
        name: patient.full_name?.trim() || "there",
        oldWhen,
        newWhen,
        mode: change.mode,
        reason: change.reason,
        dashboardUrl: `${site.siteUrl}/patient/dashboard/sessions`,
      };
      if (patient.email) work.push(deliverEmail(patient.email, sessionMovedEmail(site, facts), { kind: "booking" }));
      work.push(
        deliverWhatsApp({ id: patient.id, email: patient.email, phone: patient.phone }, bookingMovedMessage(facts), "booking")
      );
    }
    if (therapist?.email) {
      work.push(
        deliverEmail(
          therapist.email,
          therapistSessionReleasedEmail(site, {
            name: therapist.full_name?.trim() || "there",
            sessionRef: ref,
            when: oldWhen,
            mode: change.mode,
            change: "moved",
            dashboardUrl: `${site.siteUrl}/therapist/dashboard`,
          }),
          { kind: "booking" }
        )
      );
    }
    if (change.noTherapistInTime && clinicInbox) {
      work.push(
        deliverEmail(
          clinicInbox,
          clinicNoTherapistAlertEmail(site, {
            sessionRef: ref,
            when: oldWhen,
            mode: change.mode,
            action: "moved",
            newWhen,
            adminUrl: `${site.siteUrl}${adminScreenHref("sessions", "all", "unassigned")}`,
          }),
          { kind: "booking" }
        )
      );
    }
    await Promise.all(work);
  });
}

/** A session was cancelled: the staff side of it. */
export function queueSessionCancelledStaffNotices(change: SessionChange): void {
  if (!change.previousTherapistId && !change.noTherapistInTime) return;
  runAfter(async () => {
    const admin = createAdminClient();
    const { site, clinicInbox } = await context();
    const when = formatClinicDateTimeWithZone(change.oldSlotTime);
    const ref = change.sessionRef ?? change.appointmentId.slice(0, 8);
    const therapist = await person(admin, change.previousTherapistId);
    const work: Promise<unknown>[] = [];
    if (therapist?.email) {
      work.push(
        deliverEmail(
          therapist.email,
          therapistSessionReleasedEmail(site, {
            name: therapist.full_name?.trim() || "there",
            sessionRef: ref,
            when,
            mode: change.mode,
            change: "cancelled",
            dashboardUrl: `${site.siteUrl}/therapist/dashboard`,
          }),
          { kind: "cancellation" }
        )
      );
    }
    if (change.noTherapistInTime && clinicInbox) {
      work.push(
        deliverEmail(
          clinicInbox,
          clinicNoTherapistAlertEmail(site, {
            sessionRef: ref,
            when,
            mode: change.mode,
            action: "refunded",
            newWhen: null,
            adminUrl: `${site.siteUrl}${adminScreenHref("sessions", "all", "cancelled")}`,
          }),
          { kind: "cancellation" }
        )
      );
    }
    await Promise.all(work);
  });
}
