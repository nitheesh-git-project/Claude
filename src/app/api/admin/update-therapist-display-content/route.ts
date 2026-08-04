import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getAdminUser } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";

// Writes profiles.public_display_note -- the admin-curated blurb shown in
// the /team popup (Feature 38), distinct from therapist_admin_notes
// (private) and from `bio` (self-edited by the therapist).
export async function POST(request: NextRequest) {
  const adminUser = await getAdminUser();
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { therapistId, displayNote } = await request.json();
  if (!therapistId || typeof displayNote !== "string") {
    return NextResponse.json(
      { error: "Missing therapistId or displayNote" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ public_display_note: displayNote || null })
    .eq("id", therapistId)
    .eq("role", "therapist");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // /team is time-based ISR (revalidate = 300s) -- same reasoning as
  // set-therapist-team-visibility's own revalidatePath call: without this,
  // an admin editing this copy would see no change on the public page for
  // up to 5 minutes.
  revalidatePath("/team");

  return NextResponse.json({ success: true });
}
