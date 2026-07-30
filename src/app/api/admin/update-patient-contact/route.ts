import { NextRequest, NextResponse } from "next/server";
import { getAdminUser } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: NextRequest) {
  const adminUser = await getAdminUser();
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { patientId, phone, email } = await request.json();
  if (!patientId || !email || !EMAIL_RE.test(email)) {
    return NextResponse.json(
      { error: "Missing patientId or a valid email" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  const { data: patient } = await admin
    .from("profiles")
    .select("id, email")
    .eq("id", patientId)
    .eq("role", "patient")
    .single();

  if (!patient) {
    return NextResponse.json({ error: "Patient not found" }, { status: 404 });
  }

  // profiles.email is a copy for display/lookup — auth.users.email is what
  // actually gates sign-in, so both have to move together or the patient
  // ends up locked out (dashboard shows their new email, but they can only
  // still log in with the old one).
  if (email !== patient.email) {
    const { error: authError } = await admin.auth.admin.updateUserById(patientId, {
      email,
      email_confirm: true,
    });
    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 500 });
    }
  }

  const { error } = await admin
    .from("profiles")
    .update({ email, phone: phone || null })
    .eq("id", patientId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
