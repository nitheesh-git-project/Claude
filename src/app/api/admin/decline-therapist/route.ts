import { NextRequest, NextResponse } from "next/server";
import { getAdminUser } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  const adminUser = await getAdminUser();
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { therapistId } = await request.json();
  if (!therapistId) {
    return NextResponse.json({ error: "Missing therapistId" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: therapist } = await admin
    .from("profiles")
    .select("id")
    .eq("id", therapistId)
    .eq("role", "therapist")
    .eq("approved", false)
    .maybeSingle();

  if (!therapist) {
    return NextResponse.json({ error: "Pending therapist not found" }, { status: 404 });
  }

  // Deleting the auth user cascades to the profiles row (profiles.id
  // references auth.users(id) on delete cascade) -- a declined application
  // has no path forward, so there's nothing to keep around, unlike an
  // approved-then-suspended account.
  const { error } = await admin.auth.admin.deleteUser(therapistId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
