import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { isProfileActive, isPatientProfile } from "@/lib/supabase/requireActiveProfile";
import { readAppointmentServicePrice } from "@/lib/appointmentPriceServer";
import { previewPromoCode } from "@/lib/promoCodesServer";
import { readPromoCodesEnabled } from "@/lib/acquisitionSettings";
import { isWellFormedPromoCode } from "@/lib/promoCodes";

// What a code would do, before the patient commits to paying.
//
// A read, deliberately: nothing is claimed here and nothing is held. The
// authority is `claim_promo_code()`, called from /api/razorpay/create-order
// under a row lock, because a cap of 100 has to mean roughly 100 even when
// forty people are at checkout at once and a count taken a moment earlier
// does not do that.
//
// So this route can be a moment out of date and that is fine -- nothing has
// been promised yet. What it must not be is *differently* out of date from
// the order that follows, which is why both work from
// readAppointmentServicePrice rather than each deriving a price of their
// own.
/** A uuid no row can carry, for the "no booking yet" preview. */
const EXCLUDES_NOTHING = "00000000-0000-0000-0000-000000000000";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  if (!(await isProfileActive(user.id))) {
    return NextResponse.json({ error: "Your account has been suspended." }, { status: 403 });
  }
  // Same rule as the four purchase routes: one account carries one role, and
  // a session is delivered to a patient.
  if (!(await isPatientProfile(user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: body, error: parseError } = await parseJsonBody<{
    appointmentId?: string;
    categoryId?: string;
    code?: string;
  }>(request);
  if (parseError) return parseError;

  // Either an existing booking or the category the wizard is about to book.
  // Both are needed: the wizard has no appointment yet at the point a
  // patient types a code (the row is created and paid for in one step), and
  // the dashboard's Pay Now has an appointment and no category. A preview
  // that only worked for one of them would put the field on the screen where
  // it is least useful.
  const appointmentId = body.appointmentId?.trim();
  const categoryId = body.categoryId?.trim();
  const code = (body.code ?? "").trim();
  if (!appointmentId && !categoryId) {
    return NextResponse.json({ error: "Missing appointmentId or categoryId" }, { status: 400 });
  }
  // Refused on shape before the database is asked, so a field of gibberish
  // costs no query -- and the patient gets the same sentence either way.
  if (!isWellFormedPromoCode(code)) {
    return NextResponse.json({ applies: false, message: "That code isn't recognised." });
  }

  const admin = createAdminClient();
  if (!(await readPromoCodesEnabled(admin))) {
    return NextResponse.json({ applies: false, message: "That code isn't recognised." });
  }

  let priceCategoryId: string | null = categoryId ?? null;
  if (appointmentId) {
    // RLS already scopes this to the caller's own rows; the patient_id
    // filter is the explicit version, so a mismatch answers 404 rather than
    // a blank.
    const { data: appointment } = await supabase
      .from("appointments")
      .select("id, category_id, payment_status")
      .eq("id", appointmentId)
      .eq("patient_id", user.id)
      .maybeSingle();
    if (!appointment) {
      return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
    }
    if (appointment.payment_status === "paid") {
      return NextResponse.json({ error: "This booking is already paid" }, { status: 400 });
    }
    priceCategoryId = appointment.category_id;
  }

  const listPricePaise = await readAppointmentServicePrice(admin, priceCategoryId);
  const result = await previewPromoCode(admin, {
    code,
    patientId: user.id,
    // With no booking yet there is nothing to exclude from the claim count,
    // and a uuid that matches nothing is the honest way to say so.
    appointmentId: appointmentId ?? EXCLUDES_NOTHING,
    listPricePaise,
  });

  if (!result.ok) {
    return NextResponse.json({ applies: false, message: result.message });
  }
  return NextResponse.json({
    applies: true,
    code: result.code,
    listPricePaise,
    discountPaise: result.outcome.discountPaise,
    payablePaise: result.outcome.payablePaise,
  });
}
