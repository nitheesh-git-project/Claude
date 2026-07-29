import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import SignOutButton from "@/components/auth/SignOutButton";
import ApproveTherapistButton from "@/components/admin/ApproveTherapistButton";
import AssignTherapistForm from "@/components/admin/AssignTherapistForm";
import OnboardHospitalForm from "@/components/admin/OnboardHospitalForm";
import AssignReferralForm from "@/components/admin/AssignReferralForm";
import { formatSlotTime } from "@/lib/formatSlotTime";

export const metadata: Metadata = {
  title: "Admin Dashboard | Dr. Pooja's Physio",
};

export default async function AdminDashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const admin = createAdminClient();

  const { data: pendingTherapists } = await admin
    .from("profiles")
    .select("id, full_name, email, credentials, created_at")
    .eq("role", "therapist")
    .eq("approved", false)
    .order("created_at", { ascending: false });

  const { data: approvedTherapists } = await admin
    .from("profiles")
    .select("id, full_name")
    .eq("role", "therapist")
    .eq("approved", true)
    .order("full_name");

  const { data: appointments } = await admin
    .from("appointments")
    .select(
      "id, slot_time, timezone, concern, status, payment_status, patient_id, therapist_id, created_at"
    )
    .order("created_at", { ascending: false });

  const { data: b2bLeads } = await admin
    .from("b2b_leads")
    .select("id, name, phone, source, org_details, status, created_at")
    .order("created_at", { ascending: false });

  const { data: referrals } = await admin
    .from("patient_referrals")
    .select(
      "id, hospital_id, patient_name, medical_issue, treatment_needed, status, assigned_therapist_id, assigned_slot_time, created_at"
    )
    .order("created_at", { ascending: false });

  const { data: allProfiles } = await admin
    .from("profiles")
    .select("id, full_name, email");
  const profileMap = new Map((allProfiles ?? []).map((p) => [p.id, p]));

  return (
    <section className="py-8 max-w-6xl mx-auto px-4">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Admin Dashboard</h1>
          <p className="text-xs text-slate-500 mt-1">
            Manage approvals, bookings, and partner referrals
          </p>
        </div>
        <SignOutButton />
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-8">
        <h2 className="font-bold text-lg text-slate-800 mb-4 flex items-center gap-2">
          Pending Therapist Approvals
          {pendingTherapists && pendingTherapists.length > 0 && (
            <span className="text-xs font-bold text-amber-700 bg-amber-100 px-2 py-1 rounded-full">
              {pendingTherapists.length}
            </span>
          )}
        </h2>
        {!pendingTherapists || pendingTherapists.length === 0 ? (
          <p className="text-xs text-slate-500 py-4 text-center">
            No pending applications.
          </p>
        ) : (
          <ul className="space-y-3">
            {pendingTherapists.map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between gap-4 p-4 rounded-xl border border-slate-200 text-xs"
              >
                <div>
                  <p className="font-bold text-slate-900">{t.full_name}</p>
                  <p className="text-slate-500 mt-1">{t.email}</p>
                  <p className="text-slate-500 mt-1">{t.credentials}</p>
                </div>
                <ApproveTherapistButton therapistId={t.id} />
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-8">
        <h2 className="font-bold text-lg text-slate-800 mb-4 flex items-center gap-2">
          B2B Leads
          {b2bLeads &&
            b2bLeads.filter((l) => l.status === "new").length > 0 && (
              <span className="text-xs font-bold text-amber-700 bg-amber-100 px-2 py-1 rounded-full">
                {b2bLeads.filter((l) => l.status === "new").length} new
              </span>
            )}
        </h2>
        {!b2bLeads || b2bLeads.length === 0 ? (
          <p className="text-xs text-slate-500 py-4 text-center">
            No B2B inquiries yet.
          </p>
        ) : (
          <ul className="space-y-3">
            {b2bLeads.map((lead) => (
              <li
                key={lead.id}
                className="p-4 rounded-xl border border-slate-200 text-xs space-y-2"
              >
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <p className="font-bold text-slate-900">{lead.name}</p>
                    <p className="text-slate-500">{lead.phone}</p>
                  </div>
                  <span className="capitalize font-semibold text-teal-700 bg-teal-50 px-3 py-1 rounded-full">
                    {lead.status}
                  </span>
                </div>
                <p className="text-slate-600">
                  <span className="text-slate-500">Source:</span> {lead.source}
                  {lead.org_details && (
                    <>
                      {" "}
                      — <span className="text-slate-500">Details:</span>{" "}
                      {lead.org_details}
                    </>
                  )}
                </p>
                {lead.status !== "onboarded" && (
                  <OnboardHospitalForm
                    lead={{
                      id: lead.id,
                      name: lead.name,
                      org_details: lead.org_details,
                    }}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-8">
        <h2 className="font-bold text-lg text-slate-800 mb-4 flex items-center gap-2">
          Patient Referrals
          {referrals &&
            referrals.filter((r) => r.status === "pending_review").length >
              0 && (
              <span className="text-xs font-bold text-amber-700 bg-amber-100 px-2 py-1 rounded-full">
                {referrals.filter((r) => r.status === "pending_review").length}{" "}
                pending
              </span>
            )}
        </h2>
        {!referrals || referrals.length === 0 ? (
          <p className="text-xs text-slate-500 py-4 text-center">
            No patient referrals yet.
          </p>
        ) : (
          <ul className="space-y-3">
            {referrals.map((r) => {
              const hospital = profileMap.get(r.hospital_id);
              const assignedTherapist = r.assigned_therapist_id
                ? profileMap.get(r.assigned_therapist_id)
                : null;
              return (
                <li
                  key={r.id}
                  className="p-4 rounded-xl border border-slate-200 text-xs space-y-2"
                >
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <p className="font-bold text-slate-900">
                        {r.patient_name}
                      </p>
                      <p className="text-slate-500">
                        Referred by:{" "}
                        {hospital?.full_name ?? "Unknown partner"}
                      </p>
                    </div>
                    <span className="capitalize font-semibold text-blue-700 bg-blue-50 px-3 py-1 rounded-full">
                      {r.status.replace(/_/g, " ")}
                    </span>
                  </div>
                  <p className="text-slate-600">
                    <strong>{r.medical_issue}</strong>
                    {r.treatment_needed && <> — {r.treatment_needed}</>}
                  </p>
                  {assignedTherapist ? (
                    <p className="text-slate-500">
                      Assigned to: <strong>{assignedTherapist.full_name}</strong>{" "}
                      — {formatSlotTime(r.assigned_slot_time, null)}
                    </p>
                  ) : (
                    <AssignReferralForm
                      referralId={r.id}
                      therapists={approvedTherapists ?? []}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h2 className="font-bold text-lg text-slate-800 mb-4">All Bookings</h2>
        {!appointments || appointments.length === 0 ? (
          <p className="text-xs text-slate-500 py-4 text-center">
            No bookings yet.
          </p>
        ) : (
          <ul className="space-y-3">
            {appointments.map((a) => {
              const patient = profileMap.get(a.patient_id);
              const therapist = a.therapist_id
                ? profileMap.get(a.therapist_id)
                : null;
              return (
                <li
                  key={a.id}
                  className="p-4 rounded-xl border border-slate-200 text-xs space-y-2"
                >
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <p className="font-bold text-slate-900">
                        {patient?.full_name ?? "Unknown patient"}
                      </p>
                      <p className="text-slate-500">{patient?.email}</p>
                    </div>
                    <div className="flex gap-2">
                      <span className="capitalize font-semibold text-teal-700 bg-teal-50 px-3 py-1 rounded-full">
                        {a.status}
                      </span>
                      <span
                        className={`capitalize font-semibold px-3 py-1 rounded-full ${
                          a.payment_status === "paid"
                            ? "text-green-700 bg-green-50"
                            : "text-slate-500 bg-slate-100"
                        }`}
                      >
                        {a.payment_status}
                      </span>
                    </div>
                  </div>
                  <p className="text-slate-600">
                    <strong>{a.concern}</strong> —{" "}
                    {formatSlotTime(a.slot_time, a.timezone)}
                  </p>
                  {therapist ? (
                    <p className="text-slate-500">
                      Assigned to: <strong>{therapist.full_name}</strong>
                    </p>
                  ) : (
                    <AssignTherapistForm
                      appointmentId={a.id}
                      therapists={approvedTherapists ?? []}
                    />
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
