import { NextRequest, NextResponse } from "next/server";
import { getAdminUser } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  const adminUser = await getAdminUser();
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { appointmentId, therapistId } = await request.json();
  if (!appointmentId || !therapistId) {
    return NextResponse.json(
      { error: "Missing appointmentId or therapistId" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  const { data: therapist } = await admin
    .from("profiles")
    .select("id")
    .eq("id", therapistId)
    .eq("role", "therapist")
    .eq("approved", true)
    .single();

  if (!therapist) {
    return NextResponse.json(
      { error: "That therapist is not an approved therapist" },
      { status: 400 }
    );
  }

  const { error } = await admin
    .from("appointments")
    .update({ therapist_id: therapistId, status: "confirmed" })
    .eq("id", appointmentId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
