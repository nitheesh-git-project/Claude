import { NextRequest, NextResponse } from "next/server";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { recordAdminActivity } from "@/lib/adminActivityLog";

// Approves a pending self-serve signup. Handles both roles that go through
// the approval gate -- therapist applications and, since patients now wait
// on the same gate, patient registrations. The role filter is still there
// (rather than approving any id) so this can never be used to flip
// `approved` on an admin or hospital row.
export async function POST(request: NextRequest) {
  const adminUser = await requireAdminScope("people");
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { userId } = await request.json();
  if (!userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: updated, error } = await admin
    .from("profiles")
    .update({ approved: true })
    .eq("id", userId)
    .in("role", ["therapist", "patient"])
    .select("id, role")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!updated) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  // Only a therapist appears on /team, so only a therapist's row can have
  // changed what that page shows. A patient costs nothing here and would
  // throw away a cached page for no reason.
  if (updated.role === "therapist") revalidatePath("/team");

  await recordAdminActivity(admin, adminUser.id, {
    action: "account.approve",
    targetId: userId,
  });

  return NextResponse.json({ success: true });
}
