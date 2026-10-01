import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverError } from "@/lib/apiError";
import {
  computeTherapistPayoutSummary,
  type PayoutAppointment,
} from "@/lib/therapistPayouts";
import { readAllRows } from "@/lib/supabase/readAllRows";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("role, active, approved, revenue_share_percent, home_visit_revenue_share_percent")
    .eq("id", user.id)
    .single();
  if (profileError && profileError.code !== "PGRST116") {
    return NextResponse.json(
      { error: "We couldn't check your account just now. Please try again." },
      { status: 503 }
    );
  }
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
  //
  // Every read is checked and paged. The select below named a column that
  // does not exist (`cash_collected_paise`; the real one is
  // `cash_collected_amount_paise`), the error was discarded, and every
  // therapist was told "nothing owed" -- a failed read presented as a fact.
  const unsettledResult = await readAllRows<PayoutAppointment>(() =>
    admin
      .from("appointments")
      .select(
        "id, status, payment_status, amount_paid_paise, therapist_id, patient_id, category_id, slot_time, paid_at, therapist_payout_paid_at, therapist_payout_amount_paise, therapist_payout_method, therapist_payout_note, patient_rating, patient_feedback, therapist_rating, therapist_feedback, visit_mode, travel_fee_paise, cash_collected_at, cash_collected_amount_paise, cash_remitted_at"
      )
      .eq("therapist_id", user.id)
      .order("id", { ascending: true })
  );
  if (unsettledResult.error || unsettledResult.truncated) {
    console.error("request-payout: could not read sessions", unsettledResult.error);
    return NextResponse.json(
      { error: "We couldn't work out what you're owed just now. Please try again." },
      { status: 503 }
    );
  }
  const unsettled = unsettledResult.rows;

  // `payment_terms` / `amount_due_paise` are migration-dependent, so they are
  // read on their own and merged: folded into the select above, a database
  // without them would fail the whole query. An unknown-column error is that
  // case and reads as "every session prepaid"; any other failure refuses.
  const termsResult = await readAllRows<{
    id: string;
    payment_terms: string | null;
    amount_due_paise: number | null;
  }>(() =>
    admin
      .from("appointments")
      .select("id, payment_terms, amount_due_paise")
      .eq("therapist_id", user.id)
      .order("id", { ascending: true })
  );
  if (termsResult.error && (termsResult.error as { code?: string }).code !== "42703") {
    return NextResponse.json(
      { error: "We couldn't work out what you're owed just now. Please try again." },
      { status: 503 }
    );
  }
  const termsById = new Map(termsResult.rows.map((r) => [r.id, r]));

  const summary = computeTherapistPayoutSummary(
    user.id,
    profile.revenue_share_percent,
    unsettled.map((a) => ({
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
