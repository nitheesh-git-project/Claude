import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { recordAdminActivity } from "@/lib/adminActivityLog";
import { BAD_DEBT_EXPENSE_CATEGORY } from "@/lib/operatingCosts";
import {
  decideWriteOff,
  decideReverseWriteOff,
  writeOffRefusalMessage,
  reverseRefusalMessage,
  writeOffDescription,
  WRITE_OFF_REASON_MIN_CHARS,
} from "@/lib/payLaterWriteOff";

// Forgiving what a trusted patient owes for a session -- and taking that back.
//
// **A write-off is a cost, not a revenue reduction**, and everything below
// follows from that one sentence. Completion already counted the session as
// revenue and already made the therapist's share payable, and the therapist
// has been paid: they did the work and had no say in extending the credit. So
// nothing on the appointment's money columns moves. `amount_due_paise`,
// `amount_paid_paise` and `payment_status` are left exactly as they are, the
// session leaves the owed figure through `pay_later_outcome` alone, and the
// loss is recorded as one `business_expenses` row at the default cost class --
// bad debt is an operating expense, below the gross-profit line and not added
// back in EBITDA.
//
// `requireAdminScope("money")`, like every other route in this feature:
// deciding not to collect is a money capability whatever screen the control
// sits on.
//
// **A reason is required in both directions**, which is the opposite of the
// grant/revoke split on `set-patient-pay-later` and deliberately so. There the
// risk is all on one side -- extending credit. Here writing off gives money
// away, and reversing re-imposes a debt on a patient who has been told it was
// forgiven. Both are somebody's decision, and both get asked about later.
//
// The order of the two writes is the whole safety case. A session written off
// with no cost row behind it overstates profit by exactly the amount forgiven,
// which is worse than a write-off that failed -- so the appointment is claimed
// first, the cost row is written second, and a failure on the second puts the
// first back, the same posture `refund-session-partial` takes when Razorpay
// refuses.

type Body = { appointmentId?: string; writtenOff?: boolean; reason?: string };

const MAX_REASON_LENGTH = 500;

export async function POST(request: NextRequest) {
  const adminUser = await requireAdminScope("money");
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: body, error: parseError } = await parseJsonBody<Body>(request);
  if (parseError) return parseError;

  const appointmentId = body.appointmentId?.trim();
  if (!appointmentId) {
    return NextResponse.json({ error: "Missing appointmentId" }, { status: 400 });
  }

  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (reason.length < WRITE_OFF_REASON_MIN_CHARS) {
    return NextResponse.json(
      {
        error: `Say why, in at least ${WRITE_OFF_REASON_MIN_CHARS} characters. This is the only record of why the clinic stopped chasing this money.`,
      },
      { status: 400 }
    );
  }
  if (reason.length > MAX_REASON_LENGTH) {
    return NextResponse.json(
      { error: `Keep the reason to ${MAX_REASON_LENGTH} characters or fewer.` },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // `payment_terms`, `amount_due_paise` and `pay_later_outcome` are the newest
  // columns on this table, so they are read here together with the rest --
  // this route exists only because of them, so a database without them has
  // nothing for it to act on and the read failing is the honest answer.
  const { data: appointment, error: readError } = await admin
    .from("appointments")
    .select(
      "id, session_code, patient_id, status, payment_status, payment_terms, amount_due_paise, pay_later_outcome"
    )
    .eq("id", appointmentId)
    .maybeSingle();

  if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });
  if (!appointment) return NextResponse.json({ error: "Session not found." }, { status: 404 });

  return body.writtenOff === false
    ? reverse({ admin, adminUser, appointment, reason })
    : writeOff({ admin, adminUser, appointment, reason });
}

type Admin = ReturnType<typeof createAdminClient>;
type Appointment = {
  id: string;
  session_code: string | null;
  patient_id: string | null;
  status: string | null;
  payment_status: string | null;
  payment_terms: string | null;
  amount_due_paise: number | null;
  pay_later_outcome: string | null;
};

