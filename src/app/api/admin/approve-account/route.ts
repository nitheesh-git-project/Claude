import { NextRequest, NextResponse } from "next/server";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { recordAdminActivity } from "@/lib/adminActivityLog";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { serverError } from "@/lib/apiError";
import { scopeCanManage } from "@/lib/adminScope";
import {
  parseTherapistApprovalSetup,
  type TherapistApprovalSetup,
  type TherapistApprovalSetupInput,
} from "@/lib/therapistApproval";

// Approves a pending self-serve signup. Handles both roles that go through
// the approval gate -- therapist applications and, since patients now wait
// on the same gate, patient registrations. The role filter is still there
// (rather than approving any id) so this can never be used to flip
// `approved` on an admin or hospital row.
//
// A therapist's approval also carries their setup -- revenue share, an
// optional home-visit share, whether they show on /team, and a note for the
// log -- written in the same update as `approved`, so an admin who can set
// money cannot approve a therapist and leave their pay undefined. The rules
// live in src/lib/therapistApproval.ts.
export async function POST(request: NextRequest) {
  const adminUser = await requireAdminScope("people");
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: body, error: parseError } = await parseJsonBody<{
    userId?: string;
    therapistSetup?: TherapistApprovalSetupInput;
  }>(request);
  if (parseError) return parseError;
  const { userId } = body;
  if (!userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }

  const admin = createAdminClient();

  // The role decides whether a setup is required, so it is read first --
  // from the row, never from the request.
  const { data: target, error: targetError } = await admin
    .from("profiles")
    .select("role, full_name, revenue_share_percent, home_visit_revenue_share_percent")
    .eq("id", userId)
    .in("role", ["therapist", "patient"])
    .maybeSingle();
  if (targetError) return serverError("admin/approve-account (role)", targetError);

  let setup: TherapistApprovalSetup | null = null;
  const changes: Record<string, unknown> = { approved: true };
  if (target?.role === "therapist") {
    const parsed = parseTherapistApprovalSetup(body.therapistSetup, {
      canSetRevenueShare: scopeCanManage(adminUser.scope, "money"),
    });
    if (!parsed.ok) {
      return NextResponse.json(
        { error: parsed.error, code: parsed.code },
        { status: parsed.code === "forbidden_money" ? 403 : 400 }
      );
    }
    setup = parsed.setup;
    if (setup.revenueSharePercent !== null) {
      changes.revenue_share_percent = setup.revenueSharePercent;
      changes.home_visit_revenue_share_percent = setup.homeVisitSharePercent;
    }
    if (setup.visibleOnTeam !== undefined) changes.visible_on_team = setup.visibleOnTeam;
  }

  const { data: updated, error } = await admin
    .from("profiles")
    .update(changes)
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
    targetLabel: target?.full_name ?? null,
    details: setup
      ? {
          ...(setup.visibleOnTeam !== undefined ? { visibleOnTeam: setup.visibleOnTeam } : {}),
          ...(setup.note ? { note: setup.note } : {}),
        }
      : undefined,
  });
  // The rates get their own entries, under the actions the profile's rate
  // forms already log, so they land in the Money desk's view of the log
  // rather than in People's.
  if (setup?.revenueSharePercent != null) {
    await recordAdminActivity(admin, adminUser.id, {
      action: "therapist.set_revenue_share",
      targetId: userId,
      targetLabel: target?.full_name ?? null,
      details: {
        fromPercent: target?.revenue_share_percent ?? null,
        toPercent: setup.revenueSharePercent,
        atApproval: true,
      },
    });
    if (setup.homeVisitSharePercent !== null) {
      await recordAdminActivity(admin, adminUser.id, {
        action: "therapist.set_home_visit_revenue_share",
        targetId: userId,
        targetLabel: target?.full_name ?? null,
        details: {
          fromPercent: target?.home_visit_revenue_share_percent ?? null,
          toPercent: setup.homeVisitSharePercent,
          atApproval: true,
        },
      });
    }
  }

  return NextResponse.json({ success: true });
}
