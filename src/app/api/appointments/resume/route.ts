import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import {
  readPatientCheckoutStanding,
  profileCheckUnavailable,
} from "@/lib/supabase/requireActiveProfile";
import { parseAdminSettings, SITE_SETTINGS_SELECT } from "@/lib/adminSettings";
import { leadTimeMsFromHours } from "@/lib/bookingSlots";
import { isReplaceableDraft } from "@/lib/bookingDraft";
import { decideResume } from "@/lib/resumeCheckout";
import { enforceRateLimit } from "@/lib/rateLimitServer";

// What the booking wizard needs to finish paying for a booking left unpaid
// (`/book?resume=<id>`, src/lib/resumeCheckout.ts).
//
// A read: nothing is claimed, created or cancelled here. The wizard then
// quotes and pays against the same appointment through the routes it always
// uses, which re-resolve every figure under a row lock -- so this answers
// "what was booked, and can it still be paid for", never "what it costs".
//
// The promo code a failed attempt claimed is handed back by name so Step 3
// can apply it again; the preview then re-checks it, and an expired or used
// up code is said rather than silently dropped.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const limited = await enforceRateLimit(request, "checkout", {
    identifier: user?.id ?? null,
  });
  if (limited) return limited;

  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { data: body, error: parseError } = await parseJsonBody<{ appointmentId?: string }>(request);
  if (parseError) return parseError;
  const appointmentId = body.appointmentId?.trim();
  if (!appointmentId) {
    return NextResponse.json({ error: "Missing appointmentId" }, { status: 400 });
  }

  // Unapproved is fine: a locked new patient finishing their first booking
  // is exactly who this is for (see /api/appointments/create).
  const standing = await readPatientCheckoutStanding(user.id);
  if (standing === "unavailable") return profileCheckUnavailable();
  if (standing === "suspended") {
    return NextResponse.json({ error: "Your account has been suspended." }, { status: 403 });
  }
  if (standing === "not_patient") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();
  const [rowRes, settingsRes] = await Promise.all([
    // RLS scopes this to the caller's own rows; the patient_id filter is the
    // explicit version, so somebody else's booking answers 404.
    supabase
      .from("appointments")
      .select(
        "id, status, payment_status, payment_terms, visit_mode, therapist_id, package_purchase_id, home_visit_purchase_id, referral_id, pay_later_outcome, slot_time, category_id, notes, preferred_language, preferred_therapist_id, promo_code_id"
      )
      .eq("id", appointmentId)
      .eq("patient_id", user.id)
      .maybeSingle(),
    admin.from("site_settings").select(SITE_SETTINGS_SELECT).maybeSingle(),
  ]);
  if (rowRes.error) {
    return NextResponse.json(
      { error: "We couldn't load your booking just now. Please try again." },
      { status: 503 }
    );
  }
  const row = rowRes.data;
  if (!row) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  const settings = parseAdminSettings(settingsRes.data);
  const decision = decideResume(row, {
    nowMs: Date.now(),
    leadTimeMs: leadTimeMsFromHours(settings.onlineBookingLeadTimeHours),
    replaceable: isReplaceableDraft(row),
  });

  if (decision.state === "paid" || decision.state === "not_resumable") {
    return NextResponse.json({
      state: decision.state,
      message: decision.state === "paid" ? "This session is already paid." : decision.message,
    });
  }

  // The code by name, read with the service role: patients have no select
  // policy on promo_codes (discounts.md). Only the one row this booking
  // already points at is read.
  let promoCode: string | null = null;
  if (row.promo_code_id) {
    const { data: promo } = await admin
      .from("promo_codes")
      .select("code")
      .eq("id", row.promo_code_id)
      .maybeSingle();
    promoCode = promo?.code ?? null;
  }

  return NextResponse.json({
    state: decision.state,
    appointment: {
      id: row.id,
      categoryId: row.category_id,
      slotTime: row.slot_time,
      notes: row.notes,
      preferredLanguage: row.preferred_language,
      preferredTherapistId: row.preferred_therapist_id,
    },
    promoCode,
  });
}
