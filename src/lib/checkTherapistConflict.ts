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
 *
 * `bufferMinutes` pads the window being claimed on both sides. It exists for
 * home visits: an online session ends the moment the call does, but a
 * therapist who has just finished at one address cannot be at another one
 * minutes later. Without it, two home visits on opposite sides of a city
 * booked fifteen minutes apart both pass this check — a time overlap is the
 * only thing the app can see, since it holds no distance data. Defaults to 0
 * so every existing online caller behaves exactly as before.
 *
 * The padding is applied to the *new* booking's window only, not to each
 * existing one. Widening one side of the comparison is enough to catch a
 * near-miss in either direction, and padding both sides would double-count
 * the gap — two visits an hour apart would collide under a 45-minute buffer,
 * which is not what "45 minutes of travel" means.
 */
async function findConflictingAppointment(
  admin: SupabaseClient,
  therapistId: string,
  newStart: number,
  newEnd: number,
  excludeAppointmentId?: string
): Promise<boolean> {
  let appointmentsQuery = admin
    .from("appointments")
    .select("id, slot_time, duration_minutes")
    .eq("therapist_id", therapistId)
    .neq("status", "cancelled")
    .not("slot_time", "is", null);
  if (excludeAppointmentId) {
    appointmentsQuery = appointmentsQuery.neq("id", excludeAppointmentId);
  }
  const { data: existingAppointments } = await appointmentsQuery;
  return (existingAppointments ?? []).some((e) =>
    overlaps(
      newStart,
      newEnd,
      new Date(e.slot_time as string).getTime(),
      (e.duration_minutes as number | null) ?? BASE_DURATION_MINUTES
    )
  );
}

/**
 * Same overlap check as the referral half of findTherapistConflict, but
 * returns the conflicting row(s) instead of a bare boolean -- assign-referral
 * needs the rows themselves to break a tie when two referrals are assigned
 * to the same therapist/slot at once (see its own comment for why: without
 * a tiebreak, both requests' post-write rechecks see each other and both
 * roll back, instead of exactly one winning).
 */
async function findConflictingReferrals(
  admin: SupabaseClient,
  therapistId: string,
  newStart: number,
  newEnd: number,
  excludeReferralId?: string
): Promise<{ id: string; created_at: string }[]> {
  let referralsQuery = admin
    .from("patient_referrals")
    .select("id, assigned_slot_time, created_at")
    .eq("assigned_therapist_id", therapistId)
    .eq("status", "invite_sent")
    .not("assigned_slot_time", "is", null);
  if (excludeReferralId) {
    referralsQuery = referralsQuery.neq("id", excludeReferralId);
  }
  const { data: existingReferrals } = await referralsQuery;
  // Referrals have no category, so always the flat base duration.
  return (existingReferrals ?? []).filter((r) =>
    overlaps(newStart, newEnd, new Date(r.assigned_slot_time as string).getTime(), BASE_DURATION_MINUTES)
  );
}

/** Appointment-only half of findTherapistConflict -- see findTieBrokenReferralConflict's comment for why assign-referral's post-write recheck needs these split apart. */
export async function findConflictingAppointmentOnly(
  admin: SupabaseClient,
  therapistId: string,
  slotTime: string,
  durationMinutes: number,
  options: { excludeAppointmentId?: string; bufferMinutes?: number } = {}
): Promise<boolean> {
  const bufferMs = Math.max(0, options.bufferMinutes ?? 0) * 60_000;
  const newStart = new Date(slotTime).getTime() - bufferMs;
  const newEnd = new Date(slotTime).getTime() + durationMinutes * 60_000 + bufferMs;
  return findConflictingAppointment(admin, therapistId, newStart, newEnd, options.excludeAppointmentId);
}

export async function findTherapistConflict(
  admin: SupabaseClient,
  therapistId: string,
  slotTime: string,
  durationMinutes: number,
  options: {
    excludeAppointmentId?: string;
    excludeReferralId?: string;
    bufferMinutes?: number;
  } = {}
): Promise<boolean> {
  const bufferMs = Math.max(0, options.bufferMinutes ?? 0) * 60_000;
  const newStart = new Date(slotTime).getTime() - bufferMs;
  const newEnd = new Date(slotTime).getTime() + durationMinutes * 60_000 + bufferMs;

  if (await findConflictingAppointment(admin, therapistId, newStart, newEnd, options.excludeAppointmentId)) {
    return true;
  }
  const referralConflicts = await findConflictingReferrals(
    admin,
    therapistId,
    newStart,
    newEnd,
    options.excludeReferralId
  );
  return referralConflicts.length > 0;
}

/**
 * Referral-vs-referral conflict check with a deterministic tiebreak, for
 * callers (assign-referral) that need exactly one winner when two referrals
 * are assigned to the same therapist/slot concurrently. `selfCreatedAt`/
 * `selfId` identify the referral making the check; a conflicting referral
 * only counts against it if that referral is the one that should win the
 * tie (created first, or -- on an exact tie -- the lexicographically
 * smaller id). Both concurrent requests apply the same rule against each
 * other's row, so exactly one of them finds no disqualifying conflict.
 */
export async function findTieBrokenReferralConflict(
  admin: SupabaseClient,
  therapistId: string,
  slotTime: string,
  durationMinutes: number,
  self: { id: string; createdAt: string },
  options: { excludeReferralId?: string; bufferMinutes?: number } = {}
): Promise<boolean> {
  const bufferMs = Math.max(0, options.bufferMinutes ?? 0) * 60_000;
  const newStart = new Date(slotTime).getTime() - bufferMs;
  const newEnd = new Date(slotTime).getTime() + durationMinutes * 60_000 + bufferMs;
  const conflicts = await findConflictingReferrals(admin, therapistId, newStart, newEnd, options.excludeReferralId);
  return conflicts.some((other) => {
    const otherMs = new Date(other.created_at).getTime();
    const selfMs = new Date(self.createdAt).getTime();
    if (otherMs !== selfMs) return otherMs < selfMs;
    return other.id < self.id;
  });
}
