import { NextRequest, NextResponse } from "next/server";
import { getAdminUser } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";

// Wipes one side's submitted rating/feedback so they can be prompted to
// re-rate (e.g. a therapist fat-fingered 5 stars instead of 2). Admin-only —
// there's no self-service edit once submitted, by design, so a wrong rating
// can only be corrected through this.
export async function POST(request: NextRequest) {
  const adminUser = await getAdminUser();
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: body, error: parseError } = await parseJsonBody<{
    appointmentId?: string;
    role?: string;
  }>(request);
  if (parseError) return parseError;
  const { appointmentId, role } = body;
  if (!appointmentId || (role !== "patient" && role !== "therapist")) {
    return NextResponse.json(
      { error: "Missing appointmentId or invalid role" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { data: appointment } = await admin
    .from("appointments")
    .select("id")
    .eq("id", appointmentId)
    .single();
  if (!appointment) {
    return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
  }

  const updates =
    role === "patient"
      ? { patient_rating: null, patient_feedback: null, patient_feedback_at: null }
      : { therapist_rating: null, therapist_feedback: null, therapist_feedback_at: null };

  const { error } = await admin.from("appointments").update(updates).eq("id", appointmentId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
