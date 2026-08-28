import { NextRequest, NextResponse } from "next/server";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAdminActivity } from "@/lib/adminActivityLog";

export async function POST(request: NextRequest) {
  const adminUser = await requireAdminScope("money");
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { therapistId, revenueSharePercent } = await request.json();
  // Explicitly reject "" (and other non-numeric-looking input) before the
  // Number() conversion below — Number("") is 0, not NaN, so an emptied
  // input would otherwise silently save as a real, meaningful 0% instead
  // of being rejected as missing.
  if (
    !therapistId ||
    revenueSharePercent === undefined ||
    revenueSharePercent === null ||
    String(revenueSharePercent).trim() === ""
  ) {
    return NextResponse.json(
      { error: "Missing therapistId or revenueSharePercent" },
      { status: 400 }
    );
  }

  const sharePercent = Number(revenueSharePercent);
  if (Number.isNaN(sharePercent) || sharePercent < 0 || sharePercent > 100) {
    return NextResponse.json(
      { error: "Revenue share must be a number between 0 and 100" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  // Read the outgoing value first: "changed the share" is only useful in
  // the log if it says what it changed from.
  const { data: before } = await admin
    .from("profiles")
    .select("full_name, revenue_share_percent")
    .eq("id", therapistId)
    .eq("role", "therapist")
    .maybeSingle();

  const { error } = await admin
    .from("profiles")
    .update({ revenue_share_percent: sharePercent })
    .eq("id", therapistId)
    .eq("role", "therapist");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Counted as a money action (see isMoneyAction): this percentage decides
  // every future payout for this counterparty, so it moves more money over
  // time than most single refunds do.
  await recordAdminActivity(admin, adminUser.id, {
    action: "therapist.set_revenue_share",
    targetId: therapistId,
    targetLabel: before?.full_name ?? null,
    details: { fromPercent: before?.revenue_share_percent ?? null, toPercent: sharePercent },
  });

  return NextResponse.json({ success: true, revenueSharePercent: sharePercent });
}
