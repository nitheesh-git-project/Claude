import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { recordAdminActivity } from "@/lib/adminActivityLog";
import { readPayLaterEnabled } from "@/lib/payLaterSettingsServer";

const MIN_REASON_LENGTH = 10;

// Letting one patient be treated first and settle afterwards.
//
// `money` scope, not `people`. The capability decides the section rather than
// where the button sits: this is the clinic extending credit, and every desk
// that manages People can already edit a phone number. It is also why the
// control on the patient's profile computes `scopeCanManage(scope, "money")`
// for itself rather than reusing that screen's `canSeeMoney`, which is the
// looser `scopeCanOpen`.
//
// Four rules:
//
// 1. **A mandatory reason to grant, none to stop.** Ten characters, enforced
//    here and by `profiles_pay_later_needs_reason`. Granting is the act with
//    a consequence nobody else can see later -- there is no ceiling on what a
//    trusted patient may owe, so this sentence is the whole record of why the
//    clinic took that on. Stopping needs none: taxing the safe direction with
//    a sentence meaning "fine" is how a reason column fills up with "ok".
//    (Note this is the opposite split from the care-plan review, where the
//    reason attaches to the outcome that takes something away. The thing
//    being explained is the risk, and here the risk is the grant.)
// 2. **Never a hospital-referred patient.** A partner's commission is taken
//    on net revenue and revenue is recognised at completion, so terms would
//    have the clinic owing a cut on money it has not received. Deferring the
//    partner's share to settlement instead would break the identity the books
//    already depend on (`clinic share = net - therapist - partner`), which is
//    worse than the problem. These are commercial referrals, not the clinic's
//    own long-standing patients.
// 3. **Revoking stops new bookings and nothing else.** Sessions already
//    booked keep their terms and still enter the owed list when they are
//    delivered. Retroactively demanding payment for sessions already agreed
//    is not a thing this route may do, and money already owed stays owed,
//    listed and settleable -- a stop that strands a debt is worse than no
//    stop.
// 4. **Idempotent.** A double tap finds the row already in that state and
//    answers success rather than writing a second audit row, which is the
//    difference between a log that records decisions and one that records
//    clicks.
export async function POST(request: NextRequest) {
  const adminUser = await requireAdminScope("money");
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: body, error: parseError } = await parseJsonBody<{
    patientId?: string;
    enabled?: boolean;
    reason?: string;
  }>(request);
  if (parseError) return parseError;
  const { patientId, enabled, reason } = body;

  if (!patientId || typeof enabled !== "boolean") {
    return NextResponse.json({ error: "Missing patientId or enabled" }, { status: 400 });
  }

  const trimmedReason = typeof reason === "string" ? reason.trim() : "";
  if (enabled && trimmedReason.length < MIN_REASON_LENGTH) {
    return NextResponse.json(
      {
        error: `Say why this patient may pay later, in at least ${MIN_REASON_LENGTH} characters. It is the only record of why the clinic took this on.`,
      },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // The master switch gates granting, never stopping: an admin must always be
  // able to close this down, whatever the setting says or fails to say.
  if (enabled && !(await readPayLaterEnabled(admin))) {
    return NextResponse.json(
      {
        error:
          "Pay later is switched off for the whole clinic. Turn it on under Money - Owed by Patients first.",
      },
      { status: 409 }
    );
  }

  const { data: patient, error: readError } = await admin
    .from("profiles")
    .select("id, full_name, role, pay_later_enabled, referred_by_hospital_id")
    .eq("id", patientId)
    .maybeSingle();

  if (readError) {
    return NextResponse.json({ error: readError.message }, { status: 500 });
  }
  if (!patient || patient.role !== "patient") {
    return NextResponse.json({ error: "Patient not found" }, { status: 404 });
  }

  if (enabled && patient.referred_by_hospital_id) {
    return NextResponse.json(
      {
        error:
          "This patient was referred by a partner hospital, and that partner earns a share of the revenue as soon as a session is delivered. Pay later would have the clinic paying that share out of money it has not been given yet, so it is not offered here.",
      },
      { status: 409 }
    );
  }

  // Already where the caller wants it. Answer success and write nothing --
  // see rule 4 above.
  if (patient.pay_later_enabled === enabled) {
    return NextResponse.json({ success: true, enabled, unchanged: true });
  }

  // Compare-and-swap on the value this request believes is current, so two
  // admins acting at once cannot both write and both log.
  const { data: updated, error } = await admin
    .from("profiles")
    .update(
      enabled
        ? {
            pay_later_enabled: true,
            pay_later_reason: trimmedReason,
            pay_later_granted_by: adminUser.id,
            pay_later_granted_at: new Date().toISOString(),
          }
        : // The reason, the grantor and the date are left exactly as they
          // were: they record that terms were once given and by whom, which
          // stays true after they are stopped.
          { pay_later_enabled: false }
    )
    .eq("id", patientId)
    .eq("role", "patient")
    .eq("pay_later_enabled", !enabled)
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!updated) {
    // Somebody else got there first between the read and the write.
    return NextResponse.json(
      { error: "Somebody else changed this a moment ago. Reload and try again." },
      { status: 409 }
    );
  }

  // After the claim, so the log cannot record a change that lost its race.
  // The reason is recorded because it is the point of the row; a patient's
  // name is already snapshotted by the log's own target label.
  await recordAdminActivity(admin, adminUser.id, {
    action: "patient.set_pay_later",
    targetId: patientId,
    targetLabel: patient.full_name ?? undefined,
    details: enabled ? { enabled, reason: trimmedReason } : { enabled },
  });

  return NextResponse.json({ success: true, enabled });
}
