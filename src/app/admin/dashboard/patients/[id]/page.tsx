import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import AvatarThumbnail from "@/components/profile/AvatarThumbnail";
import PatientActiveToggle from "@/components/admin/PatientActiveToggle";
import PatientContactEditForm from "@/components/admin/PatientContactEditForm";
import PatientNotesForm from "@/components/admin/PatientNotesForm";
import ResetPatientPasswordButton from "@/components/admin/ResetPatientPasswordButton";
import PatientProfitChart from "@/components/admin/PatientProfitChart";
import RatingManager from "@/components/admin/RatingManager";
import ProfileSessionList from "@/components/admin/ProfileSessionList";
import { type ReassignmentLogEntry } from "@/components/admin/SessionDetailDrawer";
import { PROFILE_FIELD_LABELS } from "@/lib/profileFieldLabels";
import { SESSION_FEE_PAISE } from "@/lib/pricing";
import { computeRatingAggregate } from "@/lib/ratingAggregate";
import { mergeSessionCodes } from "@/lib/sessionCode";

export const metadata: Metadata = {
  title: "Patient Details | Dr. Pooja's Physio",
};

export default async function AdminPatientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const admin = createAdminClient();

  const { data: patient } = await admin
    .from("profiles")
    .select(
      "id, full_name, email, phone, avatar_url, active, created_at, referred_by_hospital_id, emergency_contact_name, emergency_contact_phone"
    )
    .eq("id", id)
    .eq("role", "patient")
    .single();

  if (!patient) {
    notFound();
  }

  // patient_code is new/migration-dependent -- kept isolated (see
  // sessionCode.ts's comment) so an unknown-column error here only
  // degrades this one badge, not the whole page.
  const { data: patientCodeRow } = await admin
    .from("profiles")
    .select("patient_code")
    .eq("id", id)
    .maybeSingle();

  const [{ data: rawAppointments }, { data: note }, { data: changeRequests }, { data: hospital }] =
    await Promise.all([
      admin
        .from("appointments")
        .select(
          "id, slot_time, timezone, concern, status, payment_status, amount_paid_paise, duration_minutes, category_id, notes, created_at, patient_id, therapist_id, razorpay_payment_id, paid_at, patient_rating, patient_feedback, patient_rating_excluded, therapist_rating, therapist_feedback, therapist_rating_excluded, cancellation_reason, refund_status, refund_amount_paise, package_purchase_id, no_show, therapist_payout_paid_at"
        )
        .eq("patient_id", id)
        .order("created_at", { ascending: false }),
      admin
        .from("patient_admin_notes")
        .select("note, temp_password, temp_password_set_at")
        .eq("patient_id", id)
        .maybeSingle(),
      admin
        .from("profile_change_requests")
        .select("id, status, admin_notes, changes, created_at")
        .eq("user_id", id)
        .order("created_at", { ascending: false }),
      patient.referred_by_hospital_id
        ? admin
            .from("profiles")
            .select("organization_name")
            .eq("id", patient.referred_by_hospital_id)
            .single()
        : Promise.resolve({ data: null }),
    ]);

  // session_code is also new/migration-dependent -- same isolation
  // reasoning as patientCodeRow above.
  const { data: sessionCodeLinks } = await admin
    .from("appointments")
    .select("id, session_code")
    .eq("patient_id", id);
  const appointments = mergeSessionCodes(rawAppointments ?? [], sessionCodeLinks);

  const categoryIds = [
    ...new Set((appointments ?? []).map((a) => a.category_id).filter(Boolean)),
  ];
  const { data: categories } =
    categoryIds.length > 0
      ? await admin
          .from("treatment_categories")
          .select("id, title, price_paise, duration_minutes")
          .in("id", categoryIds as string[])
      : { data: [] as { id: string; title: string; price_paise: number; duration_minutes: number }[] };
  const categoryMap = new Map((categories ?? []).map((c) => [c.id, c]));

  const therapistIds = [
    ...new Set((appointments ?? []).map((a) => a.therapist_id).filter(Boolean)),
  ];
  const [{ data: sessionTherapists }, { data: approvedTherapists }] = await Promise.all([
    therapistIds.length > 0
      ? admin
          .from("profiles")
          .select("id, full_name, revenue_share_percent")
          .in("id", therapistIds as string[])
      : Promise.resolve({
          data: [] as { id: string; full_name: string; revenue_share_percent: number | null }[],
        }),
    admin
      .from("profiles")
      .select("id, full_name, active")
      .eq("role", "therapist")
      .eq("approved", true)
      .order("full_name"),
  ]);
  const therapistMap = new Map((sessionTherapists ?? []).map((t) => [t.id, t]));
  // SessionDetailDrawer looks up both patient_id and therapist_id names
  // from one map -- this patient's own row plus every therapist on their
  // appointments covers every id ProfileSessionList/SessionDetailDrawer
  // will ever need to resolve on this page.
  const peopleMap = new Map<string, string>([
    [patient.id, patient.full_name ?? "Unknown"],
    ...(sessionTherapists ?? []).map((t) => [t.id, t.full_name ?? "Unknown"] as [string, string]),
  ]);

  const appointmentIds = (appointments ?? []).map((a) => a.id);
  const { data: reassignmentLogs } =
    appointmentIds.length > 0
      ? await admin
          .from("appointment_reassignment_log")
          .select(
            "id, appointment_id, changed_at, changed_by, old_therapist_id, new_therapist_id, old_slot_time, new_slot_time, old_category_id, new_category_id"
          )
          .in("appointment_id", appointmentIds)
      : { data: [] as ReassignmentLogEntry[] };

  // Patient ratings (how therapists rated THIS patient) are admin-only by
  // design -- see RatingManager below, no onToggleVisible prop -- so this
  // aggregate only ever needs to answer "what does admin see", never a
  // public-visibility question the way the therapist page's does.
  const ratingAggregate = computeRatingAggregate(
    (appointments ?? []).map((a) => ({
      rating: a.therapist_rating,
      excluded: a.therapist_rating_excluded,
    }))
  );

  // Sorted by when payment actually cleared, not booking-creation order —
  // a patient can book well before (or after) they pay, so the two orders
  // can diverge; a "payment history" should read newest-payment-first.
  const paidAppointments = (appointments ?? [])
    .filter((a) => a.payment_status === "paid")
    .sort((a, b) => {
      const at = a.paid_at ? new Date(a.paid_at).getTime() : new Date(a.created_at).getTime();
      const bt = b.paid_at ? new Date(b.paid_at).getTime() : new Date(b.created_at).getTime();
      return bt - at;
    });
  const totalPaidPaise = paidAppointments.reduce(
    (sum, a) => sum + (a.amount_paid_paise ?? SESSION_FEE_PAISE),
    0
  );

  // Profit only exists where the session's therapist has a revenue share
  // set — without it there's no way to know their cut, so those sessions
  // are counted in Total Paid above but excluded from this breakdown
  // (PatientProfitChart surfaces how many were skipped, so it's never a
  // silent gap).
  const profitSessions = paidAppointments
    .filter((a) => {
      const therapist = a.therapist_id ? therapistMap.get(a.therapist_id) : null;
      return therapist?.revenue_share_percent !== null && therapist?.revenue_share_percent !== undefined;
    })
    .map((a) => {
      const therapist = therapistMap.get(a.therapist_id as string)!;
      const paidPaise = a.amount_paid_paise ?? SESSION_FEE_PAISE;
      const payoutPaise = Math.round((paidPaise * (therapist.revenue_share_percent as number)) / 100);
      return {
        id: a.id,
        label: a.paid_at
          ? new Date(a.paid_at).toLocaleDateString("en-IN", {
              day: "numeric",
              month: "short",
              timeZone: "Asia/Kolkata",
            })
          : "—",
        paidPaise,
        payoutPaise,
        profitPaise: paidPaise - payoutPaise,
      };
    })
    .reverse(); // paidAppointments is newest-first; the chart reads left-to-right chronologically
  const totalProfitPayoutPaise = profitSessions.reduce((sum, s) => sum + s.payoutPaise, 0);
  const totalProfitProfitPaise = profitSessions.reduce((sum, s) => sum + s.profitPaise, 0);
  const totalProfitPaidPaise = profitSessions.reduce((sum, s) => sum + s.paidPaise, 0);

  // Surfaced in the suspend confirmation so an admin isn't suspending
  // blind -- see PatientActiveToggle.
  const upcomingSessionCount = (appointments ?? []).filter(
    (a) => a.status === "requested" || a.status === "confirmed"
  ).length;

  return (
    <section className="py-8 max-w-4xl mx-auto px-4">
      <Link
        href="/admin/dashboard"
        className="text-xs text-teal-700 font-semibold mb-6 inline-block"
      >
        ← Back to Dashboard
      </Link>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <AvatarThumbnail url={patient.avatar_url} name={patient.full_name ?? "P"} size={64} />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-slate-900">{patient.full_name}</h1>
                {patientCodeRow?.patient_code && (
                  <span className="text-[10px] font-mono font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                    {patientCodeRow.patient_code}
                  </span>
                )}
                {!patient.active && (
                  <span className="text-[10px] font-bold uppercase text-red-700 bg-red-100 px-2 py-0.5 rounded-full">
                    Suspended
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Joined {new Date(patient.created_at).toLocaleDateString()}
                {hospital?.organization_name && (
                  <> • Referred by {hospital.organization_name}</>
                )}
              </p>
            </div>
          </div>
          <PatientActiveToggle
            patientId={patient.id}
            active={patient.active}
            upcomingSessionCount={upcomingSessionCount}
          />
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6 mb-6">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <h2 className="font-bold text-sm text-slate-800 mb-3">Contact Info</h2>
          <PatientContactEditForm
            patientId={patient.id}
            currentPhone={patient.phone}
            currentEmail={patient.email}
          />
          <div className="mt-4 pt-4 border-t border-slate-100 text-xs space-y-1">
            <p className="font-semibold text-slate-700">Emergency Contact</p>
            {patient.emergency_contact_name || patient.emergency_contact_phone ? (
              <>
                <p className="text-slate-600">{patient.emergency_contact_name || "Name not set"}</p>
                <p className="text-slate-600">
                  {patient.emergency_contact_phone || "Phone not set"}
                </p>
              </>
            ) : (
              <p className="text-slate-400">Not provided by the patient.</p>
            )}
          </div>
          <div className="mt-4 pt-4 border-t border-slate-100">
            <ResetPatientPasswordButton
              patientId={patient.id}
              currentPassword={note?.temp_password}
              currentPasswordSetAt={note?.temp_password_set_at}
            />
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <h2 className="font-bold text-sm text-slate-800 mb-1">Admin Notes</h2>
          <p className="text-[11px] text-slate-400 mb-3">Private — never shown to the patient.</p>
          <PatientNotesForm patientId={patient.id} currentNote={note?.note ?? ""} />
        </div>
      </div>

      <RatingManager
        title="Therapist Ratings of This Patient"
        average={ratingAggregate.average}
        count={ratingAggregate.count}
        excludedCount={ratingAggregate.excludedCount}
      />
      <p className="text-[11px] text-slate-400 -mt-4 mb-6">
        Admin-only — never shown to the patient or any therapist.
      </p>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-6">
        <h2 className="font-bold text-sm text-slate-800 mb-3">Booking History</h2>
        <p className="text-[11px] text-slate-400 -mt-2 mb-3">
          Click a session to see its full detail, including rating &amp; feedback.
        </p>
        <ProfileSessionList
          variant="patient"
          appointments={appointments ?? []}
          peopleMap={peopleMap}
          categoryMap={categoryMap}
          therapists={approvedTherapists ?? []}
          categories={categories ?? []}
          reassignmentLogs={reassignmentLogs ?? []}
          emptyMessage="No bookings yet."
        />
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-sm text-slate-800">Payment History</h2>
          <p className="text-xs text-slate-500">
            Total Paid: <strong className="text-teal-700">₹{(totalPaidPaise / 100).toLocaleString("en-IN")}</strong>
          </p>
        </div>
        {paidAppointments.length === 0 ? (
          <p className="text-xs text-slate-500 py-4 text-center">No payments recorded yet.</p>
        ) : (
          <ul className="space-y-3 text-xs">
            {paidAppointments.map((a) => {
              const therapist = a.therapist_id ? therapistMap.get(a.therapist_id) : null;
              return (
                <li key={a.id} className="p-4 rounded-xl border border-slate-200 space-y-1">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <strong className="text-slate-900">
                      {a.concern ?? "General Consultation"}
                      {a.session_code && (
                        <span className="ml-2 font-mono font-normal text-[11px] text-slate-400">
                          {a.session_code}
                        </span>
                      )}
                    </strong>
                    <span className="font-semibold text-teal-700 bg-teal-50 px-2.5 py-1 rounded-full">
                      ₹{((a.amount_paid_paise ?? SESSION_FEE_PAISE) / 100).toLocaleString("en-IN")}
                    </span>
                  </div>
                  <p className="text-slate-500">
                    Paid {a.paid_at ? new Date(a.paid_at).toLocaleString("en-IN") : "date unknown"}
                    {therapist && a.therapist_id && (
                      <>
                        {" "}
                        • Therapist:{" "}
                        <Link
                          href={`/admin/dashboard/therapists/${a.therapist_id}`}
                          className="font-semibold text-slate-700 hover:text-teal-700 hover:underline transition"
                        >
                          {therapist.full_name}
                        </Link>
                      </>
                    )}
                  </p>
                  {a.razorpay_payment_id && (
                    <p className="text-slate-400 font-mono">{a.razorpay_payment_id}</p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-6">
        <h2 className="font-bold text-sm text-slate-800 mb-3">Profit Breakdown</h2>
        <PatientProfitChart
          sessions={profitSessions}
          totalPaidPaise={totalProfitPaidPaise}
          totalPayoutPaise={totalProfitPayoutPaise}
          totalProfitPaise={totalProfitProfitPaise}
          excludedCount={paidAppointments.length - profitSessions.length}
        />
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h2 className="font-bold text-sm text-slate-800 mb-3">Profile Change Request History</h2>
        {!changeRequests || changeRequests.length === 0 ? (
          <p className="text-xs text-slate-500 py-4 text-center">No requests submitted.</p>
        ) : (
          <ul className="space-y-3 text-xs">
            {changeRequests.map((r) => {
              const changes = (r.changes ?? {}) as Record<string, unknown>;
              return (
                <li key={r.id} className="p-4 rounded-xl border border-slate-200 space-y-1">
                  <div className="flex items-center justify-between">
                    <span
                      className={`capitalize font-semibold px-2.5 py-1 rounded-full ${
                        r.status === "pending"
                          ? "text-amber-700 bg-amber-50"
                          : r.status === "approved"
                          ? "text-green-700 bg-green-50"
                          : "text-red-700 bg-red-50"
                      }`}
                    >
                      {r.status}
                    </span>
                    <span className="text-slate-400">
                      {new Date(r.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <ul className="text-slate-600 space-y-0.5">
                    {Object.entries(changes).map(([field, value]) => (
                      <li key={field}>
                        <span className="text-slate-400">
                          {PROFILE_FIELD_LABELS[field] ?? field}:
                        </span>{" "}
                        <strong>{value === null ? "(cleared)" : String(value)}</strong>
                      </li>
                    ))}
                  </ul>
                  {r.status === "declined" && r.admin_notes && (
                    <p className="text-red-600">Reason: {r.admin_notes}</p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
