import type { SupabaseClient } from "@supabase/supabase-js";
import { createMeetEventForConfirmedAppointment } from "@/lib/googleCalendarSync";
import { queueAppointmentEmail } from "@/lib/appointmentEmailServer";
import { formatAddressOneLine, visitAddressFromAppointment } from "@/lib/formatAddress";

/**
 * What happens once an admin's assignment has moved a session to
 * `confirmed`: the calendar event (a Meet link online, the street address
 * for a home visit) and the patient's "confirmed" email.
 *
 * Both admin doors that confirm on assignment -- Assign & Confirm and the
 * booking editor's "Change time & assign" -- call this, so the two cannot
 * drift into one sending an invite the other forgets. Call it only after
 * the claim that confirmed the row has succeeded.
 */
export const VISIT_COLUMNS =
  "visit_mode, home_visit_purchase_id, visit_address_line1, visit_address_line2, visit_landmark, visit_city, visit_state, visit_pincode, visit_latitude, visit_longitude, visit_access_notes";

export type VisitRow = Parameters<typeof visitAddressFromAppointment>[0] & {
  visit_mode?: string | null;
  visit_access_notes?: string | null;
};

export async function announceConfirmedSession(
  admin: SupabaseClient,
  input: {
    appointmentId: string;
    patientId: string;
    therapistId: string;
    slotTime: string | null;
    durationMinutes: number | null;
    timezone: string | null;
    visit: VisitRow | null;
  }
): Promise<void> {
  const isHomeVisit = input.visit?.visit_mode === "home_visit";
  if (input.slotTime) {
    await createMeetEventForConfirmedAppointment(admin, {
      appointmentId: input.appointmentId,
      patientId: input.patientId,
      therapistId: input.therapistId,
      slotTime: input.slotTime,
      durationMinutes: input.durationMinutes,
      timezone: input.timezone,
      // A home visit's event carries the street address and no Meet link.
      // It is not optional: the clinic's own confirmation email can be
      // switched off (Settings -> Emails), so Calendar's invite may be the
      // only confirmation the patient gets that someone is coming home.
      visitMode: isHomeVisit ? "home_visit" : "online",
      location: isHomeVisit && input.visit ? formatAddressOneLine(visitAddressFromAppointment(input.visit)) : null,
      description:
        isHomeVisit && input.visit?.visit_access_notes ? `Access notes: ${input.visit.visit_access_notes}` : null,
    });
  }
  // The patient hears it is confirmed, once (a "received" email may have
  // gone out at payment, while nobody was assigned).
  queueAppointmentEmail(input.appointmentId, "confirmed");
}
