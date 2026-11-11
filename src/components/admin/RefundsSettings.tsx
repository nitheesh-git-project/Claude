import { createAdminClient } from "@/lib/supabase/admin";
import AdminRefundsTab, { type RefundListRow } from "@/components/admin/AdminRefundsTab";

// Money -> Refunds. Self-fetching like the other single-screen readers;
// Money scope (the route behind its one button is requireAdminScope("money")).
// Every refund Razorpay has reported, newest first, with the names and the
// session codes it touches. An unreadable table says so.
export default async function RefundsSettings({ canManage }: { canManage: boolean }) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("razorpay_refunds")
    .select(
      "razorpay_refund_id, razorpay_payment_id, amount_paise, status, source, appointment_id, package_purchase_id, home_visit_purchase_id, patient_id, applied, applied_note, gateway_created_at, processed_at, failed_at, reviewed_at, first_seen_at"
    )
    .order("first_seen_at", { ascending: false })
    .limit(1000);
  if (error) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
        <p className="font-semibold">We couldn&apos;t load the refunds just now.</p>
        <p className="mt-1">Nothing has been changed. Refresh the page to try again.</p>
      </div>
    );
  }
  const rows = data ?? [];
  const patientIds = [...new Set(rows.map((r) => r.patient_id).filter((id): id is string => !!id))];
  const apptIds = [...new Set(rows.map((r) => r.appointment_id).filter((id): id is string => !!id))];
  const [people, appts] = await Promise.all([
    patientIds.length ? admin.from("profiles").select("id, full_name").in("id", patientIds) : Promise.resolve({ data: [] as { id: string; full_name: string | null }[] }),
    apptIds.length ? admin.from("appointments").select("id, session_code").in("id", apptIds) : Promise.resolve({ data: [] as { id: string; session_code: string | null }[] }),
  ]);
  const nameById = new Map((people.data ?? []).map((p) => [p.id, p.full_name ?? "Unnamed patient"]));
  const codeById = new Map((appts.data ?? []).map((a) => [a.id, a.session_code]));
  const list: RefundListRow[] = rows.map((r) => ({
    refundId: r.razorpay_refund_id,
    paymentId: r.razorpay_payment_id,
    amountPaise: r.amount_paise,
    status: r.status,
    source: r.source,
    patientId: r.patient_id,
    patientName: r.patient_id ? nameById.get(r.patient_id) ?? "Unknown patient" : null,
    sessionCode: r.appointment_id ? codeById.get(r.appointment_id) ?? null : null,
    against: r.appointment_id ? "session" : r.package_purchase_id ? "programme" : r.home_visit_purchase_id ? "home visits" : null,
    applied: r.applied,
    note: r.applied_note,
    at: r.processed_at ?? r.failed_at ?? r.gateway_created_at ?? r.first_seen_at,
    reviewedAt: r.reviewed_at,
  }));
  return <AdminRefundsTab rows={list} canManage={canManage} />;
}
