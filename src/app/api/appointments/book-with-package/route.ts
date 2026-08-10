import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { isProfileActiveAndApproved } from "@/lib/supabase/requireActiveProfile";
import { bookPackageSession } from "@/lib/bookPackageSession";

const MAX_NOTES_LENGTH = 1000;

export async function POST(request: NextRequest) {
  const { data: body, error: parseError } = await parseJsonBody<{
    packagePurchaseId?: string;
    slotDateTime?: string;
    timezone?: string;
    notes?: string;
  }>(request);
  if (parseError) return parseError;
  const { packagePurchaseId, slotDateTime, timezone, notes } = body;

  if (!packagePurchaseId || !slotDateTime) {
    return NextResponse.json(
      { error: "Missing packagePurchaseId or slotDateTime" },
      { status: 400 }
    );
  }
  if (notes && notes.length > MAX_NOTES_LENGTH) {
    return NextResponse.json(
      { error: `Notes must be ${MAX_NOTES_LENGTH} characters or less.` },
      { status: 400 }
    );
  }

  const slotTimestamp = new Date(slotDateTime).getTime();
  if (Number.isNaN(slotTimestamp)) {
    return NextResponse.json({ error: "Invalid slotDateTime" }, { status: 400 });
  }
  if (slotTimestamp <= Date.now()) {
    return NextResponse.json({ error: "The slot must be in the future" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!(await isProfileActiveAndApproved(user.id))) {
    return NextResponse.json({ error: "Your account is not active — it is either awaiting admin approval or has been suspended." }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: purchase } = await admin
    .from("patient_package_purchases")
    .select(
      "id, patient_id, category_id, package_id, session_count, sessions_used, amount_paid_paise, payment_status, status, expires_at, locked_therapist_id"
    )
    .eq("id", packagePurchaseId)
    .single();

  if (!purchase || purchase.patient_id !== user.id) {
    return NextResponse.json({ error: "Package not found" }, { status: 404 });
  }

  // The package row's own session_duration_minutes override (if any) --
  // read separately from the purchase, same isolated-query convention as
  // everywhere else a migration-dependent column is read, so a package
  // missing this column doesn't blank the whole lookup.
  const { data: packageRow } = await admin
    .from("treatment_category_packages")
    .select("session_duration_minutes")
    .eq("id", purchase.package_id ?? "")
    .maybeSingle();

  const result = await bookPackageSession(admin, {
    purchase,
    slotDateTime,
    timezone,
    notes,
    actorId: user.id,
    sessionDurationMinutesOverride: packageRow?.session_duration_minutes ?? null,
  });

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ success: true, appointmentId: result.appointmentId });
}
