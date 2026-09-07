import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { isProfileActiveAndApproved } from "@/lib/supabase/requireActiveProfile";
import {
  bookHomeVisitSession,
  type HomeVisitPurchaseForBooking,
  type HomeVisitAddressInput,
} from "@/lib/bookHomeVisitSession";
import { DEFAULT_ADMIN_SETTINGS } from "@/lib/adminSettings";
import { isWholeHourSlot, NOT_WHOLE_HOUR_ERROR } from "@/lib/bookingSlots";

const MAX_NOTES_LENGTH = 1000;
// Same absolute ceiling as book-package-sessions -- a malformed/hostile
// payload shouldn't be able to force this route into looping thousands of
// times regardless of what the admin-configured bulk max says.
const HARD_MAX_SLOTS = 50;

type SlotResult = {
  slotDateTime: string;
  success: boolean;
  appointmentId?: string;
  error?: string;
};

function isoWeekKey(ms: number): string {
  const d = new Date(ms);
  const day = (d.getUTCDay() + 6) % 7;
  const thursday = new Date(d);
  thursday.setUTCDate(d.getUTCDate() - day + 3);
  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((thursday.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${thursday.getUTCFullYear()}-W${weekNo}`;
}

// Bulk-schedules multiple home visits in one request -- the home-visit twin
// of /api/appointments/book-package-sessions. Every slot goes through the
// same bookHomeVisitSession() claim-and-insert every other home-visit
// booking path uses; this route's own job is purely the batch-level rules
// (bulk limit, minimum gap, weekly cap, expiry) that only make sense across
// a set of candidate slots. Unlike the online bulk scheduler, there's no
// per-slot address input -- a home-visit purchase is delivered to the
// address it was bought against (default_address_id, snapshotted at
// purchase time), so every visit in the batch uses that same saved address.
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
    homeVisitPurchaseId?: string;
    slots?: { slotDateTime?: string; timezone?: string }[];
    notes?: string;
  }>(request);
  if (parseError) return parseError;
  const { homeVisitPurchaseId, slots, notes } = body;

  if (!homeVisitPurchaseId || !Array.isArray(slots) || slots.length === 0) {
    return NextResponse.json({ error: "Missing homeVisitPurchaseId or slots" }, { status: 400 });
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
  parsedSlots.sort((a, b) => a.ms - b.ms);

  if (!(await isProfileActiveAndApproved(user.id))) {
    return NextResponse.json(
      { error: "Your account is not active — it is either awaiting admin approval or has been suspended." },
      { status: 403 }
    );
  }

  const admin = createAdminClient();
  const { data: purchase } = await admin
    .from("home_visit_package_purchases")
    .select(
      "id, patient_id, package_id, visit_count, visits_used, amount_paid_paise, travel_fee_paise, payment_mode, payment_status, status, expires_at, locked_therapist_id, default_address_id"
    )
    .eq("id", homeVisitPurchaseId)
    .single();

  if (!purchase || purchase.patient_id !== user.id) {
    return NextResponse.json({ error: "Home visit package not found" }, { status: 404 });
  }
  if (!purchase.default_address_id) {
    return NextResponse.json(
      { error: "This package has no saved address on file. Please contact the clinic." },
      { status: 400 }
    );
  }

  const [{ data: packageRow }, { data: settingsRow }, { data: existingAppointments }, { data: address }] =
    await Promise.all([
      admin
        .from("home_visit_packages")
        .select("visit_duration_minutes, min_gap_hours, max_visits_per_week")
        .eq("id", purchase.package_id)
        .maybeSingle(),
      admin
        .from("site_settings")
        .select("home_visit_bulk_schedule_max, home_visit_travel_buffer_minutes")
        .maybeSingle(),
      admin
        .from("appointments")
        .select("slot_time")
        .eq("home_visit_purchase_id", homeVisitPurchaseId)
        .in("status", ["requested", "confirmed", "completed"]),
      admin
        .from("patient_addresses")
        .select(
          "id, label, line1, line2, landmark, city, state, pincode, area_id, latitude, longitude, map_place_id, contact_phone, access_notes"
        )
        .eq("id", purchase.default_address_id)
        .eq("patient_id", user.id)
        .maybeSingle(),
    ]);

  if (!address) {
    return NextResponse.json(
      { error: "This package's saved address could not be found. Please contact the clinic." },
      { status: 400 }
    );
  }
  const addressInput: HomeVisitAddressInput = address;

  const bulkMax =
    settingsRow?.home_visit_bulk_schedule_max ?? DEFAULT_ADMIN_SETTINGS.homeVisitBulkScheduleMax;
  const travelBufferMinutes =
    settingsRow?.home_visit_travel_buffer_minutes ?? DEFAULT_ADMIN_SETTINGS.homeVisitTravelBufferMinutes;
  const pendingCount = Math.max(purchase.visit_count - purchase.visits_used, 0);
  const allowedCount = Math.min(bulkMax, pendingCount);

  if (parsedSlots.length > allowedCount) {
    return NextResponse.json(
      {
        error:
          allowedCount === 0
            ? "This package has no visits left to schedule."
            : `You can schedule at most ${allowedCount} visit(s) at once.`,
      },
      { status: 400 }
    );
  }

  const minGapMs = (packageRow?.min_gap_hours ?? 0) * 3_600_000;
  const maxPerWeek = packageRow?.max_visits_per_week ?? null;

  const acceptedTimes: number[] = (existingAppointments ?? [])
    .map((a) => (a.slot_time ? new Date(a.slot_time).getTime() : null))
    .filter((t): t is number => t !== null);
  const weekCounts = new Map<string, number>();
  for (const t of acceptedTimes) {
    const key = isoWeekKey(t);
    weekCounts.set(key, (weekCounts.get(key) ?? 0) + 1);
  }

  const results: SlotResult[] = [];
  let visitsUsedSoFar = purchase.visits_used;

  for (const slot of parsedSlots) {
    if (purchase.expires_at && slot.ms > new Date(purchase.expires_at).getTime()) {
      results.push({ slotDateTime: slot.slotDateTime, success: false, error: "After this package's validity ends." });
      continue;
    }
    if (minGapMs > 0 && acceptedTimes.some((t) => Math.abs(t - slot.ms) < minGapMs)) {
      results.push({
        slotDateTime: slot.slotDateTime,
        success: false,
        error: `Too close to another visit on this package (minimum ${packageRow?.min_gap_hours}h gap).`,
      });
      continue;
    }
    const weekKey = isoWeekKey(slot.ms);
    if (maxPerWeek !== null && (weekCounts.get(weekKey) ?? 0) >= maxPerWeek) {
      results.push({
        slotDateTime: slot.slotDateTime,
        success: false,
        error: `This package allows at most ${maxPerWeek} visit(s) per week.`,
      });
      continue;
    }

    const purchaseForBooking: HomeVisitPurchaseForBooking = {
      id: purchase.id,
      patient_id: purchase.patient_id,
      visit_count: purchase.visit_count,
      visits_used: visitsUsedSoFar,
      amount_paid_paise: purchase.amount_paid_paise,
      travel_fee_paise: purchase.travel_fee_paise,
      payment_mode: purchase.payment_mode,
      payment_status: purchase.payment_status,
      status: purchase.status,
      expires_at: purchase.expires_at,
      locked_therapist_id: purchase.locked_therapist_id,
    };

    const result = await bookHomeVisitSession(admin, {
      purchase: purchaseForBooking,
      slotDateTime: slot.slotDateTime,
      timezone: slot.timezone,
      notes,
      actorId: user.id,
      address: addressInput,
      visitDurationMinutes: packageRow?.visit_duration_minutes ?? null,
      travelBufferMinutes,
    });

    if (result.success) {
      visitsUsedSoFar += 1;
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
