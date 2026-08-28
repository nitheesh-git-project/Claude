import { NextRequest, NextResponse } from "next/server";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
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
  return NextResponse.json({
    success: true,
    refunded: result.refunded,
    refundFailed: result.refundFailed ?? false,
  });
}