async function writeOff({
  admin,
  adminUser,
  appointment,
  reason,
}: {
  admin: Admin;
  adminUser: { id: string };
  appointment: Appointment;
  reason: string;
}) {
  const decision = decideWriteOff(appointment);
  if (!decision.allowed) {
    return NextResponse.json(
      { error: writeOffRefusalMessage(decision.reason) },
      { status: 409 }
    );
  }

  // Claimed on the outcome still being unset. A double tap, two open tabs or
  // two admins working the same patient must produce one write-off and one
  // cost row; only the caller whose update lands writes the loss.
  const { data: claimed, error: claimError } = await admin
    .from("appointments")
    .update({ pay_later_outcome: "written_off" })
    .eq("id", appointment.id)
    .is("pay_later_outcome", null)
    .select("id")
    .maybeSingle();

  if (claimError) return NextResponse.json({ error: claimError.message }, { status: 500 });
  if (!claimed) {
    return NextResponse.json(
      { error: "Somebody else answered this session a moment ago. Refresh and check." },
      { status: 409 }
    );
  }

  // Who it was owed by, for the line the Costs screen renders months later.
  // Best-effort: a name that could not be read costs the sentence a name, not
  // the clinic its record of the loss.
  const { data: patient } = appointment.patient_id
    ? await admin
        .from("profiles")
        .select("full_name")
        .eq("id", appointment.patient_id)
        .maybeSingle()
    : { data: null };

  // Dated today rather than back to the session. The decision is what creates
  // the cost, and back-dating it into a month somebody has already read moves
  // a profit figure under them -- the same reasoning that keeps `refunded_at`
  // un-backfilled.
  const incurredOn = new Date().toISOString().slice(0, 10);
  const base = {
    incurred_on: incurredOn,
    category: BAD_DEBT_EXPENSE_CATEGORY,
    description: writeOffDescription({
      patientName: patient?.full_name ?? null,
      sessionCode: appointment.session_code,
      reason,
    }),
    amount_paise: decision.amountPaise,
    created_by: adminUser.id,
  };

  let { data: expense, error: expenseError } = await admin
    .from("business_expenses")
    .insert({ ...base, source_appointment_id: appointment.id })
    .select("id")
    .single();

  // `source_appointment_id` is newer than the table, so a database that has
  // not had the migration applied refuses the whole insert over one column.
  // Recording the loss matters more than linking it, and the reconciliation
  // on System Health reads null rather than zero in that case -- "could not be
  // checked", never "the books agree". Retried only on an unknown-column
  // error; anything else is a real failure, including the unique index
  // refusing a second row for one session.
  if (expenseError && /source_appointment_id/i.test(expenseError.message ?? "")) {
    ({ data: expense, error: expenseError } = await admin
      .from("business_expenses")
      .insert(base)
      .select("id")
      .single());
  }

  if (expenseError || !expense) {
    // Put the session back. A written-off session with no cost row behind it
    // overstates profit by exactly the amount forgiven, and nothing on any
    // screen would say so -- so the failure that leaves no trace is the one
    // this reverts. Guarded on our own claim, so a concurrent write that
    // landed in between is not clobbered.
    const { error: revertError } = await admin
      .from("appointments")
      .update({ pay_later_outcome: null })
      .eq("id", appointment.id)
      .eq("pay_later_outcome", "written_off");
    if (revertError) {
      console.error(
        "Failed to revert a write-off claim after the cost row could not be written",
        appointment.id,
        revertError
      );
    }
    console.error("Could not record a bad debt", appointment.id, expenseError);
    return NextResponse.json(
      {
        error:
          "The loss could not be recorded as a cost, so nothing was written off. Try again - and if it keeps failing, tell an engineer.",
      },
      { status: 500 }
    );
  }

  await recordAdminActivity(admin, adminUser.id, {
    action: "pay_later.write_off",
    targetId: appointment.id,
    targetLabel: appointment.session_code,
    amountPaise: decision.amountPaise,
    details: {
      reason,
      patientId: appointment.patient_id,
      expenseId: expense.id,
      incurredOn,
    },
  });

  return NextResponse.json({
    success: true,
    writtenOffPaise: decision.amountPaise,
    expenseId: expense.id,
  });
}

async function reverse({
  admin,
  adminUser,
  appointment,
  reason,
}: {
  admin: Admin;
  adminUser: { id: string };
  appointment: Appointment;
  reason: string;
}) {
  const decision = decideReverseWriteOff(appointment);
  if (!decision.allowed) {
    return NextResponse.json(
      { error: reverseRefusalMessage(decision.reason) },
      { status: 409 }
    );
  }

  // Mirror of the write-off, in the same order and for the same reason: the
  // session comes back as owed first, and the cost row is removed second. The
  // failure this order protects against is the one nothing would notice -- a
  // cost row deleted while the session stays written off, which understates
  // what the clinic is owed and overstates its profit at the same time.
  const { data: claimed, error: claimError } = await admin
    .from("appointments")
    .update({ pay_later_outcome: null })
    .eq("id", appointment.id)
    .eq("pay_later_outcome", "written_off")
    .select("id")
    .maybeSingle();

  if (claimError) return NextResponse.json({ error: claimError.message }, { status: 500 });
  if (!claimed) {
    return NextResponse.json(
      { error: "Somebody else answered this session a moment ago. Refresh and check." },
      { status: 409 }
    );
  }

  const { data: removed, error: deleteError } = await admin
    .from("business_expenses")
    .delete()
    .eq("source_appointment_id", appointment.id)
    .select("id, amount_paise");

  // A delete that matched nothing is not a success, and a database without
  // the column cannot match at all -- both leave a bad debt in the books for
  // a session that is owed again, so both put the write-off back. The one
  // exception is a row whose link was already lost (`on delete set null`), and
  // that is indistinguishable from here, which is why the message says what to
  // check rather than claiming to know.
  if (deleteError || !removed || removed.length === 0) {
    const { error: revertError } = await admin
      .from("appointments")
      .update({ pay_later_outcome: "written_off" })
      .eq("id", appointment.id)
      .is("pay_later_outcome", null);
    if (revertError) {
      console.error(
        "Failed to re-apply a write-off after its cost row could not be removed",
        appointment.id,
        revertError
      );
    }
    console.error("Could not remove a bad debt", appointment.id, deleteError);
    return NextResponse.json(
      {
        error:
          "The cost recorded for this write-off could not be removed, so nothing was changed. Check Money → Costs for a Bad debt row against this session.",
      },
      { status: 500 }
    );
  }

  await recordAdminActivity(admin, adminUser.id, {
    action: "pay_later.reverse_write_off",
    targetId: appointment.id,
    targetLabel: appointment.session_code,
    amountPaise: removed[0]?.amount_paise ?? appointment.amount_due_paise ?? undefined,
    details: {
      reason,
      patientId: appointment.patient_id,
      removedExpenseIds: removed.map((r) => r.id),
    },
  });

  return NextResponse.json({ success: true, restoredPaise: removed[0]?.amount_paise ?? null });
}
