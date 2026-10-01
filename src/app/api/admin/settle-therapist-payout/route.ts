import { NextRequest, NextResponse } from "next/server";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeNetPayout } from "@/lib/therapistCashLedger";
import {
  sessionTherapistCutPaise,
  type PayoutAppointment,
} from "@/lib/therapistPayouts";
import {
  ACTIVITY_LOG_WARNING,
  recordAdminActivity,
} from "@/lib/adminActivityLog";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { readAllRows } from "@/lib/supabase/readAllRows";
import { isTherapistShareEarned } from "@/lib/therapistPayouts";
import { linkOpenPayoutRequest } from "@/lib/payoutRequestLink";

type SettleRow = {
  id: string;
  status: string;
  payment_status: string;
  amount_paid_paise: number | null;
  visit_mode: string | null;
  travel_fee_paise: number | null;
};

/** The batch note, with the cash netted off it spelled out. */
function payoutNote(
  note: string | undefined,
  grossPaise: number,
  net: ReturnType<typeof computeNetPayout>
): string | null {
  if (net.cashHeldPaise <= 0) return note || null;
  return `${note ? `${note} - ` : ""}Gross owed ₹${(grossPaise / 100).toLocaleString(
    "en-IN"
  )}, netted against ₹${(net.cashHeldPaise / 100).toLocaleString("en-IN")} cash already held.${
    net.stillOwedToBusinessPaise > 0
      ? ` ₹${(net.stillOwedToBusinessPaise / 100).toLocaleString(
          "en-IN"
        )} of that cash is still owed back to the clinic and stays on the Cash Ledger.`
      : " That cash is now recorded as remitted."
  }`;
}

// "online" here means the admin already sent the money themselves (UPI,
// bank transfer) outside the platform and is logging it after the fact --
// same as "cash", just a different method label plus whatever reference
// they typed into the note field. There's no payment-provider integration
// behind this; it's record-keeping, not a real payout trigger.
const IMPLEMENTED_METHODS = ["cash", "online"];

