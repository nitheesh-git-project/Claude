import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_ADMIN_SETTINGS } from "@/lib/adminSettings";
import { isWholeHourSlot, leadTimeMsFromHours, NOT_WHOLE_HOUR_ERROR } from "@/lib/bookingSlots";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { isProfileActiveAndApproved, profileCheckUnavailable } from "@/lib/supabase/requireActiveProfile";
import { bookPackageSession } from "@/lib/bookPackageSession";
import { checkPackageSpacing, readPackageTerms } from "@/lib/packageTerms";

const MAX_NOTES_LENGTH = 1000;

export async function POST(request: NextRequest) {
  // Who is asking, before anything the caller sent is looked at. An
  // anonymous request is refused here rather than after body validation,
  // so an unauthenticated caller never drives this route's parsing and is
  // never told what shape the request should have been.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: body, error: parseError } = await parseJsonBody<{
    packagePurchaseId?: string;
    slotDateTime?: string;
    timezone?: string;
    notes?: string;
  }>(request);
  if (parseError) return parseError;
  const { packagePurchaseId, slotDateTime, timezone, notes } = body;

  if (!packagePurchaseId || !slotDateTime) {
    return NextResponse.json(
      { error: "Missing packagePurchaseId or slotDateTime" },
      { status: 400 }
    );
  }
  if (notes && notes.length > MAX_NOTES_LENGTH) {
    return NextResponse.json(
      { error: `Notes must be ${MAX_NOTES_LENGTH} characters or less.` },
      { status: 400 }
    );
  }

  const slotTimestamp = new Date(slotDateTime).getTime();
  if (Number.isNaN(slotTimestamp)) {
    return NextResponse.json({ error: "Invalid slotDateTime" }, { status: 400 });
  }
  if (slotTimestamp <= Date.now()) {
    return NextResponse.json({ error: "The slot must be in the future" }, { status: 400 });
  }
  // Sessions start on the hour, everywhere -- the same rule the direct and
  // bulk booking routes already enforced; this one was the gap a crafted
  // request could book an off-schedule session through.
  if (!isWholeHourSlot(new Date(slotTimestamp).toISOString(), timezone)) {
    return NextResponse.json({ error: NOT_WHOLE_HOUR_ERROR }, { status: 400 });
  }

  const standing = await isProfileActiveAndApproved(user.id);
  if (standing === null) return profileCheckUnavailable();
  if (!standing) {
    return NextResponse.json({ error: "Your account is not active - it is either awaiting admin approval or has been suspended." }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: purchase } = await admin
    .from("patient_package_purchases")
    .select(
      "id, patient_id, category_id, package_id, session_count, sessions_used, amount_paid_paise, payment_status, status, expires_at, locked_therapist_id"
    )
    .eq("id", packagePurchaseId)
    .single();

  if (!purchase || purchase.patient_id !== user.id) {
    return NextResponse.json({ error: "Package not found" }, { status: 404 });
  }

  // The booking lead time, which this route did not enforce either -- see
  // the note in book-package-sessions. "In the future" let a session on a
  // programme be booked to start in five minutes by posting here directly,
  // ambushing a therapist with an appointment they have no chance of
  // seeing. Read from the same setting the patient's own picker reads.
  const { data: leadSettings } = await admin
    .from("site_settings")
    .select("online_booking_lead_time_hours")
    .maybeSingle();
  const leadTimeHours =
    leadSettings?.online_booking_lead_time_hours ??
    DEFAULT_ADMIN_SETTINGS.onlineBookingLeadTimeHours;
  if (slotTimestamp < Date.now() + leadTimeMsFromHours(leadTimeHours)) {
    return NextResponse.json(
      { error: `Please pick a time at least ${leadTimeHours} hours from now.` },
      { status: 409 }
    );
  }

  // The package row's own session_duration_minutes override (if any) --
  // read separately from the purchase, same isolated-query convention as
  // The session length this patient BOUGHT, not the one on sale today -- the
  // same correction the other three package booking paths got. Reading the
  // live row meant an admin editing a programme changed the length of
  // sessions somebody had already paid for, mid-programme.
  const packageTerms = await readPackageTerms(admin, purchase.id, purchase.package_id);

  // The programme's minimum gap and weekly cap, which the bulk scheduler
  // applied and this single-session door did not.
  const spacing = await checkPackageSpacing(admin, {
    purchaseId: purchase.id,
    slotMs: slotTimestamp,
    terms: packageTerms,
  });
  if (!spacing.ok) {
    return NextResponse.json(
      { error: spacing.error },
      { status: spacing.reason === "unavailable" ? 503 : 409 }
    );
  }

  const result = await bookPackageSession(admin, {
    purchase,
    slotDateTime,
    timezone,
    notes,
    actorId: user.id,
    sessionDurationMinutesOverride: packageTerms.sessionDurationMinutes,
  });

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ success: true, appointmentId: result.appointmentId });
}
