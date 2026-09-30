import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverError } from "@/lib/apiError";
import {
  computeTherapistPayoutSummary,
  type PayoutAppointment,
} from "@/lib/therapistPayouts";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("role, active, revenue_share_percent, home_visit_revenue_share_percent")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "therapist") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (profile.active === false) {
    return NextResponse.json({ error: "Your account has been suspended." }, { status: 403 });
  }
  if (profile.revenue_share_percent === null) {
    return NextResponse.json(
      { error: "Ask admin to set your revenue share % before requesting a payout." },
      { status: 400 }
    );
  }

  // Recomputed here, server-side -- never trust a client-sent amount for real
  // money -- and recomputed through `computeTherapistPayoutSummary`, which is
  // the one place that rule lives.
  //
  // It used to be a local reduce over `amount_paid_paise * revenue_share_percent`,
  // which is the same arithmetic the therapist's own profile carried and which
  // was corrected there: it has **no home-visit branch and no travel fee**, so
  // a therapist who does visits requested a figure that disagreed with what
  // Money -> Payouts owes them and with what the Pay button transfers. It also
  // silently dropped a delivered **pay-later** session, since that filter asks
  // for `payment_status = 'paid'` and a session on terms never is -- so the one
  // therapist population the clinic deliberately carries the gap for was the
  // one whose request came up short.
  //
  // The helper nets cash the therapist is already holding, which is what
  // settling actually transfers; requesting the gross would ask for money some
  // of which is in their own pocket.
  const { data: unsettled } = await admin
    .from("appointments")
    .select(
      "id, status, payment_status, amount_paid_paise, therapist_id, patient_id, category_id, slot_time, paid_at, therapist_payout_paid_at, therapist_payout_amount_paise, therapist_payout_method, therapist_payout_note, patient_rating, patient_feedback, therapist_rating, therapist_feedback, visit_mode, travel_fee_paise, cash_collected_at, cash_collected_paise, cash_remitted_at"
    )
    .eq("therapist_id", user.id);

  // `payment_terms` / `amount_due_paise` are migration-dependent, so they are
  // read on their own and merged: folded into the select above, a database
  // without them would fail the whole query and this route would report
  // nothing owed to a therapist who is owed.
  const { data: termRows } = await admin
    .from("appointments")
    .select("id, payment_terms, amount_due_paise")
    .eq("therapist_id", user.id);
  const termsById = new Map((termRows ?? []).map((r) => [r.id, r]));

  const summary = computeTherapistPayoutSummary(
    user.id,
    profile.revenue_share_percent,
    (unsettled ?? []).map((a) => ({
      ...a,
      payment_terms: termsById.get(a.id)?.payment_terms ?? null,
      amount_due_paise: termsById.get(a.id)?.amount_due_paise ?? null,
    })) as PayoutAppointment[],
    Date.now(),
    profile.home_visit_revenue_share_percent ?? null
  );
  const owedPaise = summary.netOwedPaise;
  if (owedPaise <= 0) {
    return NextResponse.json(
      { error: "There's nothing currently owed to you yet." },
      { status: 400 }
    );
  }

  const { data: inserted, error } = await admin
    .from("therapist_payout_requests")
    .insert({ therapist_id: user.id, requested_amount_paise: owedPaise })
    .select("id")
    .single();

  if (error) {
    // Unique violation on payout_requests_one_pending_idx -- a request is
    // already open for this therapist.
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "You already have a pending payout request." },
        { status: 409 }
      );
    }
    return serverError("therapist/request-payout", error);
  }

  return NextResponse.json({ success: true, requestId: inserted.id, requestedAmountPaise: owedPaise });
}
