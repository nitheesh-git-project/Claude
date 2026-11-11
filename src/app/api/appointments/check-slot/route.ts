import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { enforceRateLimit } from "@/lib/rateLimitServer";
import { OWN_SLOT_CONFLICT_ERROR, ownSlotConflict } from "@/lib/bookingDraft";
import { BASE_DURATION_MINUTES } from "@/lib/pricing";

// Step 1 of the booking wizard asks, before it moves on: does this time
// overlap a session I already have? The answer used to arrive only on the
// last step, from /api/appointments/create, after the patient had filled in
// every detail for a time they could never have. This is the same rule
// (ownSlotConflict, src/lib/bookingDraft.ts), asked early; create still
// checks it again, and the database's own exclusion trigger is the last word.
//
// Nobody signed in has no bookings to clash with: `{ checked: false }`, and
// the wizard simply moves on. A check that could not be run is said as such
// (503) -- the wizard then moves on too, since create will check again.
//
// Request:  { slotTime: string (ISO), categoryId?: string | null,
//             replacesAppointmentId?: string | null }
// Response: 200 { checked: true, conflict: boolean, error?: string }
//           200 { checked: false }   not signed in
//           400, 429, 503
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: body, error: parseError } = await parseJsonBody<{
    slotTime?: unknown;
    categoryId?: unknown;
    replacesAppointmentId?: unknown;
  }>(request);
  if (parseError) return parseError;

  if (!user) return NextResponse.json({ checked: false });

  const limited = await enforceRateLimit(request, "checkout", { identifier: user.id });
  if (limited) return limited;

  const slotMs = typeof body.slotTime === "string" ? Date.parse(body.slotTime) : NaN;
  if (!Number.isFinite(slotMs)) {
    return NextResponse.json({ error: "Please pick a date and a time." }, { status: 400 });
  }
  const categoryId = typeof body.categoryId === "string" && /^[0-9a-f-]{36}$/i.test(body.categoryId) ? body.categoryId : null;
  const replacesId =
    typeof body.replacesAppointmentId === "string" && /^[0-9a-f-]{36}$/i.test(body.replacesAppointmentId)
      ? body.replacesAppointmentId
      : null;

  const admin = createAdminClient();
  const [categoryRes, existingRes] = await Promise.all([
    categoryId
      ? admin.from("treatment_categories").select("duration_minutes").eq("id", categoryId).maybeSingle()
      : Promise.resolve(null),
    admin
      .from("appointments")
      .select(
        "id, slot_time, duration_minutes, status, payment_status, therapist_id, visit_mode, payment_terms, package_purchase_id, home_visit_purchase_id, referral_id, pay_later_outcome"
      )
      .eq("patient_id", user.id)
      .in("status", ["requested", "confirmed"]),
  ]);
  if (existingRes.error) {
    return NextResponse.json(
      { error: "We couldn't check your existing bookings just now." },
      { status: 503 }
    );
  }
  const durationMinutes = categoryRes?.data?.duration_minutes ?? BASE_DURATION_MINUTES;
  const { conflict } = ownSlotConflict(existingRes.data ?? [], slotMs, durationMinutes, BASE_DURATION_MINUTES, replacesId);
  return NextResponse.json(conflict ? { checked: true, conflict, error: OWN_SLOT_CONFLICT_ERROR } : { checked: true, conflict });
}
