import type { SupabaseClient } from "@supabase/supabase-js";
import { BASE_DURATION_MINUTES } from "@/lib/pricing";

/**
 * True if assigning this therapist to [slotTime, slotTime + durationMinutes)
 * would overlap another of their non-cancelled bookings. Session lengths
 * vary by category now, so two bookings starting at the same nominal time
 * can no longer be assumed to both be a uniform 60 minutes — this is what
 * actually catches an overlap instead of just a same-timestamp collision.
 *
 * Only checks against real appointments, not other hospital referrals that
 * have been assigned a therapist/slot but not yet converted into a booking
 * (those only become an appointment row once the patient completes
 * registration) — a narrower but still meaningful check.
 */
export async function findTherapistConflict(
  admin: SupabaseClient,
  therapistId: string,
  slotTime: string,
  durationMinutes: number,
  excludeAppointmentId?: string
): Promise<boolean> {
  let query = admin
    .from("appointments")
    .select("id, slot_time, duration_minutes")
    .eq("therapist_id", therapistId)
    .neq("status", "cancelled")
    .not("slot_time", "is", null);

  if (excludeAppointmentId) {
    query = query.neq("id", excludeAppointmentId);
  }

  const { data: existing } = await query;

  const newStart = new Date(slotTime).getTime();
  const newEnd = newStart + durationMinutes * 60_000;

  return (existing ?? []).some((e) => {
    const eStart = new Date(e.slot_time as string).getTime();
    const eEnd = eStart + ((e.duration_minutes as number | null) ?? BASE_DURATION_MINUTES) * 60_000;
    return newStart < eEnd && eStart < newEnd;
  });
}
