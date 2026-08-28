import { NextRequest, NextResponse } from "next/server";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: NextRequest) {
  const adminUser = await requireAdminScope("people");
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { therapistId, phone, email } = await request.json();
  if (!therapistId || !email || !EMAIL_RE.test(email)) {
    return NextResponse.json(
      { error: "Missing therapistId or a valid email" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  const { data: therapist } = await admin
    .from("profiles")
    .select("id, email")
    .eq("id", therapistId)
    .eq("role", "therapist")
    .single();

  if (!therapist) {
    return NextResponse.json({ error: "Therapist not found" }, { status: 404 });
  }

  // profiles.email is a copy for display/lookup — auth.users.email is what
  // actually gates sign-in, so both have to move together or the therapist
  // ends up locked out (dashboard shows their new email, but they can only
  // still log in with the old one).
  if (email !== therapist.email) {
    const { error: authError } = await admin.auth.admin.updateUserById(therapistId, {
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
    .eq("id", therapistId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
