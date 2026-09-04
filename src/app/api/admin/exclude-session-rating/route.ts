import { NextRequest, NextResponse } from "next/server";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAdminActivity } from "@/lib/adminActivityLog";

// Excludes (or re-includes) one side's rating on one session from every
// computed average, without touching the rating or feedback text itself --
// audit-safe curation instead of fabricating a number. `excluded` is an
// explicit boolean rather than a blind toggle so a double-click or two open
// tabs can't flip it back and forth unpredictably.
export async function POST(request: NextRequest) {
  const adminUser = await requireAdminScope("sessions");
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { appointmentId, role, excluded } = await request.json();
  if (!appointmentId || (role !== "patient" && role !== "therapist") || typeof excluded !== "boolean") {
    return NextResponse.json(
      { error: "Missing appointmentId, invalid role, or missing excluded" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { data: appointment } = await admin
    .from("appointments")
    .select("id, patient_rating, therapist_rating")
    .eq("id", appointmentId)
    .single();
  if (!appointment) {
    return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
  }
  const currentRating = role === "patient" ? appointment.patient_rating : appointment.therapist_rating;
  if (currentRating === null) {
    return NextResponse.json(
      { error: "This session has no rating on that side to exclude." },
      { status: 400 }
    );
  }

  const column = role === "patient" ? "patient_rating_excluded" : "therapist_rating_excluded";
  const { error } = await admin
    .from("appointments")
    .update({ [column]: excluded })
    .eq("id", appointmentId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Who changed this, and to what. Best-effort and after the write,
  // per the audit-log rule in AGENTS.md.
  await recordAdminActivity(admin, adminUser.id, {
    action: "rating.exclude",
    targetId: appointmentId,
    details: { role, excluded },
  });

  return NextResponse.json({ success: true, excluded });
}
