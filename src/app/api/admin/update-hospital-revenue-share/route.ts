import { NextRequest, NextResponse } from "next/server";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAdminActivity } from "@/lib/adminActivityLog";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { serverError } from "@/lib/apiError";

export async function POST(request: NextRequest) {
  const adminUser = await requireAdminScope("money");
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: body, error: parseError } = await parseJsonBody<{
    hospitalId?: string;
    revenueSharePercent?: number;
  }>(request);
  if (parseError) return parseError;
  const { hospitalId, revenueSharePercent } = body;
  // Explicitly reject "" (and other non-numeric-looking input) before the
  // Number() conversion below - Number("") is 0, not NaN, so an emptied
  // input would otherwise silently save as a real, meaningful 0% instead
  // of being rejected as missing.
  if (
    !hospitalId ||
    revenueSharePercent === undefined ||
    revenueSharePercent === null ||
    String(revenueSharePercent).trim() === ""
  ) {
    return NextResponse.json(
      { error: "Missing hospitalId or revenueSharePercent" },
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
    .eq("id", hospitalId)
    .eq("role", "hospital")
    .maybeSingle();

  if (!before) {
    return NextResponse.json({ error: "That partner doesn't exist." }, { status: 404 });
  }

  // The row comes back, so "nothing matched" is a 404 rather than a success
  // and an audit entry for a change that never happened.
  const { data: updated, error } = await admin
    .from("profiles")
    .update({ revenue_share_percent: sharePercent })
    .eq("id", hospitalId)
    .eq("role", "hospital")
    .select("id")
    .maybeSingle();

  if (error) {
    return serverError("admin/update-hospital-revenue-share", error);
  }
  if (!updated) {
    return NextResponse.json({ error: "That partner doesn't exist." }, { status: 404 });
  }

  // Counted as a money action (see isMoneyAction): this percentage decides
  // every future payout for this counterparty, so it moves more money over
  // time than most single refunds do.
  await recordAdminActivity(admin, adminUser.id, {
    action: "hospital.set_revenue_share",
    targetId: hospitalId,
    targetLabel: before?.full_name ?? null,
    details: { fromPercent: before?.revenue_share_percent ?? null, toPercent: sharePercent },
  });

  return NextResponse.json({ success: true, revenueSharePercent: sharePercent });
}
