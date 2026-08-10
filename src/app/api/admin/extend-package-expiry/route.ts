import { NextRequest, NextResponse } from "next/server";
import { getAdminUser } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";

const MAX_REASON_LENGTH = 500;

export async function POST(request: NextRequest) {
  const adminUser = await getAdminUser();
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: body, error: parseError } = await parseJsonBody<{
    purchaseId?: string;
    newExpiresAt?: string;
    reason?: string;
  }>(request);
  if (parseError) return parseError;
  const { purchaseId, newExpiresAt, reason } = body;

  if (!purchaseId || !newExpiresAt) {
    return NextResponse.json({ error: "Missing purchaseId or newExpiresAt" }, { status: 400 });
  }
  if (reason && reason.length > MAX_REASON_LENGTH) {
    return NextResponse.json(
      { error: `Reason must be ${MAX_REASON_LENGTH} characters or fewer.` },
      { status: 400 }
    );
  }

  const newExpiryMs = new Date(newExpiresAt).getTime();
  if (Number.isNaN(newExpiryMs)) {
    return NextResponse.json({ error: "Invalid newExpiresAt" }, { status: 400 });
  }
  if (newExpiryMs <= Date.now()) {
    return NextResponse.json({ error: "The new expiry date must be in the future" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: purchase } = await admin
    .from("patient_package_purchases")
    .select("id, status, expires_at")
    .eq("id", purchaseId)
    .single();
  if (!purchase) {
    return NextResponse.json({ error: "Package purchase not found" }, { status: 404 });
  }
  if (purchase.status === "refunded" || purchase.status === "cancelled") {
    return NextResponse.json(
      { error: "This package has been refunded or cancelled and can't be extended." },
      { status: 400 }
    );
  }

  const newExpiryIso = new Date(newExpiresAt).toISOString();
  const { error: updateError } = await admin
    .from("patient_package_purchases")
    .update({
      expires_at: newExpiryIso,
      expiry_extended_at: new Date().toISOString(),
      expiry_extended_by: adminUser.id,
      expiry_extension_reason: reason?.trim() || null,
      // A previously lapsed purchase becomes usable again; 'completed'
      // purchases are left alone -- extending their expiry has no
      // scheduling effect since there's nothing left to book.
      ...(purchase.status === "expired" ? { status: "active" } : {}),
    })
    .eq("id", purchaseId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  const { error: eventError } = await admin.from("package_purchase_events").insert({
    purchase_id: purchaseId,
    event_type: "expiry_extended",
    actor_id: adminUser.id,
    detail: { oldExpiresAt: purchase.expires_at, newExpiresAt: newExpiryIso, reason: reason?.trim() || null },
  });
  if (eventError) {
    console.error("Failed to log expiry_extended event for purchase", purchaseId, eventError);
  }

  return NextResponse.json({ success: true });
}
