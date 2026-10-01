import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAdminActivity } from "@/lib/adminActivityLog";
import { BASE_DURATION_MINUTES } from "@/lib/pricing";
import {
  DEFAULT_ADMIN_SETTINGS,
  parseAdminSettings,
  SITE_SETTINGS_SELECT,
} from "@/lib/adminSettings";
import { parseJsonBody } from "@/lib/parseJsonBody";
import {
  claimReferralSlot,
  describeReferralClaimFailure,
} from "@/lib/claimTherapistSlot";
import {
  isWholeHourSlot,
  leadTimeMsFromHours,
  NOT_WHOLE_HOUR_ERROR,
} from "@/lib/bookingSlots";

export async function POST(request: NextRequest) {
  const adminUser = await requireAdminScope("people");
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: body, error: parseError } = await parseJsonBody<{
    referralId?: string;
    therapistId?: string;
    slotDateTime?: string;
  }>(request);
  if (parseError) return parseError;
  const { referralId, therapistId, slotDateTime } = body;
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
  // Slots start on the hour, everywhere. A referral's slot becomes a real
  // appointment when the patient registers, so it obeys the same rule the
  // booking it turns into does. The clinic's zone: a referral has no
  // patient account yet, so there is no other timezone on file.
  if (!isWholeHourSlot(new Date(slotMs).toISOString(), null)) {
    return NextResponse.json({ error: NOT_WHOLE_HOUR_ERROR }, { status: 400 });
  }

  const admin = createAdminClient();

  // The lead time comes from the clinic's own setting, not from the
  // constant. `/api/admin/create-booking` and `/api/appointments/create`
  // have read the column since it became a setting, and this route read the
  // constant -- so a clinic that widened its window had one of its three
  // admin doors still promising a referred patient the old one. The constant
  // survives as the fallback for a database that has not applied the column.
  const { data: leadSettingsRow } = await admin
    .from("site_settings")
    .select(SITE_SETTINGS_SELECT)
    .maybeSingle();
  const leadTimeHours = parseAdminSettings(leadSettingsRow).onlineBookingLeadTimeHours;
  if (slotMs < Date.now() + leadTimeMsFromHours(leadTimeHours)) {
    return NextResponse.json(
      {
        error: `The assigned slot must be at least ${leadTimeHours} hour${
          leadTimeHours === 1 ? "" : "s"
        } from now.`,
      },
      { status: 400 }
    );
  }

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
  // check at all - a bad/stale referralId would silently "succeed" with
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

  const inviteToken = crypto.randomUUID();

  // The whole reservation -- overlap test, compare-and-set and write -- in
  // one statement under a row lock on the therapist.
  //
  // This replaces a check, a write, a re-check with a deterministic
  // tiebreak, and a revert. The tiebreak existed only because the two
  // writes were never serialised: two referrals assigned to the same
  // therapist and hour at once both wrote, then each saw the other on the
  // re-check, so a plain re-check rolled BOTH back and neither admin got an
  // assignment. Under a lock the second request simply finds the first's
  // committed row and is refused, which is the answer the tiebreak was
  // reconstructing -- so it is gone, and so is the revert beside it, which
  // restored four columns with no compare-and-set and could undo a third
  // admin's assignment.
  const claim = await claimReferralSlot(admin, {
    referralId,
    therapistId,
    slotTime: new Date(slotDateTime).toISOString(),
    inviteToken,
    bufferMinutes: travelBufferMinutes,
    durationMinutes: BASE_DURATION_MINUTES,
  });

  if (!claim.ok) {
    const { status, error } = describeReferralClaimFailure(claim);
    return NextResponse.json({ error }, { status });
  }

  await recordAdminActivity(admin, adminUser.id, {
    action: "referral.assign",
    targetId: referralId,
    details: { therapistId },
  });

  return NextResponse.json({ inviteToken });
}
