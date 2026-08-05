import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import ApproveTherapistButton from "@/components/admin/ApproveTherapistButton";
import DeclineTherapistButton from "@/components/admin/DeclineTherapistButton";
import AssignTherapistForm from "@/components/admin/AssignTherapistForm";
import OnboardHospitalForm from "@/components/admin/OnboardHospitalForm";
import AssignReferralForm from "@/components/admin/AssignReferralForm";
import AdminTabs from "@/components/admin/AdminTabs";
import AdminPayoutsTab from "@/components/admin/AdminPayoutsTab";
import AdminPayoutRequestsTab, { type PayoutRequestRow } from "@/components/admin/AdminPayoutRequestsTab";
import AdminPaymentHistoryTab from "@/components/admin/AdminPaymentHistoryTab";
import AdminRosterTab from "@/components/admin/AdminRosterTab";
import LeadStatusButtons from "@/components/admin/LeadStatusButtons";
import DeclineReferralButton from "@/components/admin/DeclineReferralButton";
import ReferralCapacityNoteForm from "@/components/admin/ReferralCapacityNoteForm";
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
import AdminFeatureControlTab from "@/components/admin/AdminFeatureControlTab";
import AvatarThumbnail from "@/components/profile/AvatarThumbnail";
import { formatSlotTime } from "@/lib/formatSlotTime";
import { formatReferralStatus } from "@/lib/referralStatus";
import { SESSION_FEE_PAISE, BASE_DURATION_MINUTES } from "@/lib/pricing";
import { PROFILE_FIELD_LABELS } from "@/lib/profileFieldLabels";
import { mergeSessionCodes } from "@/lib/sessionCode";
import { mergeMeetLinks } from "@/lib/meetLink";
import JoinSessionButton from "@/components/JoinSessionButton";
import { computeTherapistPayoutSummary } from "@/lib/therapistPayouts";
import { parseAdminSettings } from "@/lib/adminSettings";
import { JoinWindowProvider } from "@/lib/joinWindowContext";

export const metadata: Metadata = {
  title: "Admin Dashboard | Dr. Pooja's Physio",
};

// A plain module-level helper (not called inline in the component body) so
// it can carry a single Date.now() read down to AdminMetricsTab as a prop --
// see that component's nowMs comment for why the client side must not read
// its own Date.now() for this.
function nowTimestamp() {
  return Date.now();
}

