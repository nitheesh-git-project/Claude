import { NextRequest, NextResponse } from "next/server";
import { getAdminUser } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  const adminUser = await getAdminUser();
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { therapistId, visibleOnTeam } = await request.json();
  if (!therapistId || typeof visibleOnTeam !== "boolean") {
    return NextResponse.json(
      { error: "Missing therapistId or visibleOnTeam" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ visible_on_team: visibleOnTeam })
    .eq("id", therapistId)
    .eq("role", "therapist");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, visibleOnTeam });
}
