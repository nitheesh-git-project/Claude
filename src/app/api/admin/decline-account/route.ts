import { NextRequest, NextResponse } from "next/server";
import { getAdminUser } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";

// Declines a pending self-serve signup -- therapist application or patient
// registration. Same role filter as approve-account: only an account that is
// actually sitting in the pending list can be declined here, so an admin or
// hospital row (or an already-approved user) can never be deleted through
// this route.
export async function POST(request: NextRequest) {
  const adminUser = await getAdminUser();
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { userId } = await request.json();
  if (!userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: pending } = await admin
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .in("role", ["therapist", "patient"])
    .eq("approved", false)
    .maybeSingle();

  if (!pending) {
    return NextResponse.json({ error: "Pending account not found" }, { status: 404 });
  }

  // Deleting the auth user cascades to the profiles row (profiles.id
  // references auth.users(id) on delete cascade) -- a declined signup
  // has no path forward, so there's nothing to keep around, unlike an
  // approved-then-suspended account.
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