export default async function AdminDashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const admin = createAdminClient();

  // All of these are independent reads -- none needs another query's data,
  // only fixed filters -- so they run as one parallel batch instead of the
  // ~25 sequential round trips this page used to make one at a time. That
  // used to matter on every single admin button click, not just page load:
  // router.refresh() re-runs this entire Server Component, so every prior
  // query's latency was paid again before the next one even started.
  // hospitalNotes further down is the one real exception (it needs
  // allProfiles' hospital ids first) and stays a separate awaited call
  // after this batch resolves. Comments on each query explain the
  // isolation/migration-dependent reasoning for that particular fetch, same
  // as before this was parallelized.
  const [
    { data: pendingTherapists },
    { data: pendingProfileChanges },
    { data: approvedTherapists },
    { data: appointments, error: appointmentsError },
    { data: packagePurchases },
    { data: paymentFailures },
    { data: payoutBatches },
    { data: payoutBatchLinks },
    { data: settingsRow },
    { data: sessionCodeLinks },
    { data: meetLinkRows },
    { data: syncErrorRows },
    { data: availabilityTemplateRows },
    { data: availabilityOverrideRows },
    { data: onLeaveRows },
    { data: reassignmentLogs },
    { data: b2bLeads },
    { data: referrals },
    { data: capacityNoteRows },
    { data: allProfiles },
    { data: roleCodeRows },
    { data: treatmentCategories },
    { data: packages },
    { data: testimonials },
    { data: faqs },
    { data: siteSettings },
    { data: payoutRequests },
  ] = await Promise.all([
    admin
      .from("profiles")
      .select("id, full_name, email, phone, credentials, avatar_url, created_at")
      .eq("role", "therapist")
      .eq("approved", false)
      .order("created_at", { ascending: false }),

    admin
      .from("profile_change_requests")
      .select("id, user_id, changes, created_at")
      .eq("status", "pending")
      .order("created_at", { ascending: false }),

    // Includes suspended (active: false) therapists deliberately — the
    // reassign-existing-session form (EditBookingForm, used by the Calendar
    // and Session Story tabs) must always be able to show whoever a session
    // is CURRENTLY assigned to, even if they were suspended after the fact,
    // or its <select> silently mismatches its own state. Brand-new-assignment
    // pickers (AssignTherapistForm/AssignReferralForm below) filter this down
    // to active-only themselves, since they have no existing assignment to
    // preserve.
    admin
      .from("profiles")
      .select("id, full_name, active")
      .eq("role", "therapist")
      .eq("approved", true)
      .order("full_name"),

    admin
      .from("appointments")
      .select(
        "id, slot_time, timezone, concern, status, payment_status, amount_paid_paise, duration_minutes, category_id, patient_id, therapist_id, notes, created_at, paid_at, razorpay_payment_id, patient_rating, patient_feedback, patient_rating_excluded, therapist_rating, therapist_feedback, therapist_rating_excluded, cancellation_reason, refund_status, refund_amount_paise, preferred_therapist_id, package_purchase_id, therapist_payout_paid_at, therapist_payout_amount_paise, therapist_payout_method, therapist_payout_note, no_show"
      )
      .order("created_at", { ascending: false }),

    // Feeds the Payment History tab's Patient section -- a package purchase
    // is its own real payment event (own razorpay_payment_id), separate from
    // any individual session, so it needs its own fetch rather than being
    // inferred from appointments.
    admin
      .from("patient_package_purchases")
      .select("id, patient_id, category_id, session_count, payment_status, amount_paid_paise, paid_at, razorpay_payment_id")
      .order("paid_at", { ascending: false }),

    // Feeds the Payment History tab's new Receipts section. Both isolated
    // from the queries above for the same reason as the roster tables --
    // new, migration-dependent, and a missing migration should only empty
    // out the Receipts section rather than take down the rest of this page.
    admin
      .from("payment_failure_log")
      .select(
        "id, patient_id, appointment_id, package_purchase_id, amount_paise, error_code, error_reason, error_description, created_at"
      )
      .order("created_at", { ascending: false }),

    admin
      .from("therapist_payout_batches")
      .select("id, therapist_id, amount_paise, method, note, created_at")
      .order("created_at", { ascending: false }),

    // therapist_payout_batch_id lives on appointments, but it's queried
    // separately and merged in below rather than added to the big shared
    // select above -- that select feeds Overview, Calendar, Session Story,
    // and Metrics too, so a missing-column error there (before this
    // migration runs) would blank all of those, not just the Receipts
    // section. Same isolation reasoning as payoutBatches/paymentFailures.
    admin.from("appointments").select("id, therapist_payout_batch_id"),

    // Feature Control tab (Feature 16) -- these site_settings columns are
    // also new/migration-dependent, same isolation reasoning as the queries
    // above: a missing migration degrades to DEFAULT_ADMIN_SETTINGS rather
    // than blanking the whole dashboard.
    admin
      .from("site_settings")
      .select("session_packages_visible, session_timeout_minutes, google_meet_enabled, join_window_minutes, join_window_after_minutes")
      .maybeSingle(),

    // session_code is also new/migration-dependent -- same isolation
    // reasoning as payoutBatchLinks above. Layered on top of the payout-batch
    // merge (rather than the other way around) so Payment History ends up
    // with both new columns at once.
    admin.from("appointments").select("id, session_code"),

    // meet_link is also new/migration-dependent -- same isolation reasoning
    // as sessionCodeLinks above. Merged in here so it flows through to
    // Calendar, Session Story, and the All Bookings list below all at once,
    // same as session_code does.
    admin.from("appointments").select("id, meet_link"),

    // Sync health panel data (Feature Control tab) is built further down,
    // once profileMap (patient/therapist names) is available.
    admin.from("appointments").select("id, google_calendar_sync_error"),

    // Feeds the Manage Roster tab. Both queries can legitimately return
    // nothing (or error, if the migration hasn't been applied to this
    // database yet) -- the tab renders an empty-but-correct grid either way,
    // it never crashes the rest of the dashboard over this.
    admin.from("therapist_availability_template").select("therapist_id, day_of_week, hour"),
    admin
      .from("therapist_availability_override")
      .select("therapist_id, date, hour, available, note"),

    // Deliberately its own query rather than folded into the allProfiles
    // select below -- on_leave is new and migration-dependent same as the two
    // tables above, and allProfiles feeds nearly every other tab on this page.
    // An unknown-column error on one shared query would take all of them down;
    // keeping it isolated means only the roster tab's on_leave badges degrade.
    admin.from("profiles").select("id, on_leave"),

    admin
      .from("appointment_reassignment_log")
      .select(
        "id, appointment_id, changed_at, changed_by, old_therapist_id, new_therapist_id, old_slot_time, new_slot_time, old_category_id, new_category_id"
      )
      .order("changed_at", { ascending: false }),

    admin
      .from("b2b_leads")
      .select("id, name, phone, email, source, org_details, status, created_at")
      .order("created_at", { ascending: false }),

    admin
      .from("patient_referrals")
      .select(
        "id, hospital_id, patient_name, medical_issue, treatment_needed, status, assigned_therapist_id, assigned_slot_time, invite_token, created_at"
      )
      .order("created_at", { ascending: false }),

    // capacity_note is new/migration-dependent -- kept isolated (same
    // reasoning as roleCodeRows/sessionCodeLinks elsewhere on this page) so a
    // missing migration only blanks this one note, not the whole referrals list.
    admin.from("patient_referrals").select("id, capacity_note"),

    admin
      .from("profiles")
      .select(
        "id, full_name, email, role, organization_name, referral_code, revenue_share_percent, referred_by_hospital_id, avatar_url, date_of_birth, gender, credentials, specialization, years_experience, active, phone, created_at, approved, timezone"
      ),

    // patient_code/therapist_code/hospital_code are new/migration-dependent --
    // kept isolated for the same reason as onLeaveRows above (allProfiles
    // feeds nearly every tab on this page; an unknown-column error here should
    // only degrade these ID badges, not take down the rest of the dashboard).
    admin.from("profiles").select("id, patient_code, therapist_code, hospital_code"),

    admin
      .from("treatment_categories")
      .select(
        "id, title, description, points, price_paise, duration_minutes, cta_label, display_order, active"
      )
      .order("display_order", { ascending: true })
      .order("id", { ascending: true }),

    admin
      .from("treatment_category_packages")
      .select("id, category_id, title, session_count, price_paise, display_order, active")
      .order("display_order", { ascending: true })
      .order("id", { ascending: true }),

    admin
      .from("testimonials")
      .select("id, patient_name, quote, rating, condition_label, display_order, active")
      .order("display_order", { ascending: true })
      .order("id", { ascending: true }),

    admin
      .from("faqs")
      .select("id, question, answer, display_order, active")
      .order("display_order", { ascending: true })
      .order("id", { ascending: true }),

    admin.from("site_settings").select("ratings_visible_publicly").eq("id", true).single(),

    // therapist_payout_requests is new/migration-dependent -- kept isolated
    // (it's its own brand-new table, so this is inherently its own query
    // already) so an unknown-table error here only empties this one tab, not
    // the rest of the dashboard.
    admin
      .from("therapist_payout_requests")
      .select("id, therapist_id, requested_amount_paise, status, requested_at, completed_at")
      .order("requested_at", { ascending: false }),
  ]);

  const activeApprovedTherapists = (approvedTherapists ?? []).filter(
    (t) => t.active !== false
  );

  const payoutBatchIdByAppointmentId = new Map(
    (payoutBatchLinks ?? []).map((a) => [a.id, a.therapist_payout_batch_id])
  );

  const adminSettings = parseAdminSettings(settingsRow);

  const appointmentsWithSessionCode = mergeMeetLinks(
    mergeSessionCodes(appointments ?? [], sessionCodeLinks),
    meetLinkRows
  );

  const appointmentsWithPayoutBatch = appointmentsWithSessionCode.map((a) => ({
    ...a,
    therapist_payout_batch_id: payoutBatchIdByAppointmentId.get(a.id) ?? null,
  }));

  const onLeaveMap = new Map((onLeaveRows ?? []).map((r) => [r.id, r.on_leave]));
  // This single query feeds Overview, Calendar, Session Story, and Metrics
  // all at once — if it fails (e.g. a column referenced here doesn't exist
  // yet because a schema.sql update wasn't re-run), every one of those tabs
  // would otherwise silently render as "no bookings" with no indication
  // anything is actually wrong. Log it loudly instead of swallowing it.
  if (appointmentsError) {
    console.error("Admin dashboard: failed to load appointments", appointmentsError);
  }

  const nowForReferrals = nowTimestamp();

  const capacityNoteMap = new Map((capacityNoteRows ?? []).map((r) => [r.id, r.capacity_note]));

  const profileMap = new Map((allProfiles ?? []).map((p) => [p.id, p]));
  const adminProfile = profileMap.get(user.id);

  const roleCodeMap = new Map((roleCodeRows ?? []).map((r) => [r.id, r]));

  // Sync health panel (Feature Control tab): confirmed sessions that either
  // never got a Meet link or recorded a sync error -- surfaces silent
  // Calendar-API failures in-app instead of only in server logs.
  const syncErrorById = new Map((syncErrorRows ?? []).map((r) => [r.id, r.google_calendar_sync_error]));
  const googleMeetSyncIssues = appointmentsWithSessionCode
    .filter((a) => a.status === "confirmed")
    .map((a) => ({ ...a, google_calendar_sync_error: syncErrorById.get(a.id) ?? null }))
    .filter((a) => !a.meet_link || a.google_calendar_sync_error)
    .map((a) => ({
      id: a.id,
      sessionCode: a.session_code ?? null,
      slotTime: a.slot_time,
      patientName: profileMap.get(a.patient_id)?.full_name ?? "Unknown patient",
      therapistName: a.therapist_id ? profileMap.get(a.therapist_id)?.full_name ?? "Unknown therapist" : null,
      error: a.google_calendar_sync_error,
    }));

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

  // Referral-to-registration conversion per hospital: how many of the
  // referrals a hospital has submitted actually turned into a registered
  // patient, vs. still pending/declined. The raw counts already existed on
  // this tab (via `referrals`) -- just wasn't turned into a ratio yet.
  const hospitalReferralStats = new Map<string, { total: number; converted: number }>();
  for (const r of referrals ?? []) {
    const entry = hospitalReferralStats.get(r.hospital_id) ?? { total: 0, converted: 0 };
    entry.total += 1;
    if (r.status === "converted") entry.converted += 1;
    hospitalReferralStats.set(r.hospital_id, entry);
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

  // What used to be the "Overview" tab's own content (pending approvals +
  // All Bookings) -- now shown under the "Approval & Bookings" tab instead,
  // since "Overview" itself is now the Metrics at-a-glance dashboard.
  const approvalBookingsTab = (
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
                    {t.phone && <p className="text-slate-500 mt-1">{t.phone}</p>}
                    <p className="text-slate-500 mt-1">{t.credentials}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <DeclineTherapistButton therapistId={t.id} />
                  <ApproveTherapistButton therapistId={t.id} />
                </div>
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
        ) : appointmentsWithSessionCode.length === 0 ? (
          <p className="text-xs text-slate-500 py-4 text-center">
            No bookings yet.
          </p>
        ) : (
          <ul className="space-y-3">
            {appointmentsWithSessionCode.map((a) => {
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
                          {roleCodeMap.get(a.patient_id)?.patient_code && (
                            <span className="ml-2 font-mono font-normal text-slate-400">
                              {roleCodeMap.get(a.patient_id)?.patient_code}
                            </span>
                          )}
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
                    {a.session_code && (
                      <span className="ml-2 font-mono text-slate-400">{a.session_code}</span>
                    )}
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
                  <JoinSessionButton
                    meetLink={a.meet_link}
                    slotTime={a.slot_time}
                    status={a.status}
                    durationMinutes={durationMinutes}
                    alwaysActive
                  />
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
              const isSuspended = h.active === false;
              // Suspended hospitals stop earning revenue share going
              // forward -- the session still counts in full, the platform
              // just keeps 100% of it instead of splitting, rather than the
              // configured % silently continuing to accrue for a partner
              // who's been suspended.
              const effectiveSharePercent = isSuspended ? 0 : sharePercent;
              const hospitalCut = (revenue.totalRevenue * effectiveSharePercent) / 100;
              const companyCut = revenue.totalRevenue - hospitalCut;
              const referralStats = hospitalReferralStats.get(h.id) ?? { total: 0, converted: 0 };
              const conversionRate =
                referralStats.total > 0 ? (referralStats.converted / referralStats.total) * 100 : null;
              return (
                <li
                  key={h.id}
                  className="p-4 rounded-xl border border-slate-200 text-xs space-y-2"
                >
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-slate-900">
                          {h.organization_name}
                        </p>
                        {roleCodeMap.get(h.id)?.hospital_code && (
                          <span className="text-[10px] font-mono font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                            {roleCodeMap.get(h.id)?.hospital_code}
                          </span>
                        )}
                      </div>
                      <p className="text-slate-500">
                        {h.full_name} • {h.email}
                      </p>
                    </div>
                    <span className="font-mono font-bold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-lg">
                      {h.referral_code}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 pt-2 border-t border-slate-100">
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
                      <p className="text-slate-400">Conversion Rate</p>
                      <p className="font-bold text-slate-900">
                        {conversionRate === null ? "—" : `${conversionRate.toFixed(0)}%`}
                      </p>
                      <p className="text-slate-400">
                        {referralStats.converted}/{referralStats.total} referrals
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-400">Hospital&apos;s Cut</p>
                      <p className="font-bold text-teal-700">
                        ₹{hospitalCut.toFixed(2)}
                      </p>
                      {isSuspended && (
                        <p className="text-red-600">Stopped — suspended</p>
                      )}
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
              // Only meaningful once a slot actually exists and the referral
              // has moved past triage -- a pending_review referral has no
              // slot yet, and a declined one's slot was never going to happen
              // anyway.
              const slotHasPassed =
                (r.status === "invite_sent" || r.status === "converted") &&
                !!r.assigned_slot_time &&
                new Date(r.assigned_slot_time).getTime() < nowForReferrals;
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
                      <p className="text-slate-500 flex items-center gap-2 flex-wrap">
                        Assigned to:{" "}
                        <strong>{assignedTherapist.full_name}</strong> —{" "}
                        {formatSlotTime(r.assigned_slot_time, "Asia/Kolkata")}
                        {slotHasPassed && (
                          <span className="font-bold uppercase text-red-700 bg-red-100 px-2 py-0.5 rounded-full text-[10px]">
                            Slot Passed
                          </span>
                        )}
                      </p>
                      {r.status === "invite_sent" && r.invite_token && (
                        <CopyInviteLinkButton inviteToken={r.invite_token} />
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center gap-3 flex-wrap">
                        <AssignReferralForm
                          referralId={r.id}
                          therapists={activeApprovedTherapists}
                        />
                        {r.status !== "declined" && (
                          <DeclineReferralButton referralId={r.id} />
                        )}
                      </div>
                      {r.status === "pending_review" && (
                        <ReferralCapacityNoteForm
                          referralId={r.id}
                          currentNote={capacityNoteMap.get(r.id) ?? null}
                        />
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
            code: roleCodeMap.get(p.id)?.patient_code ?? null,
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
            code: roleCodeMap.get(t.id)?.therapist_code ?? null,
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
      appointments={appointmentsWithSessionCode}
      people={allPeople}
      categories={categoriesForReassign}
      therapists={approvedTherapists ?? []}
      reassignmentLogs={reassignmentLogs ?? []}
    />
  );

  const sessionStoryTab = (
    <AdminSessionStoryTab
      appointments={appointmentsWithSessionCode}
      people={allPeople}
      categories={categoriesForReassign}
      therapists={approvedTherapists ?? []}
      reassignmentLogs={reassignmentLogs ?? []}
    />
  );

  // therapistId -> revenue-share %, only where an admin has actually set
  // one -- the Metrics tab's revenue breakdown treats a missing entry as
  // "can't compute a split," never as 0%, matching PatientProfitChart's
  // same rule for the identical reason (0% would understate a real payout
  // that just hasn't been configured yet).
  const therapistSharePercent = Object.fromEntries(
    allTherapists
      .filter((t) => t.revenue_share_percent !== null && t.revenue_share_percent !== undefined)
      .map((t) => [t.id, t.revenue_share_percent as number])
  );

  // patientId -> the referring hospital's revenue-share %, only for
  // patients actually referred by a hospital that has one set. Resolved
  // here (not in the client component) since both `patients` and
  // `hospitals` are already in scope from the same allProfiles fetch.
  const hospitalSharePercentById = new Map(
    hospitals
      .filter((h) => h.revenue_share_percent !== null && h.revenue_share_percent !== undefined)
      .map((h) => [h.id, h.revenue_share_percent as number])
  );
  // A suspended hospital stops earning revenue share going forward -- the
  // booking still counts in full toward Gross Revenue/Platform Margin
  // (see moneyByBucketFor), it's just the platform's 100% instead of a
  // split. Kept as an explicit 0% here (not left undefined) so it isn't
  // mistaken for the "share never configured" case, which excludes the
  // booking from the calc entirely instead of splitting it. Same live-view
  // convention as an ordinary revenue_share_percent edit -- applies to
  // every render going forward, not partitioned by suspension date.
  const hospitalActiveById = new Map(hospitals.map((h) => [h.id, h.active !== false]));
  const patientHospitalSharePercent = Object.fromEntries(
    patients
      .filter(
        (p) => p.referred_by_hospital_id && hospitalSharePercentById.has(p.referred_by_hospital_id)
      )
      .map((p) => {
        const hospitalId = p.referred_by_hospital_id as string;
        const configuredShare = hospitalSharePercentById.get(hospitalId) as number;
        const isActive = hospitalActiveById.get(hospitalId) ?? true;
        return [p.id, isActive ? configuredShare : 0];
      })
  );
  const hospitalReferredPatientIds = Object.fromEntries(
    patients.filter((p) => p.referred_by_hospital_id).map((p) => [p.id, true as const])
  );

  const metricsTab = (
    <AdminMetricsTab
      appointments={appointments ?? []}
      therapists={allTherapists}
      categories={(treatmentCategories ?? []).map((c) => ({ id: c.id, title: c.title }))}
      patients={patients.map((p) => ({ id: p.id, full_name: p.full_name }))}
      therapistSharePercent={therapistSharePercent}
      patientHospitalSharePercent={patientHospitalSharePercent}
      hospitalReferredPatientIds={hospitalReferredPatientIds}
      nowMs={nowTimestamp()}
    />
  );

  const payoutsTab = (
    <AdminPayoutsTab
      therapists={allTherapists.map((t) => ({
        id: t.id,
        full_name: t.full_name,
        revenue_share_percent: t.revenue_share_percent,
      }))}
      appointments={appointments ?? []}
      patients={patients.map((p) => ({ id: p.id, full_name: p.full_name }))}
      categories={(treatmentCategories ?? []).map((c) => ({ id: c.id, title: c.title }))}
      nowMs={nowTimestamp()}
    />
  );

  const payoutRequestRows: PayoutRequestRow[] = (payoutRequests ?? []).map((r) => {
    const therapist = profileMap.get(r.therapist_id);
    const currentlyOwedPaise =
      r.status === "pending" || r.status === "reviewing"
        ? computeTherapistPayoutSummary(
            r.therapist_id,
            therapist?.revenue_share_percent ?? null,
            (appointments ?? []).filter((a) => a.therapist_id === r.therapist_id),
            nowTimestamp()
          ).owedPaise
        : 0;
    return {
      id: r.id,
      therapistId: r.therapist_id,
      therapistName: therapist?.full_name ?? "Unknown therapist",
      therapistCode: roleCodeMap.get(r.therapist_id)?.therapist_code ?? null,
      requestedAmountPaise: r.requested_amount_paise,
      requestedAt: r.requested_at,
      status: r.status as "pending" | "reviewing" | "completed",
      completedAt: r.completed_at,
      currentlyOwedPaise,
    };
  });
  const payoutRequestsBadgeCount = payoutRequestRows.filter(
    (r) => r.status === "pending" || r.status === "reviewing"
  ).length;

  const payoutRequestsTab = <AdminPayoutRequestsTab requests={payoutRequestRows} />;

  const paymentHistoryTab = (
    <AdminPaymentHistoryTab
      patients={patients.map((p) => ({
        id: p.id,
        full_name: p.full_name,
        code: roleCodeMap.get(p.id)?.patient_code ?? null,
      }))}
      therapists={allTherapists.map((t) => ({
        id: t.id,
        full_name: t.full_name,
        code: roleCodeMap.get(t.id)?.therapist_code ?? null,
      }))}
      appointments={appointmentsWithPayoutBatch}
      packagePurchases={packagePurchases ?? []}
      paymentFailures={paymentFailures ?? []}
      payoutBatches={payoutBatches ?? []}
      categories={(treatmentCategories ?? []).map((c) => ({ id: c.id, title: c.title }))}
    />
  );

  const rosterTab = (
    <AdminRosterTab
      therapists={allTherapists.map((t) => ({
        id: t.id,
        full_name: t.full_name,
        timezone: t.timezone,
        on_leave: onLeaveMap.get(t.id) ?? false,
      }))}
      templateRows={availabilityTemplateRows ?? []}
      overrideRows={availabilityOverrideRows ?? []}
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

  const featureControl = (
    <AdminFeatureControlTab
      settings={adminSettings}
      syncIssues={googleMeetSyncIssues}
      adminEmail={adminProfile?.email ?? user.email ?? ""}
    />
  );

  // Same computation as the root layout's own showDebugNav -- duplicated
  // here (rather than threaded through props from a layout) because this
  // page hides the shared Navbar entirely and needs the same dev-only-bar
  // offset for its own fixed sidebar. See AdminTabs' offsetTop prop.
  const showDebugNav =
    process.env.NEXT_PUBLIC_SHOW_DEBUG_NAV === "true" ||
    (process.env.NEXT_PUBLIC_SHOW_DEBUG_NAV !== "false" &&
      process.env.NODE_ENV !== "production");

  return (
    <JoinWindowProvider beforeMinutes={adminSettings.joinWindowMinutes} afterMinutes={adminSettings.joinWindowAfterMinutes}>
    <AdminTabs
      overview={metricsTab}
      approvalBookings={approvalBookingsTab}
      sessionStory={sessionStoryTab}
      patients={patientsTab}
      therapists={therapistsTab}
      roster={rosterTab}
      calendar={calendarTab}
      b2bPartners={b2bPartners}
      b2bBadgeCount={b2bBadgeCount}
      payouts={payoutsTab}
      payoutRequests={payoutRequestsTab}
      payoutRequestsBadgeCount={payoutRequestsBadgeCount}
      paymentHistory={paymentHistoryTab}
      siteContent={siteContent}
      featureControl={featureControl}
      adminName={adminProfile?.full_name ?? "Admin"}
      adminEmail={adminProfile?.email ?? user.email ?? ""}
      adminAvatarUrl={adminProfile?.avatar_url ?? null}
      offsetTop={showDebugNav}
      sessionTimeoutMinutes={adminSettings.sessionTimeoutMinutes}
    />
    </JoinWindowProvider>
  );
}