export async function POST(request: NextRequest) {
  const adminUser = await requireAdminScope("money");
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: body, error: parseError } = await parseJsonBody<{
    therapistId?: string;
    method?: string;
    note?: string;
  }>(request);
  if (parseError) return parseError;
  const { therapistId, method, note } = body;
  if (!therapistId || !method) {
    return NextResponse.json(
      { error: "Missing therapistId or method" },
      { status: 400 }
    );
  }
  if (!IMPLEMENTED_METHODS.includes(method)) {
    return NextResponse.json(
      { error: "Online payouts aren't available yet - use cash for now." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  const { data: therapist } = await admin
    .from("profiles")
    .select("id, full_name, revenue_share_percent, home_visit_revenue_share_percent")
    .eq("id", therapistId)
    .eq("role", "therapist")
    .single();

  if (!therapist) {
    return NextResponse.json({ error: "Therapist not found" }, { status: 404 });
  }
  if (therapist.revenue_share_percent === null) {
    return NextResponse.json(
      { error: "Set this therapist's revenue share % before paying out." },
      { status: 400 }
    );
  }

  // Delivered and earned, through the same predicate the therapist's own
  // figure and their payout request use (isTherapistShareEarned): completed,
  // and either paid or on pay-later terms. This route used to ask for
  // `payment_status = 'paid'` alone, so a therapist's delivered pay-later
  // sessions were requested but could never be settled -- the clinic
  // recognises that work at completion, and so does the therapist's share.
  //
  // `status: 'completed'` still matters: a paid session not yet delivered
  // hasn't been earned, and settling it early would block the patient from
  // cancelling it (cancelAppointmentAndRefund refuses once a payout is
  // settled). visit_mode/travel_fee_paise ride along because a home visit's
  // payout is share-of-fee PLUS the travel fee in full.
  //
  // Paged and checked: a failed read is "try again", never "nothing owed".
  const unsettledResult = await readAllRows<SettleRow>(() =>
    admin
      .from("appointments")
      .select("id, status, payment_status, amount_paid_paise, visit_mode, travel_fee_paise")
      .eq("therapist_id", therapistId)
      .eq("status", "completed")
      .is("therapist_payout_paid_at", null)
      .order("id", { ascending: true })
  );
  if (unsettledResult.error || unsettledResult.truncated) {
    return NextResponse.json(
      { error: "Couldn't read this therapist's sessions just now. Nothing was paid -- try again." },
      { status: 503 }
    );
  }
  // payment_terms / amount_due_paise are migration-dependent, so they are
  // read on their own; an unknown-column error means every row is prepaid.
  const termsResult = await readAllRows<{
    id: string;
    payment_terms: string | null;
    amount_due_paise: number | null;
  }>(() =>
    admin
      .from("appointments")
      .select("id, payment_terms, amount_due_paise")
      .eq("therapist_id", therapistId)
      .eq("status", "completed")
      .is("therapist_payout_paid_at", null)
      .order("id", { ascending: true })
  );
  if (termsResult.error && (termsResult.error as { code?: string }).code !== "42703") {
    return NextResponse.json(
      { error: "Couldn't read this therapist's sessions just now. Nothing was paid -- try again." },
      { status: 503 }
    );
  }
  const termsById = new Map(termsResult.rows.map((r) => [r.id, r]));
  const unsettled = unsettledResult.rows
    .map((a) => ({
      ...a,
      payment_terms: termsById.get(a.id)?.payment_terms ?? null,
      amount_due_paise: termsById.get(a.id)?.amount_due_paise ?? null,
    }))
    .filter((a) => isTherapistShareEarned(a));

  if (unsettled.length === 0) {
    return NextResponse.json(
      { error: "There's nothing currently owed to this therapist." },
      { status: 400 }
    );
  }

  // Cash currently held by this therapist across ANY of their visits --
  // not scoped to the sessions being settled here, since the business
  // question is "how much should actually change hands right now" across
  // the whole relationship, not per-session. A visit whose cash was already
  // remitted (or never had cash collected) doesn't appear here.
  const { data: cashHeldRows, error: cashError } = await admin
    .from("appointments")
    .select("id, cash_collected_amount_paise")
    .eq("therapist_id", therapistId)
    .not("cash_collected_at", "is", null)
    .is("cash_remitted_at", null);
  if (cashError) {
    // Netting is the point of this route: settling without knowing the cash
    // the therapist holds would hand over money they have already taken.
    return NextResponse.json(
      { error: "Couldn't read the cash this therapist is holding. Nothing was paid -- try again." },
      { status: 503 }
    );
  }
  const cashHeldPaise = (cashHeldRows ?? []).reduce(
    (sum, r) => sum + (r.cash_collected_amount_paise ?? 0),
    0
  );
  const cashHeldIds = (cashHeldRows ?? []).map((r) => r.id);

  const paidAt = new Date().toISOString();

  // Atomic per-row claim, same pattern as cancelAppointmentAndRefund and
  // complete-session - the plain unconditional update this used to be let
  // two concurrent settle requests (two admins, or one admin with two open
  // tabs) both read the same unsettled set and both write payout data for
  // it. Both would then report "settled ₹X" back to their respective
  // admins, and since this route's whole point is telling an admin how
  // much *cash* to physically hand the therapist, that means real money
  // paid out twice for the same sessions - with no trace afterward, since
  // the second write just silently overwrote the first's record.
  // Guarding the write on therapist_payout_paid_at still being null closes
  // that: a losing claim settles nothing, and the response reflects
  // exactly what this request actually claimed, never a phantom amount.
  // One statement rather than a `Promise.all` of per-row updates. Each of
  // those was its own transaction, so a failure part-way left some sessions
  // settled against this batch and some not -- and the route then answered
  // 500, so the admin who had just been told how much cash to hand over did
  // not know whether any of it had been recorded, and a retry would settle
  // the remainder under a second batch id. The largest money-moving action in
  // the app was the least atomic one (audit item 8).
  //
  // The amounts are still computed **here**, by the one module that owns that
  // rule, and passed in. The database function is a writer rather than a
  // rule: a third copy of the cut arithmetic written in SQL would be exactly
  // the mistake item 126 had just corrected, with a longer fuse.
  const settlements = unsettled.map((a) => ({
    appointment_id: a.id,
    payout_paise: sessionTherapistCutPaise(
      a as unknown as PayoutAppointment,
      therapist.revenue_share_percent!,
      therapist.home_visit_revenue_share_percent ?? null
    ),
  }));
  const payoutById = new Map(settlements.map((x) => [x.appointment_id, x.payout_paise]));

  // The cash remittance rides inside the same call for the reason it exists:
  // deducting the cash *is* the remittance, and a settlement that recorded the
  // deduction without closing the collections let the next run net the same
  // rupees off again. Only when the payout fully absorbs the cash -- if the
  // therapist holds more than they are owed, `computeNetPayout` floors the
  // transfer at zero and the difference stays on the Cash Ledger as a real
  // debt the other way, which clearing these rows would erase.
  const willRemitCash =
    cashHeldPaise > 0 && cashHeldIds.length > 0
      ? computeNetPayout({
          owedPaise: settlements.reduce((sum, x) => sum + x.payout_paise, 0),
          cashHeldPaise,
        }).stillOwedToBusinessPaise === 0
      : false;

  // The batch is created at the amount this run is about to settle, with
  // its note already written -- not at zero and corrected afterwards. That
  // correction was a second write, and when it failed the sessions stayed
  // paid out against a receipt reading ₹0. The amount is only rewritten
  // below if a concurrent settle claimed some of these sessions first.
  const plannedGrossPaise = settlements.reduce((sum, x) => sum + x.payout_paise, 0);
  const planned = computeNetPayout({ owedPaise: plannedGrossPaise, cashHeldPaise });
  const plannedNote = payoutNote(note, plannedGrossPaise, planned);

  // If zero rows end up claimed (a losing race against a concurrent
  // settle), this becomes an orphaned batch with no linked sessions --
  // harmless, since buildTherapistPayoutReceipts only shows batches with at
  // least one linked appointment.
  const { data: batch, error: batchError } = await admin
    .from("therapist_payout_batches")
    .insert({
      therapist_id: therapistId,
      amount_paise: planned.netPayablePaise,
      method,
      note: plannedNote,
      settled_by: adminUser.id,
      created_at: paidAt,
    })
    .select("id")
    .single();
  if (batchError || !batch) {
    return NextResponse.json(
      { error: "Could not start this payout. Nothing was paid -- try again." },
      { status: 500 }
    );
  }

  const { data: settledRows, error: settleError } = await admin.rpc(
    "settle_therapist_payout_batch",
    {
      p_batch_id: batch.id,
      p_paid_at: paidAt,
      p_method: method,
      p_note: note || null,
      p_settlements: settlements,
      p_cash_remitted_ids: willRemitCash ? cashHeldIds : null,
    }
  );

  if (settleError) {
    // Nothing was written -- the whole statement rolled back -- so this is a
    // genuine "try again", not a partial payout to reconcile by hand.
    return NextResponse.json({ error: settleError.message }, { status: 500 });
  }

  const actuallySettled = ((settledRows ?? []) as { settled_id: string }[]).map((r) => ({
    claimed: true,
    payoutPaise: payoutById.get(r.settled_id) ?? 0,
  }));

  if (actuallySettled.length === 0) {
    // Leaves behind the empty batch row created above -- see its own
    // comment for why that's an accepted, harmless no-op rather than
    // something worth an extra round trip to clean up.
    return NextResponse.json(
      { error: "This payout was already settled - please refresh." },
      { status: 409 }
    );
  }

  const grossSettledPaise = actuallySettled.reduce((sum, c) => sum + c.payoutPaise, 0);
  const net = computeNetPayout({ owedPaise: grossSettledPaise, cashHeldPaise });

  // Only a partial claim (a concurrent settle got some sessions first)
  // changes the figure; the normal case wrote the right amount up front.
  let receiptWarning: string | null = null;
  if (grossSettledPaise !== plannedGrossPaise) {
    const { error: batchAmountError } = await admin
      .from("therapist_payout_batches")
      .update({
        amount_paise: net.netPayablePaise,
        note: payoutNote(note, grossSettledPaise, net),
      })
      .eq("id", batch.id);
    if (batchAmountError) {
      console.error("Failed to correct amount on payout batch", batch.id, batchAmountError);
      receiptWarning = `The sessions were settled, but this payout's receipt still shows ₹${(
        planned.netPayablePaise / 100
      ).toLocaleString("en-IN")} instead of ₹${(net.netPayablePaise / 100).toLocaleString(
        "en-IN"
      )}. Note it before closing this screen.`;
    }
  }

  // A payout answers the therapist's open request, if they have one. Linked
  // here so "completed" on a request always means a batch exists behind it
  // -- the therapist is told they have been paid only when they have.
  await linkOpenPayoutRequest(admin, {
    therapistId,
    batchId: batch.id,
    adminId: adminUser.id,
    completedAt: paidAt,
  });

  // The cash remittance happened inside the settlement call above, in the
  // same transaction as the claims. It used to be a separate best-effort
  // UPDATE down here, which is the exact shape item 8 is about: deducting the
  // cash *is* the remittance, so a settlement that recorded the deduction and
  // then failed to close the collections let the very next payout run net the
  // same rupees off again -- the therapist paying for the same cash twice,
  // with the Cash Ledger still asking an admin to chase money the business had
  // already taken back.
  //
  // `willRemitCash` above carries the one condition that has not changed: only
  // when the payout fully absorbs the cash. If the therapist holds MORE than
  // they are owed, `computeNetPayout` floors the transfer at zero and leaves
  // the difference as `stillOwedToBusinessPaise` -- a real debt the other way
  // that a person has to chase, and clearing those collections would erase the
  // only record of it. There is no honest way to part-remit an indivisible
  // per-visit amount, so that case stays on the Cash Ledger.

  // The single largest money-moving action in the app, and until now the
  // only one that left no trace of who ran it beyond
  // therapist_payout_batches.settled_by -- which says nothing about how much
  // moved or what it absorbed. Best-effort, like every other call to this:
  // the payout has already been claimed by this point, so a logging failure
  // must not be reported back as a failed settlement.
  const logged = await recordAdminActivity(admin, adminUser.id, {
    action: "payout.settle",
    targetId: therapistId,
    targetLabel: therapist.full_name,
    amountPaise: net.netPayablePaise,
    details: {
      batchId: batch.id,
      method,
      settledCount: actuallySettled.length,
      grossOwedPaise: grossSettledPaise,
      cashHeldPaise: net.cashHeldPaise,
      stillOwedToBusinessPaise: net.stillOwedToBusinessPaise,
    },
  });

  // The client's confirm dialog shows the balance as of page load, which
  // can be stale by the time this actually runs (e.g. a new payment landed,
  // or a concurrent request already claimed some of these sessions) - this
  // route reports back only what THIS request genuinely claimed, not an
  // echo of what the client asked for.
  return NextResponse.json({
    success: true,
    settledCount: actuallySettled.length,
    // What actually needs to change hands right now, after the cash net-off
    // -- the figure the confirmation banner should show as "paid".
    settledAmountPaise: net.netPayablePaise,
    grossOwedPaise: grossSettledPaise,
    cashHeldPaise: net.cashHeldPaise,
    // Money has left the clinic and cannot be recalled, so a failed audit
    // write is not something to swallow: nothing anywhere would record who
    // authorised the largest money move in the app. It still is not a failed
    // settlement -- the transfer happened -- so it rides back with the
    // success as a warning, the same shape SESSION_REVOKE_WARNING uses for
    // "the door is locked but they are still inside".
    ...(receiptWarning
      ? { warning: receiptWarning }
      : logged
        ? {}
        : { warning: ACTIVITY_LOG_WARNING }),
  });
}
