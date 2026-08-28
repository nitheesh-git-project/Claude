import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";

function generatePassword() {
  return crypto.randomBytes(9).toString("base64url");
}

export async function POST(request: NextRequest) {
  const adminUser = await requireAdminScope("people");
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
    .select("id, email")
    .eq("id", therapistId)
    .eq("role", "therapist")
    .single();

  if (!therapist) {
    return NextResponse.json({ error: "That account is not a therapist" }, { status: 400 });
  }

  const password = generatePassword();
  const { error } = await admin.auth.admin.updateUserById(therapistId, {
    password,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Kept visible to admins (not shown just once) so they can walk the
  // therapist through logging in over a support call — cleared
  // automatically once they set their own password via forgot-password.
  await admin.from("therapist_admin_notes").upsert({
    therapist_id: therapistId,
    temp_password: password,
    temp_password_set_at: new Date().toISOString(),
  });

  return NextResponse.json({ email: therapist.email, password });
}
