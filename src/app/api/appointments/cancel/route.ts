import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { cancelAppointmentAndRefund } from "@/lib/cancelAppointment";

const MAX_REASON_LENGTH = 500;

export async function POST(request: NextRequest) {
  const { data: body, error: parseError } = await parseJsonBody<{
    appointmentId?: string;
    reason?: string;
  }>(request);
  if (parseError) return parseError;
  const { appointmentId, reason } = body;
  if (!appointmentId) {
    return NextResponse.json({ error: "Missing appointmentId" }, { status: 400 });
  }
  if (reason && reason.length > MAX_REASON_LENGTH) {
    return NextResponse.json(
      { error: `Reason must be ${MAX_REASON_LENGTH} characters or less.` },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: appointment } = await admin
    .from("appointments")
    .select("id, patient_id")
    .eq("id", appointmentId)
    .single();
  if (!appointment || appointment.patient_id !== user.id) {
    return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
  }

  const result = await cancelAppointmentAndRefund(admin, {
    appointmentId,
    cancelledBy: user.id,
    reason,
  });
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({
    success: true,
    refunded: result.refunded,
    refundFailed: result.refundFailed ?? false,
  });
}
