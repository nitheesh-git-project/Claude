import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { isProfileActive, isPatientProfile } from "@/lib/supabase/requireActiveProfile";
import { resolveCheckoutQuote } from "@/lib/checkoutQuote";
import { isGatewayPayable } from "@/lib/discounts";

// What this booking costs, as the payment screen will say it.
//
// This exists because the wizard used to print the category price on its own
// Pay button while `/api/razorpay/create-order` silently resolved a
// first-session offer behind it — so a patient owed ₹499 read "Pay ₹1,200
// Now" and watched a different figure appear in the Razorpay sheet. The
// figure on the button now comes from the same module the order does.
//
// A **read**: nothing is claimed and nothing is held, so being a moment
// stale costs nothing. The order that follows re-resolves under a row lock
// and refuses rather than charging something the patient was not quoted.
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
  // One account carries one role, and a session is delivered to a patient —
  // the same rule the four purchase routes enforce.
  if (!(await isPatientProfile(user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: body, error: parseError } = await parseJsonBody<{
    appointmentId?: string;
    categoryId?: string;
    promoCode?: string | null;
  }>(request);
  if (parseError) return parseError;

  // Either an existing booking or the category the wizard is about to book.
  // Both are needed: the wizard creates its appointment and pays for it in
  // one step, so at the moment the patient reads the price there is no row
  // yet — and quoting only where a row exists would put the figure on the
  // screen where it is least useful.
  const appointmentId = body.appointmentId?.trim();
  const categoryId = body.categoryId?.trim();
  if (!appointmentId && !categoryId) {
    return NextResponse.json({ error: "Missing appointmentId or categoryId" }, { status: 400 });
  }

  let appointment = {
    // A uuid no row can carry, for the "no booking yet" quote. Nothing is
    // excluded from a claim count and no goodwill can be found against it,
    // which is correct: neither exists before the row does.
    id: "00000000-0000-0000-0000-000000000000",
    patient_id: user.id,
    category_id: categoryId ?? null,
    visit_mode: "online" as string | null,
    travel_fee_paise: null as number | null,
  };

  if (appointmentId) {
    // RLS already scopes this to the caller's own rows; the patient_id
    // filter is the explicit version, so a mismatch answers 404 rather than
    // a blank.
    const { data: row } = await supabase
      .from("appointments")
      .select("id, patient_id, category_id, visit_mode, travel_fee_paise, payment_status")
      .eq("id", appointmentId)
      .eq("patient_id", user.id)
      .maybeSingle();
    if (!row) {
      return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
    }
    if (row.payment_status === "paid") {
      return NextResponse.json({ error: "This booking is already paid" }, { status: 400 });
    }
    appointment = {
      id: row.id,
      patient_id: row.patient_id,
      category_id: row.category_id,
      visit_mode: row.visit_mode,
      travel_fee_paise: row.travel_fee_paise,
    };
  }

  const quote = await resolveCheckoutQuote(createAdminClient(), {
    appointment,
    promoCode: typeof body.promoCode === "string" ? body.promoCode : null,
    claim: false,
  });

  return NextResponse.json({
    listPricePaise: quote.listPricePaise,
    discountPaise: quote.discountPaise,
    payablePaise: quote.payablePaise,
    travelFeePaise: quote.travelFeePaise,
    totalPaise: quote.totalPaise,
    discountLabel: quote.label,
    promoApplied: quote.source === "promo_code",
    promoError: quote.promoError,
    promoCodesEnabled: quote.promoCodesEnabled,
    // What the button should do. Named for the decision rather than for the
    // number, so the client is not left to re-implement the threshold.
    free: !isGatewayPayable(quote.totalPaise),
  });
}
