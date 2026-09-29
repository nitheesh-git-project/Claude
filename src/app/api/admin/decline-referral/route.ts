import { NextRequest, NextResponse } from "next/server";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAdminActivity } from "@/lib/adminActivityLog";
import { parseJsonBody } from "@/lib/parseJsonBody";

export async function POST(request: NextRequest) {
  const adminUser = await requireAdminScope("people");
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: body, error: parseError } = await parseJsonBody<{
    referralId?: string;
    reason?: string;
  }>(request);
  if (parseError) return parseError;
  const { referralId } = body;
  if (!referralId) {
    return NextResponse.json({ error: "Missing referralId" }, { status: 400 });
  }

  // Declining is the one outcome here that takes something away -- from the
  // partner who sent the patient, and from the patient, who is now not
  // being seen. It recorded nothing but a status word, so the hospital read
  // "Declined" and could not tell a wrong-specialty referral from a
  // capacity problem that would pass by Thursday, and the clinic lost the
  // one chance it had to say "send these to us, not those". Same ten-
  // character floor as every other reason in this codebase, and enforced by
  // the column's CHECK as well as here.
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (reason.length < 10) {
    return NextResponse.json(
      {
        error:
          "Give a reason of at least 10 characters - the hospital reads this, and it is what tells them what to send instead.",
      },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  const { data: referral } = await admin
    .from("patient_referrals")
    .select("status")
    .eq("id", referralId)
    .single();

  if (!referral) {
    return NextResponse.json({ error: "Referral not found" }, { status: 404 });
  }
  if (referral.status === "invite_sent" || referral.status === "converted") {
    return NextResponse.json(
      { error: "An invite has already been sent for this referral, so it can't be declined" },
      { status: 400 }
    );
  }

  // Atomic claim: the read above could be stale by the time this write
  // lands - e.g. an admin sends an invite (assign-referral) in the moment
  // between this route's read and write, which would otherwise let this
  // write silently flip status back to 'declined' even though a live
  // invite link now exists for the patient. Requiring status still be in
  // the pre-invite set at write time closes that.
  const { data: updated, error } = await admin
    .from("patient_referrals")
    .update({
      status: "declined",
      decline_reason: reason,
      declined_at: new Date().toISOString(),
      declined_by: adminUser.id,
    })
    .eq("id", referralId)
    .in("status", ["pending_review", "therapist_assigned"])
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!updated) {
    return NextResponse.json(
      { error: "An invite has already been sent for this referral, so it can't be declined" },
      { status: 400 }
    );
  }

  await recordAdminActivity(admin, adminUser.id, {
    action: "referral.decline",
    targetId: referralId,
    // The reason is the actionable half of this decision and the log is
    // where a dispute is read from months later, so it is recorded rather
    // than only delivered. It is about a referral rather than about a
    // person, so the note-length rule that keeps free text about patients
    // out of the log does not apply.
    details: { reason },
  });

  return NextResponse.json({ success: true });
}
