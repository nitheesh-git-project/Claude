import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { applyLedgerVisitBalance, readLedgerAuthoritative } from "@/lib/ledgerBalances";

// Self-service counterpart to /api/admin/home-visit-purchase-detail -- backs
// the shared HomeVisitDetailModal in patient/therapist mode. Same pattern as
// /api/packages/purchase-detail: queries with the caller's own RLS-scoped
// client, since home_visit_purchases_select_own and
// home_visit_purchases_select_locked_therapist (schema.sql) already encode
// exactly who's allowed to see a given purchase, so a row coming back at all
// *is* the authorization check.
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const purchaseId = request.nextUrl.searchParams.get("id");
  if (!purchaseId) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const { data: purchaseRow } = await supabase
    .from("home_visit_package_purchases")
    .select(
      "id, purchase_code, patient_id, package_id, visit_count, visits_used, amount_paid_paise, travel_fee_paise, payment_mode, payment_status, status, locked_therapist_id, expires_at, paid_at, created_at"
    )
    .eq("id", purchaseId)
    .maybeSingle();

  if (!purchaseRow) {
    return NextResponse.json({ error: "Home visit package not found" }, { status: 404 });
  }

  const viewerIsPatient = purchaseRow.patient_id === user.id;
  const viewerIsTherapist = purchaseRow.locked_therapist_id === user.id;
  if (!viewerIsPatient && !viewerIsTherapist) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [{ data: appointments }, { data: events }] = await Promise.all([
    supabase
      .from("appointments")
      .select("id, slot_time, status, no_show, session_code, patient_rating, therapist_rating")
      .eq("home_visit_purchase_id", purchaseId)
      .order("slot_time", { ascending: true }),
    supabase
      .from("home_visit_purchase_events")
      .select("id, event_type, appointment_id, created_at")
      .eq("purchase_id", purchaseId)
      .order("created_at", { ascending: false }),
  ]);

  const admin = createAdminClient();

  // The balance shown comes from the ledger once it is authoritative.
  // Read with the admin client, not the caller's: the purchase row above is
  // already the authorization check (see this route's header), and
  // site_settings is not readable by a patient's own session.
  const purchase = await applyLedgerVisitBalance(admin, purchaseRow, {
    authoritative: await readLedgerAuthoritative(admin),
  });
  const [{ data: packageRow }, { data: otherParty }] = await Promise.all([
    admin
      .from("home_visit_packages")
      .select("id, package_code, title, image_url, therapist_locked")
      .eq("id", purchase.package_id)
      .maybeSingle(),
    viewerIsPatient
      ? purchase.locked_therapist_id
        ? admin.from("profiles").select("id, full_name").eq("id", purchase.locked_therapist_id).maybeSingle()
        : Promise.resolve({ data: null })
      : admin.from("profiles").select("id, full_name, patient_code").eq("id", purchase.patient_id).maybeSingle(),
  ]);

  const now = Date.now();
  const completed = (appointments ?? []).filter((a) => a.status === "completed");
  const upcoming = (appointments ?? []).filter(
    (a) => a.status !== "completed" && a.status !== "cancelled" && a.slot_time && new Date(a.slot_time).getTime() > now
  );

  return NextResponse.json({
    viewerRole: viewerIsPatient ? "patient" : "therapist",
    purchase: {
      id: purchase.id,
      purchaseCode: purchase.purchase_code,
      packageCode: packageRow?.package_code ?? null,
      packageTitle: packageRow?.title ?? "Home Visit Package",
      packageImageUrl: packageRow?.image_url ?? null,
      visitCount: purchase.visit_count,
      visitsUsed: purchase.visits_used,
      status: purchase.status,
      expiresAt: purchase.expires_at,
      createdAt: purchase.created_at,
      therapistLocked: packageRow?.therapist_locked ?? true,
      paymentMode: purchase.payment_mode,
      therapistName: viewerIsPatient
        ? (otherParty as { full_name?: string } | null)?.full_name ?? null
        : null,
      patientName: viewerIsTherapist
        ? (otherParty as { full_name?: string } | null)?.full_name ?? null
        : null,
      patientCode: viewerIsTherapist
        ? (otherParty as { patient_code?: string | null } | null)?.patient_code ?? null
        : null,
      amountPaidPaise: viewerIsPatient ? purchase.amount_paid_paise : null,
      travelFeePaise: viewerIsPatient ? purchase.travel_fee_paise : null,
      paymentStatus: viewerIsPatient ? purchase.payment_status : null,
    },
    completed,
    upcoming,
    pendingCount: Math.max(purchase.visit_count - purchase.visits_used, 0),
    events: (events ?? []).map((e) => ({
      id: e.id,
      event_type: e.event_type,
      appointment_id: e.appointment_id,
      created_at: e.created_at,
    })),
  });
}
