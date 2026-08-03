import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import AvatarThumbnail from "@/components/profile/AvatarThumbnail";
import ApproveTherapistButton from "@/components/admin/ApproveTherapistButton";
import TherapistActiveToggle from "@/components/admin/TherapistActiveToggle";
import TherapistTeamVisibilityToggle from "@/components/admin/TherapistTeamVisibilityToggle";
import TherapistContactEditForm from "@/components/admin/TherapistContactEditForm";
import TherapistNotesForm from "@/components/admin/TherapistNotesForm";
import TherapistRevenueShareForm from "@/components/admin/TherapistRevenueShareForm";
import ResetTherapistPasswordButton from "@/components/admin/ResetTherapistPasswordButton";
import TherapistPayoutButton from "@/components/admin/TherapistPayoutButton";
import RatingManager from "@/components/admin/RatingManager";
import ProfileSessionList from "@/components/admin/ProfileSessionList";
import { type ReassignmentLogEntry } from "@/components/admin/SessionDetailDrawer";
import { PROFILE_FIELD_LABELS } from "@/lib/profileFieldLabels";
import { SESSION_FEE_PAISE } from "@/lib/pricing";
import { computeRatingAggregate } from "@/lib/ratingAggregate";

export const metadata: Metadata = {
  title: "Therapist Details | Dr. Pooja's Physio",
};

