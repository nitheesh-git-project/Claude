import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import SignOutButton from "@/components/auth/SignOutButton";
import ApproveTherapistButton from "@/components/admin/ApproveTherapistButton";
import AssignTherapistForm from "@/components/admin/AssignTherapistForm";
import OnboardHospitalForm from "@/components/admin/OnboardHospitalForm";
import AssignReferralForm from "@/components/admin/AssignReferralForm";
import AdminTabs from "@/components/admin/AdminTabs";
import LeadStatusButtons from "@/components/admin/LeadStatusButtons";
import DeclineReferralButton from "@/components/admin/DeclineReferralButton";
import ResetHospitalPasswordButton from "@/components/admin/ResetHospitalPasswordButton";
import EditRevenueShareForm from "@/components/admin/EditRevenueShareForm";
import CopyInviteLinkButton from "@/components/admin/CopyInviteLinkButton";
import TreatmentCategoryManager from "@/components/admin/TreatmentCategoryManager";
import PackageManager from "@/components/admin/PackageManager";
import TestimonialManager from "@/components/admin/TestimonialManager";
import FaqManager from "@/components/admin/FaqManager";
import SiteRatingsVisibilityToggle from "@/components/admin/SiteRatingsVisibilityToggle";
import ProfileChangeRequestActions from "@/components/admin/ProfileChangeRequestActions";
import AdminPeopleDirectory from "@/components/admin/AdminPeopleDirectory";
import AdminCalendarTab from "@/components/admin/AdminCalendarTab";
import AdminSessionStoryTab from "@/components/admin/AdminSessionStoryTab";
import AdminMetricsTab from "@/components/admin/AdminMetricsTab";
import AvatarThumbnail from "@/components/profile/AvatarThumbnail";
import { formatSlotTime } from "@/lib/formatSlotTime";
import { formatReferralStatus } from "@/lib/referralStatus";
import { SESSION_FEE_PAISE, BASE_DURATION_MINUTES } from "@/lib/pricing";
import { PROFILE_FIELD_LABELS } from "@/lib/profileFieldLabels";

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
    .select("id, full_name, email, credentials, avatar_url, created_at")
    .eq("role", "therapist")
    .eq("approved", false)
    .order("created_at", { ascending: false });

  const { data: pendingProfileChanges } = await admin
    .from("profile_change_requests")
    .select("id, user_id, changes, created_at")
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  // Includes suspended (active: false) therapists deliberately — the
  // reassign-existing-session form (EditBookingForm, used by the Calendar
  // and Session Story tabs) must always be able to show whoever a session
  // is CURRENTLY assigned to, even if they were suspended after the fact,
  // or its <select> silently mismatches its own state. Brand-new-assignment
  // pickers (AssignTherapistForm/AssignReferralForm below) filter this down
  // to active-only themselves, since they have no existing assignment to
  // preserve.
  const { data: approvedTherapists } = await admin
    .from("profiles")
    .select("id, full_name, active")
    .eq("role", "therapist")
    .eq("approved", true)
    .order("full_name");
  const activeApprovedTherapists = (approvedTherapists ?? []).filter(
    (t) => t.active !== false
  );

  const { data: appointments, error: appointmentsError } = await admin
    .from("appointments")
    .select(
      "id, slot_time, timezone, concern, status, payment_status, amount_paid_paise, duration_minutes, category_id, patient_id, therapist_id, notes, created_at, paid_at, patient_rating, patient_feedback, patient_rating_excluded, therapist_rating, therapist_feedback, therapist_rating_excluded, cancellation_reason, refund_status, refund_amount_paise, preferred_therapist_id, package_purchase_id, therapist_payout_paid_at, no_show"
    )
    .order("created_at", { ascending: false });
  // This single query feeds Overview, Calendar, Session Story, and Metrics
  // all at once — if it fails (e.g. a column referenced here doesn't exist
  // yet because a schema.sql update wasn't re-run), every one of those tabs
  // would otherwise silently render as "no bookings" with no indication
  // anything is actually wrong. Log it loudly instead of swallowing it.
  if (appointmentsError) {
    console.error("Admin dashboard: failed to load appointments", appointmentsError);
  }

  const { data: reassignmentLogs } = await admin
    .from("appointment_reassignment_log")
    .select(
      "id, appointment_id, changed_at, changed_by, old_therapist_id, new_therapist_id, old_slot_time, new_slot_time, old_category_id, new_category_id"
    )
    .order("changed_at", { ascending: false });

  const { data: b2bLeads } = await admin
    .from("b2b_leads")
    .select("id, name, phone, email, source, org_details, status, created_at")
    .order("created_at", { ascending: false });

  const { data: referrals } = await admin
    .from("patient_referrals")
    .select(
      "id, hospital_id, patient_name, medical_issue, treatment_needed, status, assigned_therapist_id, assigned_slot_time, invite_token, created_at"
    )
    .order("created_at", { ascending: false });

  const { data: allProfiles } = await admin
    .from("profiles")
    .select(
      "id, full_name, email, role, organization_name, referral_code, revenue_share_percent, referred_by_hospital_id, avatar_url, date_of_birth, gender, credentials, specialization, years_experience, active, phone, created_at, approved"
    );
  const profileMap = new Map((allProfiles ?? []).map((p) => [p.id, p]));

  const hospitals = (allProfiles ?? []).filter((p) => p.role === "hospital");
  const { data: hospitalNotes } = await admin
    .from("hospital_admin_notes")
    .select("hospital_id, temp_password, temp_password_set_at")
    .in("hospital_id", hospitals.map((h) => h.id));
  const hospitalNoteMap = new Map(
    (hospitalNotes ?? []).map((n) => [n.hospital_id, n])
  );
  const patients = (allProfiles ?? [])
    .filter((p) => p.role === "patient")
    .sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  const allTherapists = (allProfiles ?? [])
    .filter((p) => p.role === "therapist")
    .sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

  const { data: treatmentCategories } = await admin
    .from("treatment_categories")
    .select(
      "id, title, description, points, price_paise, duration_minutes, cta_label, display_order, active"
    )
    .order("display_order", { ascending: true })
    .order("id", { ascending: true });

  const { data: packages } = await admin
    .from("treatment_category_packages")
    .select("id, category_id, title, session_count, price_paise, display_order, active")
    .order("display_order", { ascending: true })
    .order("id", { ascending: true });

  const { data: testimonials } = await admin
    .from("testimonials")
    .select("id, patient_name, quote, rating, condition_label, display_order, active")
    .order("display_order", { ascending: true })
    .order("id", { ascending: true });

  const { data: faqs } = await admin
    .from("faqs")
    .select("id, question, answer, display_order, active")
    .order("display_order", { ascending: true })
    .order("id", { ascending: true });

  const { data: siteSettings } = await admin
    .from("site_settings")
    .select("ratings_visible_publicly")
    .eq("id", true)
    .single();
  const categoryMap = new Map((treatmentCategories ?? []).map((c) => [c.id, c]));

  // Revenue rollup per hospital: every paid session belonging to a patient
  // this hospital referred (either channel — invite-link or self-serve
  // code, both set referred_by_hospital_id) counts toward their payout.
  const hospitalRevenue = new Map<
    string,
    { paidSessions: number; totalRevenue: number }
  >();
  for (const appt of appointments ?? []) {
    if (appt.payment_status !== "paid") continue;
    const patient = profileMap.get(appt.patient_id);
    const hospitalId = patient?.referred_by_hospital_id;
    if (!hospitalId) continue;
    const entry = hospitalRevenue.get(hospitalId) ?? {
      paidSessions: 0,
      totalRevenue: 0,
    };
    entry.paidSessions += 1;
    // Falls back to the current session fee only for older paid rows from
    // before amount_paid_paise existed — every payment since then records
    // exactly what was charged, so this never drifts as pricing changes.
    entry.totalRevenue += (appt.amount_paid_paise ?? SESSION_FEE_PAISE) / 100;
    hospitalRevenue.set(hospitalId, entry);
  }

  // Per-category performance: how many bookings each condition category
  // has gotten, and how much revenue it's actually brought in — useful now
  // that price varies by category instead of every booking being worth
  // the same flat fee.
  const categoryStats = new Map<
    string,
    { totalBookings: number; paidBookings: number; totalRevenue: number }
  >();
  for (const appt of appointments ?? []) {
    if (!appt.category_id) continue;
    const entry = categoryStats.get(appt.category_id) ?? {
      totalBookings: 0,
      paidBookings: 0,
      totalRevenue: 0,
    };
    entry.totalBookings += 1;
    if (appt.payment_status === "paid") {
      entry.paidBookings += 1;
      entry.totalRevenue += (appt.amount_paid_paise ?? SESSION_FEE_PAISE) / 100;
    }
    categoryStats.set(appt.category_id, entry);
  }

  const overview = (
    <>
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
                <div className="flex items-center gap-3">
                  <AvatarThumbnail url={t.avatar_url} name={t.full_name ?? "T"} size={36} />
                  <div>
                    <p className="font-bold text-slate-900">{t.full_name}</p>
                    <p className="text-slate-500 mt-1">{t.email}</p>
                    <p className="text-slate-500 mt-1">{t.credentials}</p>
                  </div>
                </div>
                <ApproveTherapistButton therapistId={t.id} />
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-8">
        <h2 className="font-bold text-lg text-slate-800 mb-4 flex items-center gap-2">
          Profile Change Requests
          {pendingProfileChanges && pendingProfileChanges.length > 0 && (
            <span className="text-xs font-bold text-amber-700 bg-amber-100 px-2 py-1 rounded-full">
              {pendingProfileChanges.length}
            </span>
          )}
        </h2>
        {!pendingProfileChanges || pendingProfileChanges.length === 0 ? (
          <p className="text-xs text-slate-500 py-4 text-center">
            No pending profile change requests.
          </p>
        ) : (
          <ul className="space-y-3">
            {pendingProfileChanges.map((r) => {
              const requester = profileMap.get(r.user_id);
              const changes = (r.changes ?? {}) as Record<string, unknown>;
              return (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-4 p-4 rounded-xl border border-slate-200 text-xs flex-wrap"
                >
                  <div>
                    <p className="font-bold text-slate-900">
                      {requester?.full_name ?? "Unknown user"}{" "}
                      <span className="font-normal text-slate-400 capitalize">
                        ({requester?.role ?? "unknown"})
                      </span>
                    </p>
                    <ul className="mt-1 space-y-0.5 text-slate-600">
                      {Object.entries(changes).map(([field, value]) => {
                        const oldValue = (requester as Record<string, unknown> | undefined)?.[
                          field
                        ];
                        return (
                          <li key={field}>
                            <span className="text-slate-400">
                              {PROFILE_FIELD_LABELS[field] ?? field}:
                            </span>{" "}
                            <span className="line-through text-slate-400">
                              {oldValue === null || oldValue === undefined || oldValue === ""
                                ? "(not set)"
                                : String(oldValue)}
                            </span>{" "}
                            →{" "}
                            <strong>{value === null ? "(cleared)" : String(value)}</strong>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                  <ProfileChangeRequestActions requestId={r.id} />
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h2 className="font-bold text-lg text-slate-800 mb-4">All Bookings</h2>
        {appointmentsError ? (
          <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
            Couldn&apos;t load bookings right now — this usually means the database
            schema is out of date. Try re-running supabase/schema.sql, then
            refresh this page. (Calendar, Session Story, and Metrics are
            affected too, since they share this same data.)
          </p>
        ) : !appointments || appointments.length === 0 ? (
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
              const category = a.category_id ? categoryMap.get(a.category_id) : null;
              const feePaise = a.amount_paid_paise ?? category?.price_paise ?? SESSION_FEE_PAISE;
              const durationMinutes = a.duration_minutes ?? category?.duration_minutes ?? BASE_DURATION_MINUTES;
              return (
                <li
                  key={a.id}
                  className="p-4 rounded-xl border border-slate-200 text-xs space-y-2"
                >
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-3">
                      <AvatarThumbnail
                        url={patient?.avatar_url}
                        name={patient?.full_name ?? "P"}
                        size={32}
                      />
                      <div>
                        <p className="font-bold text-slate-900">
                          {patient?.full_name ?? "Unknown patient"}
                        </p>
                        <p className="text-slate-500">{patient?.email}</p>
                      </div>
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
                    {formatSlotTime(a.slot_time, a.timezone)} • {durationMinutes} min
                  </p>
                  <p className="text-slate-500">
                    Fee: <strong>₹{(feePaise / 100).toLocaleString("en-IN")}</strong>
                    {a.payment_status !== "paid" && (
                      <span className="text-slate-400"> (estimated)</span>
                    )}
                  </p>
                  {a.notes && (
                    <p className="text-slate-500">
                      <span className="font-semibold text-slate-400">Notes:</span> {a.notes}
                    </p>
                  )}
                  {therapist ? (
                    <p className="text-slate-500">
                      Assigned to: <strong>{therapist.full_name}</strong>
                    </p>
                  ) : (
                    <AssignTherapistForm
                      appointmentId={a.id}
                      therapists={activeApprovedTherapists}
                      preferredTherapistId={a.preferred_therapist_id}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );

  const b2bPartners = (
    <>
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
                    <p className="text-slate-500">{lead.email}</p>
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
                  <div className="flex items-center gap-3 flex-wrap">
                    <OnboardHospitalForm
                      lead={{
                        id: lead.id,
                        name: lead.name,
                        email: lead.email,
                        org_details: lead.org_details,
                      }}
                    />
                    <LeadStatusButtons leadId={lead.id} status={lead.status} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-8">
        <h2 className="font-bold text-lg text-slate-800 mb-4">
          Hospital Partners
        </h2>
        {hospitals.length === 0 ? (
          <p className="text-xs text-slate-500 py-4 text-center">
            No hospital partners onboarded yet.
          </p>
        ) : (
          <ul className="space-y-3">
            {hospitals.map((h) => {
              const revenue = hospitalRevenue.get(h.id) ?? {
                paidSessions: 0,
                totalRevenue: 0,
              };
              const sharePercent = h.revenue_share_percent ?? 0;
              const hospitalCut = (revenue.totalRevenue * sharePercent) / 100;
              const companyCut = revenue.totalRevenue - hospitalCut;
              return (
                <li
                  key={h.id}
                  className="p-4 rounded-xl border border-slate-200 text-xs space-y-2"
                >
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <p className="font-bold text-slate-900">
                        {h.organization_name}
                      </p>
                      <p className="text-slate-500">
                        {h.full_name} • {h.email}
                      </p>
                    </div>
                    <span className="font-mono font-bold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-lg">
                      {h.referral_code}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-100">
                    <div>
                      <p className="text-slate-400">Revenue Share</p>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-bold text-slate-900">
                          {sharePercent}%
                        </span>
                        <EditRevenueShareForm
                          hospitalId={h.id}
                          currentPercent={sharePercent}
                        />
                      </div>
                    </div>
                    <div>
                      <p className="text-slate-400">Paid Sessions</p>
                      <p className="font-bold text-slate-900">
                        {revenue.paidSessions}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-400">Hospital&apos;s Cut</p>
                      <p className="font-bold text-teal-700">
                        ₹{hospitalCut.toFixed(2)}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-400">Company&apos;s Cut</p>
                      <p className="font-bold text-slate-900">
                        ₹{companyCut.toFixed(2)}
                      </p>
                    </div>
                  </div>
                  <div className="pt-2 border-t border-slate-100">
                    <ResetHospitalPasswordButton
                      hospitalId={h.id}
                      currentPassword={hospitalNoteMap.get(h.id)?.temp_password}
                      currentPasswordSetAt={
                        hospitalNoteMap.get(h.id)?.temp_password_set_at
                      }
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
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
                    <span className="font-semibold text-blue-700 bg-blue-50 px-3 py-1 rounded-full">
                      {formatReferralStatus(r.status)}
                    </span>
                  </div>
                  <p className="text-slate-600">
                    <strong>{r.medical_issue}</strong>
                    {r.treatment_needed && <> — {r.treatment_needed}</>}
                  </p>
                  {assignedTherapist ? (
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <p className="text-slate-500">
                        Assigned to:{" "}
                        <strong>{assignedTherapist.full_name}</strong> —{" "}
                        {formatSlotTime(r.assigned_slot_time, "Asia/Kolkata")}
                      </p>
                      {r.status === "invite_sent" && r.invite_token && (
                        <CopyInviteLinkButton inviteToken={r.invite_token} />
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 flex-wrap">
                      <AssignReferralForm
                        referralId={r.id}
                        therapists={activeApprovedTherapists}
                      />
                      {r.status !== "declined" && (
                        <DeclineReferralButton referralId={r.id} />
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );

  const patientsTab = (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
      <h2 className="font-bold text-lg text-slate-800 mb-4">
        Patients
        <span className="ml-2 text-xs font-normal text-slate-400">
          {patients.length} total
        </span>
      </h2>
      {patients.length === 0 ? (
        <p className="text-xs text-slate-500 py-4 text-center">
          No patients have signed up yet.
        </p>
      ) : (
        <AdminPeopleDirectory
          basePath="/admin/dashboard/patients"
          people={patients.map((p) => ({
            id: p.id,
            full_name: p.full_name,
            subtitle: p.email,
            avatar_url: p.avatar_url,
            active: p.active,
            created_at: p.created_at,
          }))}
        />
      )}
    </div>
  );

  const therapistsTab = (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
      <h2 className="font-bold text-lg text-slate-800 mb-4">
        Therapists
        <span className="ml-2 text-xs font-normal text-slate-400">
          {allTherapists.length} total
        </span>
      </h2>
      {allTherapists.length === 0 ? (
        <p className="text-xs text-slate-500 py-4 text-center">
          No therapists have applied yet.
        </p>
      ) : (
        <AdminPeopleDirectory
          basePath="/admin/dashboard/therapists"
          people={allTherapists.map((t) => ({
            id: t.id,
            full_name: t.full_name,
            subtitle: t.credentials,
            avatar_url: t.avatar_url,
            active: t.active,
            approved: t.approved,
            created_at: t.created_at,
          }))}
        />
      )}
    </div>
  );

  const allPeople = (allProfiles ?? []).map((p) => ({ id: p.id, full_name: p.full_name }));
  const categoriesForReassign = (treatmentCategories ?? []).map((c) => ({
    id: c.id,
    title: c.title,
    price_paise: c.price_paise,
    duration_minutes: c.duration_minutes,
    active: c.active,
  }));

  const calendarTab = (
    <AdminCalendarTab
      appointments={appointments ?? []}
      people={allPeople}
      categories={categoriesForReassign}
      therapists={approvedTherapists ?? []}
      reassignmentLogs={reassignmentLogs ?? []}
    />
  );

  const sessionStoryTab = (
    <AdminSessionStoryTab
      appointments={appointments ?? []}
      people={allPeople}
      categories={categoriesForReassign}
      therapists={approvedTherapists ?? []}
      reassignmentLogs={reassignmentLogs ?? []}
    />
  );

  const metricsTab = (
    <AdminMetricsTab
      appointments={appointments ?? []}
      therapists={allTherapists}
      categories={(treatmentCategories ?? []).map((c) => ({ id: c.id, title: c.title }))}
    />
  );

  const b2bBadgeCount =
    (b2bLeads?.filter((l) => l.status === "new").length ?? 0) +
    (referrals?.filter((r) => r.status === "pending_review").length ?? 0);

  const siteContent = (
    <>
      <SiteRatingsVisibilityToggle
        visible={siteSettings?.ratings_visible_publicly ?? true}
      />

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-8">
        <h2 className="font-bold text-lg text-slate-800 mb-4">
          Category Performance
        </h2>
        {!treatmentCategories || treatmentCategories.length === 0 ? (
          <p className="text-xs text-slate-500 py-4 text-center">
            No categories yet — add one below to start tracking bookings.
          </p>
        ) : (
          <ul className="space-y-3">
            {treatmentCategories.map((c) => {
              const stats = categoryStats.get(c.id) ?? {
                totalBookings: 0,
                paidBookings: 0,
                totalRevenue: 0,
              };
              return (
                <li
                  key={c.id}
                  className="p-4 rounded-xl border border-slate-200 text-xs"
                >
                  <p className="font-bold text-slate-900 mb-2">{c.title}</p>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <p className="text-slate-400">Bookings</p>
                      <p className="font-bold text-slate-900">
                        {stats.totalBookings}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-400">Paid</p>
                      <p className="font-bold text-slate-900">
                        {stats.paidBookings}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-400">Revenue</p>
                      <p className="font-bold text-teal-700">
                        ₹{stats.totalRevenue.toLocaleString("en-IN")}
                      </p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h2 className="font-bold text-lg text-slate-800 mb-1">
          Conditions Treated — Categories
        </h2>
        <p className="text-xs text-slate-500 mb-4">
          Controls what shows on the public /conditions page, and what
          patients can pick (and get charged) in the booking wizard.
        </p>
        <TreatmentCategoryManager
          categories={(treatmentCategories ?? []).map((c) => ({
            ...c,
            points: Array.isArray(c.points) ? (c.points as string[]) : [],
          }))}
        />
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mt-8">
        <h2 className="font-bold text-lg text-slate-800 mb-1">Session Packages</h2>
        <p className="text-xs text-slate-500 mb-4">
          Bundles of sessions a patient can buy upfront at a bundle price,
          then use one at a time when booking — shown on their dashboard.
        </p>
        <PackageManager
          packages={packages ?? []}
          categories={(treatmentCategories ?? []).map((c) => ({ id: c.id, title: c.title }))}
        />
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mt-8">
        <h2 className="font-bold text-lg text-slate-800 mb-1">Testimonials</h2>
        <p className="text-xs text-slate-500 mb-4">
          Controls what shows in the &quot;What Our Patients Say&quot; section on the Home page.
        </p>
        <TestimonialManager testimonials={testimonials ?? []} />
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mt-8">
        <h2 className="font-bold text-lg text-slate-800 mb-1">FAQ</h2>
        <p className="text-xs text-slate-500 mb-4">
          Controls what shows on the public /faq page.
        </p>
        <FaqManager faqs={faqs ?? []} />
      </div>
    </>
  );

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

      <AdminTabs
        overview={overview}
        b2bPartners={b2bPartners}
        b2bBadgeCount={b2bBadgeCount}
        patients={patientsTab}
        therapists={therapistsTab}
        calendar={calendarTab}
        sessionStory={sessionStoryTab}
        metrics={metricsTab}
        siteContent={siteContent}
      />
    </section>
  );
}
