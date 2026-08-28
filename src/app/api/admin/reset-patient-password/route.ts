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

  const { patientId } = await request.json();
  if (!patientId) {
    return NextResponse.json({ error: "Missing patientId" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: patient } = await admin
    .from("profiles")
    .select("id, email")
    .eq("id", patientId)
    .eq("role", "patient")
    .single();

  if (!patient) {
    return NextResponse.json({ error: "That account is not a patient" }, { status: 400 });
  }

  const password = generatePassword();
  const { error } = await admin.auth.admin.updateUserById(patientId, {
    password,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Kept visible to admins (not shown just once) so they can walk the
  // patient through logging in over a support call — cleared automatically
  // once the patient sets their own password via the forgot-password flow.
  await admin.from("patient_admin_notes").upsert({
    patient_id: patientId,
    temp_password: password,
    temp_password_set_at: new Date().toISOString(),
  });

  // The generated password is deliberately NOT in the log -- it is a live
  // credential, and admin_activity_log is read by every admin. That an
  // admin reset it, for whom, and when is the part worth keeping.
  await recordAdminActivity(admin, adminUser.id, {
    action: "account.reset_password",
    targetId: patientId,
    details: { role: "patient" },
  });

  return NextResponse.json({ email: patient.email, password });
}
