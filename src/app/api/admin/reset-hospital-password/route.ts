import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAdminActivity } from "@/lib/adminActivityLog";

function generatePassword() {
  return crypto.randomBytes(9).toString("base64url");
}

export async function POST(request: NextRequest) {
  const adminUser = await requireAdminScope("people");
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { hospitalId } = await request.json();
  if (!hospitalId) {
    return NextResponse.json({ error: "Missing hospitalId" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: hospital } = await admin
    .from("profiles")
    .select("id, email")
    .eq("id", hospitalId)
    .eq("role", "hospital")
    .single();

  if (!hospital) {
    return NextResponse.json(
      { error: "That account is not a hospital partner" },
      { status: 400 }
    );
  }

  const password = generatePassword();
  const { error } = await admin.auth.admin.updateUserById(hospitalId, {
    password,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Kept visible to admins (not shown just once) so they can walk the
  // hospital contact through logging in over a support call — matches the
  // patient/therapist reset routes, which this one was missing before.
  await admin.from("hospital_admin_notes").upsert({
    hospital_id: hospitalId,
    temp_password: password,
    temp_password_set_at: new Date().toISOString(),
  });

  // The generated password is deliberately NOT in the log -- it is a live
  // credential, and admin_activity_log is read by every admin. That an
  // admin reset it, for whom, and when is the part worth keeping.
  await recordAdminActivity(admin, adminUser.id, {
    action: "account.reset_password",
    targetId: hospitalId,
    details: { role: "hospital" },
  });

  return NextResponse.json({ email: hospital.email, password });
}
