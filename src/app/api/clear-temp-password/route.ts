import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Called by the user themselves right after they set their own password via
// the forgot-password flow, so an admin-issued temp password stops being
// shown as "current" once it's no longer valid. Always acts on the caller's
// own id (from their session, never a client-supplied id) so there's no way
// to clear anyone else's.
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const admin = createAdminClient();
  if (profile?.role === "therapist") {
    await admin
      .from("therapist_admin_notes")
      .update({ temp_password: null, temp_password_set_at: null })
      .eq("therapist_id", user.id);
  } else if (profile?.role === "patient") {
    await admin
      .from("patient_admin_notes")
      .update({ temp_password: null, temp_password_set_at: null })
      .eq("patient_id", user.id);
  }

  return NextResponse.json({ success: true });
}
