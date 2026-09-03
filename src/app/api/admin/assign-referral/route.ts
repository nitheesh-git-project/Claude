import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAdminActivity } from "@/lib/adminActivityLog";
import {
  findTherapistConflict,
  findConflictingAppointmentOnly,
  findTieBrokenReferralConflict,
} from "@/lib/checkTherapistConflict";
import { BASE_DURATION_MINUTES } from "@/lib/pricing";
import { DEFAULT_ADMIN_SETTINGS } from "@/lib/adminSettings";
import { BOOKING_LEAD_TIME_HOURS, BOOKING_LEAD_TIME_MS } from "@/lib/bookingSlots";

export async function POST(request: NextRequest) {
  const adminUser = await requireAdminScope("people");
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { referralId, therapistId, slotDateTime } = await request.json();
  if (!referralId || !therapistId || !slotDateTime) {
    return NextResponse.json(
      { error: "Missing referralId, therapistId, or slotDateTime" },
      { status: 400 }
    );
  }

  // The same lead time the patient's own picker enforces, re-checked here
  // rather than trusted from the browser. The admin's control offers only
  // eligible slots, but a card left open while the boundary moved past the
  // chosen time would otherwise commit the patient to a slot the platform
  // refuses everywhere else. Compared as absolute instants, so the server's
  // own timezone does not enter into it.
  const slotMs = new Date(slotDateTime).getTime();
  if (!Number.isFinite(slotMs)) {
    return NextResponse.json({ error: "Invalid slot time" }, { status: 400 });
  }
  if (slotMs < Date.now() + BOOKING_LEAD_TIME_MS) {
    return NextResponse.json(
      {
        error: `The assigned slot must be at least ${BOOKING_LEAD_TIME_HOURS} hours from now.`,
      },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  const { data: therapist } = await admin
    .from("profiles")
    .select("id, active")
    .eq("id", therapistId)
    .eq("role", "therapist")
    .eq("approved", true)
    .single();

  if (!therapist) {
    return NextResponse.json(
      { error: "That therapist is not an approved therapist" },
      { status: 400 }
    );
  }
  if (!therapist.active) {
    return NextResponse.json(
      { error: "That therapist is suspended and can't be assigned new referrals." },
      { status: 400 }
    );
  }

  // The route previously wrote straight to this id with no existence
  // check at all — a bad/stale referralId would silently "succeed" with
  // nothing actually written. Reading it first (and using its captured
  // fields to roll back below if needed) closes that too.
  const { data: referral } = await admin
    .from("patient_referrals")
    .select("id, assigned_therapist_id, assigned_slot_time, invite_token, status, visit_mode, created_at")
    .eq("id", referralId)
    .single();

  if (!referral) {
    return NextResponse.json({ error: "Referral not found" }, { status: 404 });
  }

  // A home-visit referral needs the same travel-time padding as every
  // other home-visit scheduling decision -- the therapist finishing one
  // visit cannot be at another minutes later, and a referral's assignment
  // is the one place that check was still missing.
  let travelBufferMinutes = 0;
  if (referral.visit_mode === "home_visit") {
    const { data: settingsRow } = await admin
      .from("site_settings")
      .select("home_visit_travel_buffer_minutes")
      .maybeSingle();
    travelBufferMinutes =
      settingsRow?.home_visit_travel_buffer_minutes ?? DEFAULT_ADMIN_SETTINGS.homeVisitTravelBufferMinutes;
  }

  const conflict = await findTherapistConflict(
    admin,
    therapistId,
    new Date(slotDateTime).toISOString(),
    BASE_DURATION_MINUTES,
    { excludeReferralId: referralId, bufferMinutes: travelBufferMinutes }
  );
  if (conflict) {
    return NextResponse.json(
      { error: "This therapist already has another session that overlaps this time slot." },
      { status: 400 }
    );
  }

  const inviteToken = crypto.randomUUID();

  const { error } = await admin
    .from("patient_referrals")
    .update({
      assigned_therapist_id: therapistId,
      assigned_slot_time: new Date(slotDateTime).toISOString(),
      invite_token: inviteToken,
      status: "invite_sent",
    })
    .eq("id", referralId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Re-check for a conflict now that the write has landed — the earlier
  // check and this write aren't atomic, so two concurrent assignments of
  // the same therapist to overlapping slots could both pass the earlier
  // check before either write committed.
  //
  // The appointment half of this is unconditional: a real appointment
  // isn't itself racing against this request, so any overlap it finds is a
  // genuine conflict and this assignment must roll back.
  //
  // The referral half needs a tiebreak instead of a plain re-check. Two
  // referrals assigned to the same therapist/slot at once both write, then
  // both land here — a plain "does a conflicting invite_sent referral
  // exist" re-check sees the OTHER row as a conflict from BOTH sides, so
  // both would roll back and the admin would have to retry blind instead
  // of exactly one assignment landing. findTieBrokenReferralConflict
  // applies the same deterministic rule (earlier created_at wins, ties
  // broken by id) from both requests' perspectives, so exactly one of them
  // finds no disqualifying conflict and keeps its assignment — the other
  // sees a real conflict against the winner and rolls back as before.
  const conflictAfterWrite =
    (await findConflictingAppointmentOnly(admin, therapistId, new Date(slotDateTime).toISOString(), BASE_DURATION_MINUTES, {
      bufferMinutes: travelBufferMinutes,
    })) ||
    (await findTieBrokenReferralConflict(
      admin,
      therapistId,
      new Date(slotDateTime).toISOString(),
      BASE_DURATION_MINUTES,
      { id: referral.id, createdAt: referral.created_at },
      { excludeReferralId: referralId, bufferMinutes: travelBufferMinutes }
    ));
  if (conflictAfterWrite) {
    await admin
      .from("patient_referrals")
      .update({
        assigned_therapist_id: referral.assigned_therapist_id,
        assigned_slot_time: referral.assigned_slot_time,
        invite_token: referral.invite_token,
        status: referral.status,
      })
      .eq("id", referralId);
    return NextResponse.json(
      {
        error:
          "This therapist was just double-booked by a concurrent assignment — please try again or pick a different therapist/time.",
      },
      { status: 409 }
    );
  }

  await recordAdminActivity(admin, adminUser.id, {
    action: "referral.assign",
    targetId: referralId,
    details: { therapistId },
  });

  return NextResponse.json({ inviteToken });
}
