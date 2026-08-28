import { NextRequest, NextResponse } from "next/server";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAdminActivity } from "@/lib/adminActivityLog";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { cancelAppointmentAndRefund } from "@/lib/cancelAppointment";

const MAX_REASON_LENGTH = 500;

export async function POST(request: NextRequest) {
  const adminUser = await requireAdminScope("sessions");
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: body, error: parseError } = await parseJsonBody<{
    appointmentId?: string;
    reason?: string;
    overridePayoutSettled?: boolean;
  }>(request);
  if (parseError) return parseError;
  const { appointmentId, reason, overridePayoutSettled } = body;
  if (!appointmentId) {
    return NextResponse.json({ error: "Missing appointmentId" }, { status: 400 });
  }
  if (reason && reason.length > MAX_REASON_LENGTH) {
    return NextResponse.json(
      { error: `Reason must be ${MAX_REASON_LENGTH} characters or less.` },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const result = await cancelAppointmentAndRefund(admin, {
    appointmentId,
    cancelledBy: adminUser.id,
    reason,
    overridePayoutSettled,
  });
  if ("error" in result) {
    return NextResponse.json(
      { error: result.error, payoutSettled: result.payoutSettled ?? false },
      { status: result.status }
    );
  }
  // Logged only once the cancellation has actually stuck --
  // cancelAppointmentAndRefund claims the row via CAS and returns an error
  // if it lost, so reaching here means this request is the one that
  // cancelled it. A cancellation may or may not move money; the refund
  // outcome is recorded either way so the log can tell them apart.
  await recordAdminActivity(admin, adminUser.id, {
    action: "session.cancel",
    targetId: appointmentId,
    details: {
      reason: reason?.trim() || null,
      refunded: result.refunded,
      refundFailed: result.refundFailed ?? false,
      overridePayoutSettled: !!overridePayoutSettled,
    },
  });

  return NextResponse.json({
    success: true,
    refunded: result.refunded,
    refundFailed: result.refundFailed ?? false,
  });
}
