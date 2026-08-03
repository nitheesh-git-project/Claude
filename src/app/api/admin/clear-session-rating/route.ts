import { NextRequest, NextResponse } from "next/server";
import { getAdminUser } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";

// Wipes one side's submitted rating/feedback so they can be prompted to
// re-rate (e.g. a therapist fat-fingered 5 stars instead of 2). Admin-only —
// there's no self-service edit once submitted, by design, so a wrong rating
// can only be corrected through this.
export async function POST(request: NextRequest) {
  const adminUser = await getAdminUser();
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { appointmentId, role } = await request.json();
  if (!appointmentId || (role !== "patient" && role !== "therapist")) {
    return NextResponse.json(
      { error: "Missing appointmentId or invalid role" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
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
