import { NextRequest, NextResponse } from "next/server";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAdminActivity } from "@/lib/adminActivityLog";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { serverError } from "@/lib/apiError";

// Money -> Refunds: an admin marks a refund that needed a person (one made
// on the Razorpay website against a programme, or against a payment the app
// has no booking for, or one the bank failed) as dealt with. It records who
// and when; it moves no money and changes no booking.
//
// Request:  { refundId: string }
// Response: 200 { success: true }, 400, 403, 404.
export async function POST(request: NextRequest) {
  const adminUser = await requireAdminScope("money");
  if (!adminUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: body, error: parseError } = await parseJsonBody<{ refundId?: unknown }>(request);
  if (parseError) return parseError;
  if (typeof body.refundId !== "string" || !/^rfnd_[A-Za-z0-9]+$/.test(body.refundId)) {
    return NextResponse.json({ error: "Unknown refund." }, { status: 400 });
  }

  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("razorpay_refunds")
    .update({ reviewed_by: adminUser.id, reviewed_at: now, updated_at: now })
    .eq("razorpay_refund_id", body.refundId)
    .select("razorpay_refund_id, amount_paise")
    .maybeSingle();
  if (error) return serverError("admin/refunds/review", error);
  if (!data) return NextResponse.json({ error: "That refund is not in the list." }, { status: 404 });

  await recordAdminActivity(admin, adminUser.id, {
    action: "refund.review",
    targetId: null,
    targetLabel: `Refund ${data.razorpay_refund_id} reviewed`,
    amountPaise: null,
    details: { what: "reviewed a Razorpay refund", refundId: data.razorpay_refund_id },
  });
  return NextResponse.json({ success: true });
}
