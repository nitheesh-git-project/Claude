import { NextRequest, NextResponse } from "next/server";
import { getAdminUser } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";

// The home-visit twin of /api/admin/package-purchase-detail -- backs the
// admin Programmes table's tap-to-open detail popup.
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
    .from("home_visit_package_purchases")
    .select(
      "id, purchase_code, patient_id, package_id, visit_count, visits_used, amount_paid_paise, travel_fee_paise, payment_mode, payment_status, status, locked_therapist_id, expires_at, notes, paid_at, created_at, razorpay_payment_id"
    )
    .eq("id", purchaseId)
    .single();

  if (!purchase) {
    return NextResponse.json({ error: "Home visit package purchase not found" }, { status: 404 });
  }

  const [
    { data: appointments },
    { data: events },
    { data: patient },
    { data: therapist },
    { data: packageRow },
  ] = await Promise.all([
    admin
      .from("appointments")
      .select(
        "id, slot_time, status, no_show, therapist_id, session_code, patient_rating, therapist_rating, cancellation_reason"
      )
      .eq("home_visit_purchase_id", purchaseId)
      .order("slot_time", { ascending: true }),
    admin
      .from("home_visit_purchase_events")
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
    admin.from("home_visit_packages").select("id, package_code, title, image_url").eq("id", purchase.package_id).maybeSingle(),
  ]);

  const now = Date.now();
  const completed = (appointments ?? []).filter((a) => a.status === "completed");
  const upcoming = (appointments ?? []).filter(
    (a) => a.status !== "completed" && a.status !== "cancelled" && a.slot_time && new Date(a.slot_time).getTime() > now
  );
  const restoredAppointmentIds = new Set(
    (events ?? [])
      .filter((e) => e.event_type === "visit_restored" && e.appointment_id)
      .map((e) => e.appointment_id as string)
  );
  const restorable = (appointments ?? []).filter(
    (a) =>
      !restoredAppointmentIds.has(a.id) &&
      ((a.status === "cancelled" && a.cancellation_reason !== "Home visit package refunded by admin") ||
        (a.status === "completed" && a.no_show))
  );

  const actorIds = [...new Set((events ?? []).map((e) => e.actor_id).filter(Boolean))] as string[];
  const { data: actors } = actorIds.length
    ? await admin.from("profiles").select("id, full_name").in("id", actorIds)
    : { data: [] as { id: string; full_name: string }[] };
  const actorNameById = new Map((actors ?? []).map((a) => [a.id, a.full_name]));

  return NextResponse.json({
    purchase: {
      ...purchase,
      packageCode: packageRow?.package_code ?? null,
      packageTitle: packageRow?.title ?? "Home Visit Package",
      packageImageUrl: packageRow?.image_url ?? null,
      patientName: patient?.full_name ?? "Unknown patient",
      patientEmail: patient?.email ?? null,
      patientCode: patient?.patient_code ?? null,
      therapistName: therapist?.full_name ?? null,
      therapistCode: therapist?.therapist_code ?? null,
    },
    completed,
    upcoming,
    pendingCount: Math.max(purchase.visit_count - purchase.visits_used, 0),
    restorable,
    events: (events ?? []).map((e) => ({ ...e, actorName: e.actor_id ? actorNameById.get(e.actor_id) ?? "Unknown" : "System" })),
  });
}
