import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  const { appointmentId, rating, feedback } = await request.json();
  if (!appointmentId || !rating) {
    return NextResponse.json(
      { error: "Missing appointmentId or rating" },
      { status: 400 }
    );
  }
  const ratingNum = Number(rating);
  if (!Number.isInteger(ratingNum) || ratingNum < 1 || ratingNum > 5) {
    return NextResponse.json({ error: "Rating must be 1-5" }, { status: 400 });
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
    .select("id, patient_id, status, patient_rating")
    .eq("id", appointmentId)
    .single();

  if (!appointment) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  if (appointment.patient_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (appointment.status !== "completed") {
    return NextResponse.json(
      { error: "This session isn't marked completed yet." },
      { status: 400 }
    );
  }
  if (appointment.patient_rating !== null) {
    return NextResponse.json(
      { error: "You've already rated this session." },
      { status: 400 }
    );
  }

  const { error } = await admin
    .from("appointments")
    .update({
      patient_rating: ratingNum,
      patient_feedback: feedback && String(feedback).trim() ? String(feedback).trim() : null,
      patient_feedback_at: new Date().toISOString(),
    })
    .eq("id", appointmentId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
