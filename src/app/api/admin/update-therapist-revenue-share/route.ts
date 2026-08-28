import { NextRequest, NextResponse } from "next/server";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";

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
  const { error } = await admin
    .from("profiles")
    .update({ revenue_share_percent: sharePercent })
    .eq("id", therapistId)
    .eq("role", "therapist");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, revenueSharePercent: sharePercent });
}
