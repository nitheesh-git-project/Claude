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

  const { data: body, error: parseError } = await parseJsonBody<{ requestId?: unknown }>(request);
  if (parseError) return parseError;

  if (typeof body.requestId !== "string") {
    return NextResponse.json({ error: "Missing requestId" }, { status: 400 });
  }

  const admin = createAdminClient();

  // A completed request tells the therapist they have been paid, so it must
  // have a payout behind it. It used to be a bare status flip: an admin
  // could complete a request with no batch and no settled sessions, and the
  // therapist got a "payment sent" notification for money nobody recorded.
  // Settling from Money -> Payouts closes the request itself; this route is
  // for the case where that link did not land, and it links the batch that
  // paid the request (one created since the request was raised and not
  // already answering another request).
  const { data: payoutRequest, error: requestError } = await admin
    .from("therapist_payout_requests")
    .select("id, therapist_id, status, requested_at")
    .eq("id", body.requestId)
    .maybeSingle();
  if (requestError) return serverError("admin/complete-payout-request", requestError);
  if (!payoutRequest) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }
  if (payoutRequest.status === "completed") {
    return NextResponse.json({ error: "This request is already completed." }, { status: 400 });
  }
  if (payoutRequest.status !== "reviewing") {
    return NextResponse.json(
      { error: "Start review on this request before marking it completed." },
      { status: 400 }
    );
  }

  const { data: batches, error: batchError } = await admin
    .from("therapist_payout_batches")
    .select("id, created_at")
    .eq("therapist_id", payoutRequest.therapist_id)
    .gte("created_at", payoutRequest.requested_at)
    .order("created_at", { ascending: false })
    .limit(20);
  if (batchError) return serverError("admin/complete-payout-request", batchError);

  // Batches already answering another request are not this one's payout.
  const { data: linkedRows, error: linkedError } = await admin
    .from("therapist_payout_requests")
    .select("payout_batch_id")
    .in(
      "payout_batch_id",
      (batches ?? []).map((b) => b.id).concat("00000000-0000-0000-0000-000000000000")
    );
  const linkColumnMissing = linkedError?.code === "42703";
  if (linkedError && !linkColumnMissing) return serverError("admin/complete-payout-request", linkedError);
  const taken = new Set((linkedRows ?? []).map((r) => r.payout_batch_id as string));
  const batch = (batches ?? []).find((b) => !taken.has(b.id));
  if (!batch) {
    return NextResponse.json(
      {
        error:
          "No payout has been recorded for this therapist since they asked. Settle it from Money -> Payouts first -- that closes this request automatically.",
      },
      { status: 400 }
    );
  }

  // Atomic conditional update -- only a request still "reviewing" moves, so
  // a double-tap or a concurrent settle cannot complete it twice.
  const { data: updated, error } = await admin
    .from("therapist_payout_requests")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      completed_by: adminUser.id,
      ...(linkColumnMissing ? {} : { payout_batch_id: batch.id }),
    })
    .eq("id", body.requestId)
    .eq("status", "reviewing")
    .select("id")
    .maybeSingle();

  if (error) {
    return serverError("admin/complete-payout-request", error);
  }
  if (!updated) {
    return NextResponse.json(
      { error: "This request changed while you were looking at it -- refresh and try again." },
      { status: 409 }
    );
  }

  await recordAdminActivity(admin, adminUser.id, {
    action: "payout_request.complete",
    targetId: payoutRequest.therapist_id,
    details: { requestId: payoutRequest.id, payoutBatchId: batch.id },
  });

  return NextResponse.json({ success: true });
}
