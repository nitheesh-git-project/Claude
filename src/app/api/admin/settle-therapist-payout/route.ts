import { NextRequest, NextResponse } from "next/server";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { SESSION_FEE_PAISE } from "@/lib/pricing";
import { computeNetPayout } from "@/lib/therapistCashLedger";
import { recordAdminActivity } from "@/lib/adminActivityLog";

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

  const { therapistId, method, note } = await request.json();
  if (!therapistId || !method) {
    return NextResponse.json(
      { error: "Missing therapistId or method" },
      { status: 400 }
    );
  }
  if (!IMPLEMENTED_METHODS.includes(method)) {
    return NextResponse.json(
      { error: "Online payouts aren't available yet — use cash for now." },
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

  // status: 'completed' matters, not just payment_status: 'paid' — a
  // still-upcoming session that happens to already be paid for hasn't been
  // delivered yet, and settling its payout early would then block the
  // patient from cancelling/refunding it (cancelAppointmentAndRefund
  // refuses once a payout is settled, to avoid an inconsistent ledger).
  //
  // visit_mode/travel_fee_paise are read here too -- a home visit's payout
  // is share-of-fee PLUS the travel fee in full (a pass-through
  // reimbursement, never revenue -- see homeVisitPricing.ts), which the
  // original version of this route didn't know existed and silently
  // under-paid.
  const { data: unsettled } = await admin
    .from("appointments")
    .select("id, amount_paid_paise, visit_mode, travel_fee_paise")
    .eq("therapist_id", therapistId)
    .eq("payment_status", "paid")
    .eq("status", "completed")
    .is("therapist_payout_paid_at", null);

  if (!unsettled || unsettled.length === 0) {
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
  const { data: cashHeldRows } = await admin
    .from("appointments")
    .select("id, cash_collected_amount_paise")
    .eq("therapist_id", therapistId)
    .not("cash_collected_at", "is", null)
    .is("cash_remitted_at", null);
  const cashHeldPaise = (cashHeldRows ?? []).reduce(
    (sum, r) => sum + (r.cash_collected_amount_paise ?? 0),
    0
  );
  const cashHeldIds = (cashHeldRows ?? []).map((r) => r.id);

  const paidAt = new Date().toISOString();

  // Created up front, before the per-row claims below -- if zero rows end
  // up actually claimed (a losing race against a concurrent settle), this
  // becomes an orphaned batch with no linked sessions. Harmless: it simply
  // never surfaces as a payout receipt (buildTherapistPayoutReceipts only
  // shows batches that have at least one linked appointment), and it's
  // cheaper to accept an occasional unused row than to conditionally
  // create the batch only after knowing the claim succeeded, which would
  // need a second write to attach it anyway.
  const { data: batch, error: batchError } = await admin
    .from("therapist_payout_batches")
    .insert({
      therapist_id: therapistId,
      amount_paise: 0, // corrected below once the real claimed total is known
      method,
      note: note || null,
      settled_by: adminUser.id,
      created_at: paidAt,
    })
    .select("id")
    .single();
  if (batchError || !batch) {
    return NextResponse.json(
      { error: batchError?.message ?? "Could not start this payout." },
      { status: 500 }
    );
  }

  // Atomic per-row claim, same pattern as cancelAppointmentAndRefund and
  // complete-session — the plain unconditional update this used to be let
  // two concurrent settle requests (two admins, or one admin with two open
  // tabs) both read the same unsettled set and both write payout data for
  // it. Both would then report "settled ₹X" back to their respective
  // admins, and since this route's whole point is telling an admin how
  // much *cash* to physically hand the therapist, that means real money
  // paid out twice for the same sessions — with no trace afterward, since
  // the second write just silently overwrote the first's record.
  // Guarding the write on therapist_payout_paid_at still being null closes
  // that: a losing claim settles nothing, and the response reflects
  // exactly what this request actually claimed, never a phantom amount.
  const claims = await Promise.all(
    unsettled.map(async (a) => {
      const isHomeVisit = a.visit_mode === "home_visit";
      const effectiveShare = isHomeVisit
        ? therapist.home_visit_revenue_share_percent ?? therapist.revenue_share_percent!
        : therapist.revenue_share_percent!;
      const paidPaise = a.amount_paid_paise ?? SESSION_FEE_PAISE;
      const travelPaise = isHomeVisit ? Math.max(0, a.travel_fee_paise ?? 0) : 0;
      const payoutPaise = Math.round((paidPaise * effectiveShare) / 100) + travelPaise;
      const { data: claimed, error } = await admin
        .from("appointments")
        .update({
          therapist_payout_paid_at: paidAt,
          // Per-session amount stays the full gross figure (share + travel)
          // regardless of any cash net-off below -- this is what that
          // specific session was worth, for receipts and the therapist's
          // own Earnings tab. The net-off only affects how much of the
          // total actually needs to change hands via this batch.
          therapist_payout_amount_paise: payoutPaise,
          therapist_payout_method: method,
          therapist_payout_note: note || null,
          therapist_payout_batch_id: batch.id,
        })
        .eq("id", a.id)
        .is("therapist_payout_paid_at", null)
        .select("id")
        .maybeSingle();
      return { error, claimed: !!claimed, payoutPaise };
    })
  );

  const failed = claims.find((c) => c.error);
  if (failed?.error) {
    return NextResponse.json({ error: failed.error.message }, { status: 500 });
  }

  const actuallySettled = claims.filter((c) => c.claimed);
  if (actuallySettled.length === 0) {
    // Leaves behind the empty batch row created above -- see its own
    // comment for why that's an accepted, harmless no-op rather than
    // something worth an extra round trip to clean up.
    return NextResponse.json(
      { error: "This payout was already settled — please refresh." },
      { status: 409 }
    );
  }

  const grossSettledPaise = actuallySettled.reduce((sum, c) => sum + c.payoutPaise, 0);
  const net = computeNetPayout({ owedPaise: grossSettledPaise, cashHeldPaise });

  // The batch records what actually changes hands via this settlement --
  // net of cash the therapist is already holding, not the gross session
  // total. Without this, "settle payout" would tell an admin to hand over
  // money the therapist has, in effect, already taken at the door.
  const noteWithCashContext =
    net.cashHeldPaise > 0
      ? `${note ? `${note} — ` : ""}Gross owed ₹${(grossSettledPaise / 100).toLocaleString(
          "en-IN"
        )}, netted against ₹${(net.cashHeldPaise / 100).toLocaleString(
          "en-IN"
        )} cash already held.${
          net.stillOwedToBusinessPaise > 0
            ? ` ₹${(net.stillOwedToBusinessPaise / 100).toLocaleString(
                "en-IN"
              )} of that cash is still owed back to the clinic and stays on the Cash Ledger.`
            : " That cash is now recorded as remitted."
        }`
      : note || null;

  const { error: batchAmountError } = await admin
    .from("therapist_payout_batches")
    .update({ amount_paise: net.netPayablePaise, note: noteWithCashContext })
    .eq("id", batch.id);
  if (batchAmountError) {
    console.error("Failed to set final amount on payout batch", batch.id, batchAmountError);
  }

  // Deducting the cash IS the remittance, so the visits it came from have to
  // be closed out here. Without this the collection stayed open after being
  // netted off, and the very next payout run netted the same rupees off
  // again -- the therapist paid for the same cash twice, and the Cash Ledger
  // went on asking an admin to chase money the business had already taken
  // back. Only ever the rows whose amounts went into `cashHeldPaise` above,
  // and only when a deduction actually happened.
  //
  // Same CAS guard as mark-cash-remitted: the `is null` filter means a
  // concurrent remittance wins and this one silently no-ops rather than
  // overwriting someone else's timestamp. Best-effort like the batch amount
  // above -- the payout itself has already been claimed by this point, so a
  // failure here must be logged for reconciliation, not thrown back at an
  // admin who would then retry a settlement that already happened.
  // Only when the payout fully absorbs the cash. If the therapist is holding
  // MORE than they are owed, computeNetPayout floors the transfer at zero and
  // leaves the difference as stillOwedToBusinessPaise -- a real debt the other
  // way that a person has to chase. Clearing those collections here would
  // erase the only record of it, and there is no honest way to part-remit an
  // indivisible per-visit amount, so that case stays on the Cash Ledger.
  if (net.cashHeldPaise > 0 && cashHeldIds.length > 0 && net.stillOwedToBusinessPaise === 0) {
    const { error: remitError } = await admin
      .from("appointments")
      .update({ cash_remitted_at: paidAt })
      .in("id", cashHeldIds)
      .is("cash_remitted_at", null);
    if (remitError) {
      console.error(
        "Payout settled but cash could not be marked remitted — reconcile by hand",
        { batchId: batch.id, therapistId, cashHeldIds },
        remitError
      );
    }
  }

  // The single largest money-moving action in the app, and until now the
  // only one that left no trace of who ran it beyond
  // therapist_payout_batches.settled_by -- which says nothing about how much
  // moved or what it absorbed. Best-effort, like every other call to this:
  // the payout has already been claimed by this point, so a logging failure
  // must not be reported back as a failed settlement.
  await recordAdminActivity(admin, adminUser.id, {
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
  // or a concurrent request already claimed some of these sessions) — this
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
  });
}
