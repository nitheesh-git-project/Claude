import { NextRequest, NextResponse } from "next/server";
import { getAdminUser } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";

// Backs the admin Purchases table's tap-to-open detail popup -- fetched
// on demand rather than joined into the page's big initial load, since a
// purchase's full appointment history and event timeline is only ever
// needed for the one purchase currently open, not all of them at once.
export async function GET(request: NextRequest) {
  const adminUser = await getAdminUser();
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const purchaseId = request.nextUrl.searchParams.get("id");
  if (!purchaseId) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: purchase } = await admin
    .from("patient_package_purchases")
    .select(
      "id, purchase_code, patient_id, package_id, category_id, session_count, sessions_used, amount_paid_paise, payment_status, status, locked_therapist_id, expires_at, notes, paid_at, created_at, razorpay_payment_id"
    )
    .eq("id", purchaseId)
    .single();

  if (!purchase) {
    return NextResponse.json({ error: "Package purchase not found" }, { status: 404 });
  }

  const [
    { data: appointments },
    { data: events },
    { data: patient },
    { data: therapist },
    { data: packageRow },
    { data: category },
  ] = await Promise.all([
    admin
      .from("appointments")
      .select(
        "id, slot_time, status, no_show, therapist_id, session_code, patient_rating, therapist_rating, cancellation_reason"
      )
      .eq("package_purchase_id", purchaseId)
      .order("slot_time", { ascending: true }),
    admin
      .from("package_purchase_events")
      .select("id, event_type, actor_id, appointment_id, detail, created_at")
      .eq("purchase_id", purchaseId)
      .order("created_at", { ascending: false }),
    admin.from("profiles").select("id, full_name, email, patient_code").eq("id", purchase.patient_id).maybeSingle(),
    purchase.locked_therapist_id
      ? admin
          .from("profiles")
          .select("id, full_name, therapist_code")
          .eq("id", purchase.locked_therapist_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    admin.from("treatment_category_packages").select("id, package_code, title, image_url").eq("id", purchase.package_id).maybeSingle(),
    admin.from("treatment_categories").select("id, title").eq("id", purchase.category_id).maybeSingle(),
  ]);

  const now = Date.now();
  const completed = (appointments ?? []).filter((a) => a.status === "completed");
  const upcoming = (appointments ?? []).filter(
    (a) => a.status !== "completed" && a.status !== "cancelled" && a.slot_time && new Date(a.slot_time).getTime() > now
  );
  // Eligible for the Restore action: a forfeited (late-cancelled, still
  // counted in sessions_used) or no-show session that hasn't already been
  // restored -- the route itself is the source of truth on the "already
  // restored" check via the session_restored event, this just pre-filters
  // the obvious non-candidates so the admin isn't offered to restore a
  // session that was cancelled outside the 24-hour window (and so already
  // gave its session back automatically).
  const restoredAppointmentIds = new Set(
    (events ?? [])
      .filter((e) => e.event_type === "session_restored" && e.appointment_id)
      .map((e) => e.appointment_id as string)
  );
  const restorable = (appointments ?? []).filter(
    (a) =>
      !restoredAppointmentIds.has(a.id) &&
      ((a.status === "cancelled" && a.cancellation_reason !== "Package refunded by admin") ||
        (a.status === "completed" && a.no_show))
  );

  // actorIds for the timeline -- resolved to names so the admin doesn't
  // have to cross-reference raw ids.
  const actorIds = [...new Set((events ?? []).map((e) => e.actor_id).filter(Boolean))] as string[];
  const { data: actors } = actorIds.length
    ? await admin.from("profiles").select("id, full_name").in("id", actorIds)
    : { data: [] as { id: string; full_name: string }[] };
  const actorNameById = new Map((actors ?? []).map((a) => [a.id, a.full_name]));

  return NextResponse.json({
    purchase: {
      ...purchase,
      packageCode: packageRow?.package_code ?? null,
      packageTitle: packageRow?.title ?? "Session Package",
      packageImageUrl: packageRow?.image_url ?? null,
      categoryTitle: category?.title ?? null,
      patientName: patient?.full_name ?? "Unknown patient",
      patientEmail: patient?.email ?? null,
      patientCode: patient?.patient_code ?? null,
      therapistName: therapist?.full_name ?? null,
      therapistCode: therapist?.therapist_code ?? null,
    },
    completed,
    upcoming,
    pendingCount: Math.max(purchase.session_count - purchase.sessions_used, 0),
    restorable,
    events: (events ?? []).map((e) => ({ ...e, actorName: e.actor_id ? actorNameById.get(e.actor_id) ?? "Unknown" : "System" })),
  });
}
