import { NextRequest, NextResponse } from "next/server";
import { getAdminUser } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";

const MAX_REASON_LENGTH = 500;

// The home-visit twin of /api/admin/extend-package-expiry.
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
    .from("home_visit_package_purchases")
    .select("id, status, expires_at")
    .eq("id", purchaseId)
    .single();
  if (!purchase) {
    return NextResponse.json({ error: "Home visit package purchase not found" }, { status: 404 });
  }
  if (purchase.status === "refunded" || purchase.status === "cancelled") {
    return NextResponse.json(
      { error: "This package has been refunded or cancelled and can't be extended." },
      { status: 400 }
    );
  }

  const newExpiryIso = new Date(newExpiresAt).toISOString();
  // CAS on the expires_at this request actually read -- see
  // extend-package-expiry's identical comment; two concurrent extensions on
  // the same purchase could otherwise silently overwrite one another.
  let query = admin
    .from("home_visit_package_purchases")
    .update({
      expires_at: newExpiryIso,
      expiry_extended_at: new Date().toISOString(),
      expiry_extended_by: adminUser.id,
      expiry_extension_reason: reason?.trim() || null,
      ...(purchase.status === "expired" ? { status: "active" } : {}),
    })
    .eq("id", purchaseId);
  query = purchase.expires_at === null ? query.is("expires_at", null) : query.eq("expires_at", purchase.expires_at);
  const { data: claimed, error: updateError } = await query.select("id").maybeSingle();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }
  if (!claimed) {
    return NextResponse.json(
      { error: "This package's expiry was changed concurrently — please refresh and try again." },
      { status: 409 }
    );
  }

  const { error: eventError } = await admin.from("home_visit_purchase_events").insert({
    purchase_id: purchaseId,
    event_type: "expiry_extended",
    actor_id: adminUser.id,
    detail: { oldExpiresAt: purchase.expires_at, newExpiresAt: newExpiryIso, reason: reason?.trim() || null },
  });
  if (eventError) {
    console.error("Failed to log expiry_extended event for home visit purchase", purchaseId, eventError);
  }

  return NextResponse.json({ success: true });
}
