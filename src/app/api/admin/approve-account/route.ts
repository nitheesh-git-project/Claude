import { NextRequest, NextResponse } from "next/server";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { recordAdminActivity } from "@/lib/adminActivityLog";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { serverError } from "@/lib/apiError";

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

  const { data: body, error: parseError } = await parseJsonBody<{
    userId?: string;
  }>(request);
  if (parseError) return parseError;
  const { userId } = body;
  if (!userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: updated, error } = await admin
    .from("profiles")
    .update({ approved: true })
    .eq("id", userId)
    .in("role", ["therapist", "patient"])
    // Only a pending account. If a decline holds the row's lock this waits,
    // and then finds the account gone rather than approving a deleted one.
    .eq("approved", false)
    .select("id, role")
    .maybeSingle();

  if (error) {
    return serverError("admin/approve-account", error);
  }
  if (!updated) {
    // Nothing pending to flip: either another admin approved it first (a
    // harmless repeat -- report success) or it was declined, and is gone.
    const { data: existing, error: readError } = await admin
      .from("profiles")
      .select("approved")
      .eq("id", userId)
      .in("role", ["therapist", "patient"])
      .maybeSingle();
    if (readError) return serverError("admin/approve-account (read)", readError);
    if (existing?.approved) {
      return NextResponse.json({ success: true, unchanged: true });
    }
    return NextResponse.json(
      { error: "This signup isn't waiting any more - it may have just been declined. Refresh to see the list." },
      { status: 404 }
    );
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
