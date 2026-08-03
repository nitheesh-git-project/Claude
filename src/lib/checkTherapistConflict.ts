import type { SupabaseClient } from "@supabase/supabase-js";
import { BASE_DURATION_MINUTES } from "@/lib/pricing";

function overlaps(
  newStart: number,
  newEnd: number,
  otherStart: number,
  otherDurationMinutes: number
) {
  const otherEnd = otherStart + otherDurationMinutes * 60_000;
  return newStart < otherEnd && otherStart < newEnd;
}

/**
 * True if assigning this therapist to [slotTime, slotTime + durationMinutes)
 * would overlap another of their non-cancelled bookings, OR another hospital
 * referral already assigned to them that hasn't been converted into a real
 * booking yet ("invite_sent" — the patient hasn't completed registration,
 * so there's no appointments row for it, but the slot is still effectively
 * reserved). Without checking both, two different referrals could each get
 * assigned to the same therapist at overlapping times, since neither would
 * show up as a conflict until whichever one converts first.
 *
 * Session lengths vary by category now, so two bookings starting at the
 * same nominal time can no longer be assumed to both be a uniform 60
 * minutes — this is what actually catches an overlap instead of just a
 * same-timestamp collision.
 */
export async function findTherapistConflict(
  admin: SupabaseClient,
  therapistId: string,
  slotTime: string,
  durationMinutes: number,
  options: { excludeAppointmentId?: string; excludeReferralId?: string } = {}
): Promise<boolean> {
  let appointmentsQuery = admin
    .from("appointments")
    .select("id, slot_time, duration_minutes")
    .eq("therapist_id", therapistId)
    .neq("status", "cancelled")
    .not("slot_time", "is", null);
  if (options.excludeAppointmentId) {
    appointmentsQuery = appointmentsQuery.neq("id", options.excludeAppointmentId);
  }

  let referralsQuery = admin
    .from("patient_referrals")
    .select("id, assigned_slot_time")
    .eq("assigned_therapist_id", therapistId)
    .eq("status", "invite_sent")
    .not("assigned_slot_time", "is", null);
  if (options.excludeReferralId) {
    referralsQuery = referralsQuery.neq("id", options.excludeReferralId);
  }

  const [{ data: existingAppointments }, { data: existingReferrals }] = await Promise.all([
    appointmentsQuery,
    referralsQuery,
  ]);

  const newStart = new Date(slotTime).getTime();
  const newEnd = newStart + durationMinutes * 60_000;

  const appointmentConflict = (existingAppointments ?? []).some((e) =>
    overlaps(
      newStart,
      newEnd,
      new Date(e.slot_time as string).getTime(),
      (e.duration_minutes as number | null) ?? BASE_DURATION_MINUTES
    )
  );
  if (appointmentConflict) return true;

  // Referrals have no category, so always the flat base duration.
  return (existingReferrals ?? []).some((r) =>
    overlaps(
      newStart,
      newEnd,
      new Date(r.assigned_slot_time as string).getTime(),
      BASE_DURATION_MINUTES
    )
  );
}
