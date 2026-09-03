import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { isProfileActiveAndApproved } from "@/lib/supabase/requireActiveProfile";
import { bookPackageSession, type PurchaseForBooking } from "@/lib/bookPackageSession";
import { DEFAULT_ADMIN_SETTINGS } from "@/lib/adminSettings";
import {
  leadTimeMsFromHours,
  isWholeHourSlot,
  NOT_WHOLE_HOUR_ERROR,
} from "@/lib/bookingSlots";

const MAX_NOTES_LENGTH = 1000;
// Absolute ceiling regardless of the admin-configured
// package_bulk_schedule_max -- a malformed/hostile payload shouldn't be
// able to force this route into looping thousands of times.
const HARD_MAX_SLOTS = 50;

type SlotResult = {
  slotDateTime: string;
  success: boolean;
  appointmentId?: string;
  error?: string;
};

function isoWeekKey(ms: number): string {
  const d = new Date(ms);
  // ISO week: Thursday of the week's calendar year determines the week
  // number, and weeks start Monday. Good enough here as a stable grouping
  // key -- exact ISO week numbering isn't the point, "same calendar week"
  // consistency between candidate slots is.
  const day = (d.getUTCDay() + 6) % 7; // Monday = 0
  const thursday = new Date(d);
  thursday.setUTCDate(d.getUTCDate() - day + 3);
  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((thursday.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${thursday.getUTCFullYear()}-W${weekNo}`;
}

// Bulk-schedules multiple package sessions in one request -- the patient
// dashboard's "Schedule sessions" calendar. Each slot goes through the same
// bookPackageSession() claim-and-insert every other package booking path
// uses; this route's own job is purely the batch-level rules (bulk limit,
// minimum gap, weekly cap, expiry) that only make sense across a set of
// candidate slots, and reporting exactly which slots made it in.
export async function POST(request: NextRequest) {
  const { data: body, error: parseError } = await parseJsonBody<{
    packagePurchaseId?: string;
    slots?: { slotDateTime?: string; timezone?: string }[];
    notes?: string;
  }>(request);
  if (parseError) return parseError;
  const { packagePurchaseId, slots, notes } = body;

  if (!packagePurchaseId || !Array.isArray(slots) || slots.length === 0) {
    return NextResponse.json({ error: "Missing packagePurchaseId or slots" }, { status: 400 });
  }
  if (slots.length > HARD_MAX_SLOTS) {
    return NextResponse.json({ error: "Too many slots in one request." }, { status: 400 });
  }
  if (notes && notes.length > MAX_NOTES_LENGTH) {
    return NextResponse.json(
      { error: `Notes must be ${MAX_NOTES_LENGTH} characters or less.` },
      { status: 400 }
    );
  }

  // Validate + normalize every slot's shape up front -- a single malformed
  // entry fails the whole request rather than silently dropping it, so the
  // patient never wonders why their Nth pick didn't show up in the results.
  const parsedSlots: { slotDateTime: string; timezone?: string; ms: number }[] = [];
  for (const s of slots) {
    if (!s.slotDateTime) {
      return NextResponse.json({ error: "Every slot needs a slotDateTime." }, { status: 400 });
    }
    const ms = new Date(s.slotDateTime).getTime();
    if (Number.isNaN(ms)) {
      return NextResponse.json({ error: `Invalid slotDateTime: ${s.slotDateTime}` }, { status: 400 });
    }
    if (ms <= Date.now()) {
      return NextResponse.json({ error: "Every slot must be in the future." }, { status: 400 });
    }
    // Slots start on the hour, everywhere -- checked in each slot's own
    // timezone, since 6 PM IST is 12:30 UTC and reading the minute off the
    // instant would refuse every correct booking in the clinic.
    if (!isWholeHourSlot(s.slotDateTime, s.timezone)) {
      return NextResponse.json({ error: NOT_WHOLE_HOUR_ERROR }, { status: 400 });
    }
    parsedSlots.push({ slotDateTime: s.slotDateTime, timezone: s.timezone, ms });
  }
  // Process chronologically so gap/weekly-cap checks against
  // already-accepted slots behave predictably regardless of the order the
  // patient clicked them in.
  parsedSlots.sort((a, b) => a.ms - b.ms);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!(await isProfileActiveAndApproved(user.id))) {
    return NextResponse.json(
      { error: "Your account is not active — it is either awaiting admin approval or has been suspended." },
      { status: 403 }
    );
  }

  const admin = createAdminClient();
  const { data: purchase } = await admin
    .from("patient_package_purchases")
    .select(
      "id, patient_id, package_id, category_id, session_count, sessions_used, amount_paid_paise, payment_status, status, expires_at, locked_therapist_id"
    )
    .eq("id", packagePurchaseId)
    .single();

  if (!purchase || purchase.patient_id !== user.id) {
    return NextResponse.json({ error: "Package not found" }, { status: 404 });
  }

  const [{ data: packageRow }, { data: settingsRow }, { data: existingAppointments }] = await Promise.all([
    admin
      .from("treatment_category_packages")
      .select("session_duration_minutes, min_gap_hours, max_sessions_per_week")
      .eq("id", purchase.package_id)
      .maybeSingle(),
    admin
      .from("site_settings")
      .select("package_bulk_schedule_max, online_booking_lead_time_hours")
      .maybeSingle(),
    admin
      .from("appointments")
      .select("slot_time")
      .eq("package_purchase_id", packagePurchaseId)
      .in("status", ["requested", "confirmed", "completed"]),
  ]);

  const bulkMax = settingsRow?.package_bulk_schedule_max ?? DEFAULT_ADMIN_SETTINGS.packageBulkScheduleMax;

  // The booking lead time, which this route did not enforce at all.
  //
  // "In the future" was the only check, so a session on a programme could be
  // booked to start in five minutes by posting here directly -- ambushing a
  // therapist with an appointment they have no chance of seeing, which is
  // the entire reason the lead time exists. The calendar filters unbookable
  // hours out client-side, so nobody could do it by accident; that is
  // exactly the shape of gap the "never trust what the client sent,
  // re-derive it server-side" rule exists for.
  //
  // Read from the same setting the wizard's picker reads, so the two cannot
  // drift apart -- the whole point of bookingSlots.ts. Refused per slot
  // rather than for the whole request, so one too-soon pick does not throw
  // away four good ones.
  const leadTimeHours =
    settingsRow?.online_booking_lead_time_hours ??
    DEFAULT_ADMIN_SETTINGS.onlineBookingLeadTimeHours;
  const earliestBookableMs = Date.now() + leadTimeMsFromHours(leadTimeHours);
  const pendingCount = Math.max(purchase.session_count - purchase.sessions_used, 0);
  const allowedCount = Math.min(bulkMax, pendingCount);

  if (parsedSlots.length > allowedCount) {
    return NextResponse.json(
      {
        error:
          allowedCount === 0
            ? "This package has no sessions left to schedule."
            : `You can schedule at most ${allowedCount} session(s) at once.`,
      },
      { status: 400 }
    );
  }

  const minGapMs = (packageRow?.min_gap_hours ?? 0) * 3_600_000;
  const maxPerWeek = packageRow?.max_sessions_per_week ?? null;

  // Accepted-so-far state, seeded with what's already on the calendar for
  // this purchase -- new slots are checked against both prior real
  // bookings and each other as the batch is walked in order.
  const acceptedTimes: number[] = (existingAppointments ?? [])
    .map((a) => (a.slot_time ? new Date(a.slot_time).getTime() : null))
    .filter((t): t is number => t !== null);
  const weekCounts = new Map<string, number>();
  for (const t of acceptedTimes) {
    const key = isoWeekKey(t);
    weekCounts.set(key, (weekCounts.get(key) ?? 0) + 1);
  }

  const results: SlotResult[] = [];
  // Local running tally of sessions_used -- kept in step with each
  // successful bookPackageSession() call below so the next iteration's
  // "no sessions remaining" check reflects this batch's own progress, not
  // a stale read from before the loop started. A genuine concurrent writer
  // (another tab, the dashboard's single-session button) is still caught
  // by bookPackageSession's own CAS claim regardless of what this counts.
  let sessionsUsedSoFar = purchase.sessions_used;

  for (const slot of parsedSlots) {
    if (slot.ms < earliestBookableMs) {
      results.push({
        slotDateTime: slot.slotDateTime,
        success: false,
        error: `Please pick a time at least ${leadTimeHours} hours from now.`,
      });
      continue;
    }
    if (purchase.expires_at && slot.ms > new Date(purchase.expires_at).getTime()) {
      results.push({ slotDateTime: slot.slotDateTime, success: false, error: "After this package's validity ends." });
      continue;
    }
    if (minGapMs > 0 && acceptedTimes.some((t) => Math.abs(t - slot.ms) < minGapMs)) {
      results.push({
        slotDateTime: slot.slotDateTime,
        success: false,
        error: `Too close to another session on this package (minimum ${packageRow?.min_gap_hours}h gap).`,
      });
      continue;
    }
    const weekKey = isoWeekKey(slot.ms);
    if (maxPerWeek !== null && (weekCounts.get(weekKey) ?? 0) >= maxPerWeek) {
      results.push({
        slotDateTime: slot.slotDateTime,
        success: false,
        error: `This package allows at most ${maxPerWeek} session(s) per week.`,
      });
      continue;
    }

    const purchaseForBooking: PurchaseForBooking = {
      id: purchase.id,
      patient_id: purchase.patient_id,
      category_id: purchase.category_id,
      session_count: purchase.session_count,
      sessions_used: sessionsUsedSoFar,
      amount_paid_paise: purchase.amount_paid_paise,
      payment_status: purchase.payment_status,
      status: purchase.status,
      expires_at: purchase.expires_at,
      locked_therapist_id: purchase.locked_therapist_id,
    };

    const result = await bookPackageSession(admin, {
      purchase: purchaseForBooking,
      slotDateTime: slot.slotDateTime,
      timezone: slot.timezone,
      notes,
      actorId: user.id,
      sessionDurationMinutesOverride: packageRow?.session_duration_minutes ?? null,
    });

    if (result.success) {
      sessionsUsedSoFar += 1;
      acceptedTimes.push(slot.ms);
      weekCounts.set(weekKey, (weekCounts.get(weekKey) ?? 0) + 1);
      results.push({ slotDateTime: slot.slotDateTime, success: true, appointmentId: result.appointmentId });
    } else {
      results.push({ slotDateTime: slot.slotDateTime, success: false, error: result.error });
    }
  }

  return NextResponse.json({
    success: true,
    bookedCount: results.filter((r) => r.success).length,
    results,
  });
}