export default async function AdminTherapistDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const admin = createAdminClient();

  const { data: therapist } = await admin
    .from("profiles")
    .select(
      "id, full_name, email, phone, avatar_url, active, approved, created_at, credentials, specialization, years_experience, bio, languages, revenue_share_percent, visible_on_team, rating_visible"
    )
    .eq("id", id)
    .eq("role", "therapist")
    .single();

  if (!therapist) {
    notFound();
  }

  const [{ data: note }, { data: appointments }, { data: changeRequests }] = await Promise.all([
    admin
      .from("therapist_admin_notes")
      .select("note, temp_password, temp_password_set_at")
      .eq("therapist_id", id)
      .maybeSingle(),
    admin
      .from("appointments")
      .select(
        "id, slot_time, timezone, concern, status, payment_status, amount_paid_paise, duration_minutes, category_id, notes, created_at, patient_id, therapist_id, paid_at, patient_rating, patient_feedback, patient_rating_excluded, therapist_rating, therapist_feedback, therapist_rating_excluded, cancellation_reason, refund_status, refund_amount_paise, package_purchase_id, no_show, therapist_payout_paid_at, therapist_payout_amount_paise, therapist_payout_method, therapist_payout_note"
      )
      .eq("therapist_id", id)
      .order("created_at", { ascending: false }),
    admin
      .from("profile_change_requests")
      .select("id, status, admin_notes, changes, created_at")
      .eq("user_id", id)
      .order("created_at", { ascending: false }),
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

  const categoryIds = [
    ...new Set((appointments ?? []).map((a) => a.category_id).filter(Boolean)),
  ];
  const patientIds = [
    ...new Set((appointments ?? []).map((a) => a.patient_id).filter(Boolean)),
  ];
  const [{ data: categories }, { data: patients }, { data: approvedTherapists }] = await Promise.all([
    categoryIds.length > 0
      ? admin
          .from("treatment_categories")
          .select("id, title, price_paise, duration_minutes")
          .in("id", categoryIds as string[])
      : Promise.resolve({ data: [] as { id: string; title: string; price_paise: number; duration_minutes: number }[] }),
    patientIds.length > 0
      ? admin.from("profiles").select("id, full_name").in("id", patientIds as string[])
      : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
    admin
      .from("profiles")
      .select("id, full_name, active")
      .eq("role", "therapist")
      .eq("approved", true)
      .order("full_name"),
  ]);
  const categoryMap = new Map((categories ?? []).map((c) => [c.id, c]));
  const patientMap = new Map((patients ?? []).map((p) => [p.id, p]));
  // SessionDetailDrawer looks up both patient_id and therapist_id names
  // from one map -- this therapist's own row plus every patient on their
  // appointments covers every id ProfileSessionList/SessionDetailDrawer
  // will ever need to resolve on this page.
  const peopleMap = new Map<string, string>([
    [therapist.id, therapist.full_name ?? "Unknown"],
    ...(patients ?? []).map((p) => [p.id, p.full_name ?? "Unknown"] as [string, string]),
  ]);

  const ratingAggregate = computeRatingAggregate(
    (appointments ?? []).map((a) => ({
      rating: a.patient_rating,
      excluded: a.patient_rating_excluded,
    }))
  );

  // Sorted by when payment actually cleared, not booking-creation order —
  // same reasoning as the patient detail page's Payment History.
  const paidAppointments = (appointments ?? [])
    .filter((a) => a.payment_status === "paid")
    .sort((a, b) => {
      const at = a.paid_at ? new Date(a.paid_at).getTime() : new Date(a.created_at).getTime();
      const bt = b.paid_at ? new Date(b.paid_at).getTime() : new Date(b.created_at).getTime();
      return bt - at;
    });
  const sharePercent = therapist.revenue_share_percent;
  // Only a completed session is actually owed to the therapist — matches
  // settle-therapist-payout's own filter, so this displayed balance is
  // exactly what the payout button will settle, not a larger number that
  // includes still-upcoming (paid but undelivered) sessions.
  const unsettledAppointments = paidAppointments.filter(
    (a) => !a.therapist_payout_paid_at && a.status === "completed"
  );
  const owedPaise =
    sharePercent !== null
      ? unsettledAppointments.reduce(
          (sum, a) =>
            sum + Math.round(((a.amount_paid_paise ?? SESSION_FEE_PAISE) * sharePercent) / 100),
          0
        )
      : 0;

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
            <AvatarThumbnail url={therapist.avatar_url} name={therapist.full_name ?? "T"} size={64} />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-slate-900">{therapist.full_name}</h1>
                {!therapist.active && (
                  <span className="text-[10px] font-bold uppercase text-red-700 bg-red-100 px-2 py-0.5 rounded-full">
                    Suspended
                  </span>
                )}
                {!therapist.approved && (
                  <span className="text-[10px] font-bold uppercase text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                    Pending Approval
                  </span>
                )}
                {!therapist.visible_on_team && (
                  <span className="text-[10px] font-bold uppercase text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">
                    Hidden from /team
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-1">
                {therapist.credentials} • Joined {new Date(therapist.created_at).toLocaleDateString()}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!therapist.approved && <ApproveTherapistButton therapistId={therapist.id} />}
            <TherapistTeamVisibilityToggle
              therapistId={therapist.id}
              visibleOnTeam={therapist.visible_on_team}
            />
            <TherapistActiveToggle therapistId={therapist.id} active={therapist.active} />
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6 mb-6">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <h2 className="font-bold text-sm text-slate-800 mb-3">Contact Info</h2>
          <TherapistContactEditForm
            therapistId={therapist.id}
            currentPhone={therapist.phone}
            currentEmail={therapist.email}
          />
          <div className="mt-4 pt-4 border-t border-slate-100 text-xs space-y-1">
            <p className="font-semibold text-slate-700">Professional Details</p>
            <p className="text-slate-600">
              Specialist in: {therapist.specialization || "Not set"}
            </p>
            <p className="text-slate-600">
              {therapist.years_experience !== null
                ? `${therapist.years_experience}+ years of experience`
                : "Years of experience not set"}
            </p>
            {therapist.bio && <p className="text-slate-600">{therapist.bio}</p>}
          </div>
          <div className="mt-4 pt-4 border-t border-slate-100">
            <ResetTherapistPasswordButton
              therapistId={therapist.id}
              currentPassword={note?.temp_password}
              currentPasswordSetAt={note?.temp_password_set_at}
            />
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <h2 className="font-bold text-sm text-slate-800 mb-3">Revenue Share</h2>
          <TherapistRevenueShareForm
            therapistId={therapist.id}
            currentPercent={therapist.revenue_share_percent}
          />
          <div className="mt-4 pt-4 border-t border-slate-100">
            <h2 className="font-bold text-sm text-slate-800 mb-1">Admin Notes</h2>
            <p className="text-[11px] text-slate-400 mb-3">Private — never shown to the therapist.</p>
            <TherapistNotesForm therapistId={therapist.id} currentNote={note?.note ?? ""} />
          </div>
        </div>
      </div>

      <RatingManager
        title="Patient Ratings of This Therapist"
        average={ratingAggregate.average}
        count={ratingAggregate.count}
        excludedCount={ratingAggregate.excludedCount}
        visible={therapist.rating_visible}
        onToggleVisible={{ therapistId: therapist.id }}
      />

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-6">
        <h2 className="font-bold text-sm text-slate-800 mb-3">Assigned Sessions</h2>
        <p className="text-[11px] text-slate-400 -mt-2 mb-3">
          Click a session to see its full detail, including rating &amp; feedback.
        </p>
        <ProfileSessionList
          variant="therapist"
          appointments={appointments ?? []}
          peopleMap={peopleMap}
          categoryMap={categoryMap}
          therapists={approvedTherapists ?? []}
          categories={categories ?? []}
          reassignmentLogs={reassignmentLogs ?? []}
          emptyMessage="No sessions assigned yet."
        />
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-6">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
          <div>
            <h2 className="font-bold text-sm text-slate-800">Payout History</h2>
            {sharePercent !== null && (
              <p className="text-xs text-slate-500 mt-1">
                Owed:{" "}
                <strong className="text-teal-700">
                  ₹{(owedPaise / 100).toLocaleString("en-IN")}
                </strong>
              </p>
            )}
          </div>
          {sharePercent !== null && (
            <TherapistPayoutButton therapistId={therapist.id} owedPaise={owedPaise} />
          )}
        </div>
        {sharePercent === null ? (
          <p className="text-xs text-slate-500 py-4 text-center">
            Set a revenue share % above to calculate payouts.
          </p>
        ) : paidAppointments.length === 0 ? (
          <p className="text-xs text-slate-500 py-4 text-center">No paid sessions yet.</p>
        ) : (
          <ul className="space-y-3 text-xs">
            {paidAppointments.map((a) => {
              const category = a.category_id ? categoryMap.get(a.category_id) : null;
              const feePaise = a.amount_paid_paise ?? category?.price_paise ?? SESSION_FEE_PAISE;
              const isSettled = !!a.therapist_payout_paid_at;
              const payoutPaise = isSettled
                ? a.therapist_payout_amount_paise ?? Math.round((feePaise * sharePercent) / 100)
                : Math.round((feePaise * sharePercent) / 100);
              const patient = a.patient_id ? patientMap.get(a.patient_id) : null;
              return (
                <li key={a.id} className="p-4 rounded-xl border border-slate-200 space-y-1">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    {a.patient_id ? (
                      <Link
                        href={`/admin/dashboard/patients/${a.patient_id}`}
                        className="font-bold text-slate-900 hover:text-teal-700 hover:underline transition"
                      >
                        {patient?.full_name ?? "Unknown patient"}
                      </Link>
                    ) : (
                      <strong className="text-slate-900">Unknown patient</strong>
                    )}
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-teal-700 bg-teal-50 px-2.5 py-1 rounded-full">
                        ₹{(payoutPaise / 100).toLocaleString("en-IN")}
                      </span>
                      {isSettled ? (
                        <span className="font-semibold text-green-700 bg-green-50 px-2.5 py-1 rounded-full">
                          Paid Out
                        </span>
                      ) : (
                        <span className="font-semibold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">
                          Owed
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="text-slate-500">
                    Session fee ₹{(feePaise / 100).toLocaleString("en-IN")} × {sharePercent}% •{" "}
                    Paid {a.paid_at ? new Date(a.paid_at).toLocaleDateString() : "date unknown"}
                  </p>
                  {isSettled && (
                    <p className="text-slate-400">
                      Settled {new Date(a.therapist_payout_paid_at as string).toLocaleDateString()}{" "}
                      via {a.therapist_payout_method}
                      {a.therapist_payout_note && <> — &quot;{a.therapist_payout_note}&quot;</>}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
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
