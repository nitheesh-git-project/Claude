import { NextRequest, NextResponse } from "next/server";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAdminActivity } from "@/lib/adminActivityLog";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { serverError } from "@/lib/apiError";

// Declines a pending self-serve signup -- therapist application or patient
// registration. Same role filter as approve-account: only an account that is
// actually sitting in the pending list can be declined here, so an admin or
// hospital row (or an already-approved user) can never be deleted through
// this route. The check and the delete are one locked database statement,
// so "already approved" holds even when the approval lands mid-request.
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
  // One locked statement: the pending check and the delete cannot be split
  // by another admin approving in between (decline_pending_account in
  // schema.sql). This used to read, then delete through the auth API in a
  // second call -- and an approve landing between them was erased.
  const { data: outcome, error } = await admin.rpc("decline_pending_account", {
    p_user_id: userId,
  });
  if (error) {
    // No fallback to the old read-then-delete: that is the race this
    // replaced. A database without the function says so instead.
    if (error.code === "PGRST202" || error.code === "42883") {
      return NextResponse.json(
        {
          error:
            "The account-approval database update hasn't been applied yet. Ask an admin to re-run supabase/schema.sql.",
        },
        { status: 503 }
      );
    }
    return serverError("admin/decline-account", error);
  }
  if (outcome === "not_found") {
    return NextResponse.json({ error: "Pending account not found" }, { status: 404 });
  }
  if (outcome !== "declined") {
    return NextResponse.json(
      {
        error:
          "This account was approved a moment ago, so it can't be declined from here. Refresh to see it. To remove an approved account, suspend or delete it from its profile.",
      },
      { status: 409 }
    );
  }

  // No /team invalidation here, unlike approve: a declined account is by
  // definition still unapproved, and the public view requires `approved`, so
  // it was never on that page to remove.
  await recordAdminActivity(admin, adminUser.id, {
    action: "account.decline",
    targetId: userId,
  });

  return NextResponse.json({ success: true });
}
