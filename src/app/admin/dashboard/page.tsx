import type { Metadata } from "next";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import ApproveAccountButton from "@/components/admin/ApproveAccountButton";
import DeclineAccountButton from "@/components/admin/DeclineAccountButton";
import OnboardHospitalForm from "@/components/admin/OnboardHospitalForm";
import AssignReferralForm from "@/components/admin/AssignReferralForm";
import AdminShell, { type AdminScreens } from "@/components/admin/AdminShell";
import DashboardOverview from "@/components/dashboard/DashboardOverview";
import StatStrip, { type StatCell } from "@/components/dashboard/StatStrip";
import { buildAdminFeed } from "@/lib/dashboardFeed";
import AdminInboxQueues from "@/components/admin/AdminInboxQueues";
import AdminAllSessionsTab from "@/components/admin/AdminAllSessionsTab";
import AdminNewBookingTab from "@/components/admin/AdminNewBookingTab";
import AdminTeamAccessTab, { type AdminRow } from "@/components/admin/AdminTeamAccessTab";
import AdminActivityLogTab, { type ActivityRow } from "@/components/admin/AdminActivityLogTab";
import MoneyGlossary from "@/components/admin/MoneyGlossary";
import AdminCostsTab from "@/components/admin/AdminCostsTab";
import { istDateKey } from "@/lib/formatSlotRange";
import HospitalActiveToggle from "@/components/admin/HospitalActiveToggle";
import PackageCatalogManager from "@/components/admin/PackageCatalogManager";
import PackagePurchasesTable from "@/components/admin/PackagePurchasesTable";
import PackageSettingsForm from "@/components/admin/PackageSettingsForm";
import RecommendationSettingsForm from "@/components/admin/RecommendationSettingsForm";
import HomeVisitPurchasesTable from "@/components/admin/HomeVisitPurchasesTable";
import HomeVisitPackageManager from "@/components/admin/HomeVisitPackageManager";
import HomeVisitAreaManager from "@/components/admin/HomeVisitAreaManager";
import HomeVisitCashLedger from "@/components/admin/HomeVisitCashLedger";
import AccountingHealthPanel from "@/components/admin/AccountingHealthPanel";
import { loadAccountingHealth, accountingProblemCount } from "@/lib/accountingHealth";
import {
  applyLedgerSessionBalances,
  applyLedgerVisitBalances,
} from "@/lib/ledgerBalances";
import HomeVisitSettingsForm from "@/components/admin/HomeVisitSettingsForm";
import ContactControlsForm from "@/components/admin/ContactControlsForm";
import { adminScreenHref, type InboxGroup } from "@/lib/adminNav";
import { parseAdminScope, scopeCanOpen, sectionsForScope } from "@/lib/adminScope";
import type { SearchEntity } from "@/components/admin/AdminGlobalSearch";
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
import TestimonialManager from "@/components/admin/TestimonialManager";
import FaqManager from "@/components/admin/FaqManager";
import SiteRatingsVisibilityToggle from "@/components/admin/SiteRatingsVisibilityToggle";
import HomePageWalkthroughForm from "@/components/admin/HomePageWalkthroughForm";
import SplashScreenForm from "@/components/admin/SplashScreenForm";
import BrandContactDetailsForm from "@/components/admin/BrandContactDetailsForm";
import ProfileChangeRequestActions from "@/components/admin/ProfileChangeRequestActions";
import AdminPeopleDirectory from "@/components/admin/AdminPeopleDirectory";
import PagedList from "@/components/dashboard/PagedList";
import AdminCalendarTab from "@/components/admin/AdminCalendarTab";
import AdminMetricsTab from "@/components/admin/AdminMetricsTab";
import QuestionBankManager from "@/components/admin/QuestionBankManager";
import ConditionsListFilter from "@/components/admin/ConditionsListFilter";
import { parseAreaPain } from "@/lib/conditionIntake";
import {
  DEFAULT_CONDITION_SPECIALTY,
  parseConditionSpecialty,
} from "@/lib/conditionSpecialty";
import AdminFeatureControlTab from "@/components/admin/AdminFeatureControlTab";
import AvatarThumbnail from "@/components/profile/AvatarThumbnail";
import { formatSlotTime } from "@/lib/formatSlotTime";
import { formatReferralStatus } from "@/lib/referralStatus";
import { SESSION_FEE_PAISE } from "@/lib/pricing";
import { PROFILE_FIELD_LABELS } from "@/lib/profileFieldLabels";
import { mergeSessionCodes } from "@/lib/sessionCode";
import { mergeMeetLinks } from "@/lib/meetLink";
import { computeTherapistPayoutSummary } from "@/lib/therapistPayouts";
import { parseAdminSettings, SITE_SETTINGS_SELECT } from "@/lib/adminSettings";
import { expireDuePackagePurchases } from "@/lib/expirePackagePurchases";
import {
  retryDueMeetSyncs,
  retryDueMeetAccess,
  MAX_MEET_SYNC_AUTO_ATTEMPTS,
  MAX_MEET_ACCESS_AUTO_ATTEMPTS,
} from "@/lib/retryDueMeetSyncs";
import { runRiskSweep } from "@/lib/riskDetectors";
import RiskSignalsTab from "@/components/admin/RiskSignalsTab";
import SurfaceCard, { EmptyState } from "@/components/dashboard/SurfaceCard";
import AdminCarePlansTab from "@/components/admin/AdminCarePlansTab";
import type { AdminCarePlanRow, AuthorableSession } from "@/components/admin/AdminCarePlansTab";
import type { RecommendableOption } from "@/components/therapist/CarePlanFields";
import { loadRecommendablePackages } from "@/lib/carePlanServer";
import { readCarePlanRequiresApproval } from "@/lib/carePlanAuthoring";
import {
  CARE_PLAN_QUEUE_STALE_HOURS,
  carePlanState,
  isQueueStale,
  parseOfferSnapshot,
  type CarePlanStatus,
} from "@/lib/carePlans";
import type {
  RiskSignalRow,
  RiskReviewRow,
  CommunicationFlagRow,
  ContactRevealRow,
} from "@/components/admin/RiskSignalsTab";
import { summariseFindings, type LeakFinding } from "@/lib/contactLeakScan";
import type { RiskSeverity, RiskStatus, RiskSubjectKind } from "@/lib/riskSignals";
import { JoinWindowProvider } from "@/lib/joinWindowContext";
import { isDebugNavVisible } from "@/lib/debugNavVisible";

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

export default async function AdminDashboardPage({
  searchParams,
}: {
  // Read here rather than only in the client shell so a deep link
  // (?section=money&tab=summary) server-renders that screen directly. The
  // shell still syncs the URL after hydration; without this, a shared link
  // painted Today first and jumped once the client effect ran.
  searchParams: Promise<{ section?: string; tab?: string }>;
}) {
  const { section: sectionParam, tab: tabParam } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const admin = createAdminClient();

  // Runs before the big read below so this same request already sees any
  // purchase this sweep just flipped to 'expired' -- see the helper's own
  // comment for why this is a lazy sweep rather than a scheduled job.
  await expireDuePackagePurchases(admin);

  // Same lazy-sweep pattern, but deliberately *not* awaited before the read
  // below: this one calls the Google Calendar API, and even capped (a few
  // appointments per sweep, a wall-clock timeout each, a per-appointment
  // attempt limit) that is seconds of external latency this page would otherwise pay
  // before its first query. after() runs it once the response has been sent,
  // so a slow or hanging Google costs the admin nothing.
  //
  // The tradeoff is one render of staleness: a session this sweep fixes shows
  // as fixed on the *next* render rather than this one. That is the right way
  // round -- the panel exists for failures that have already been sitting
  // there, so one more render makes no difference, while a blocked page is
  // felt on every single admin request.
  after(async () => {
    await retryDueMeetSyncs(admin);
    // The waiting-room pass, after the event pass and bounded the same way.
    // A session whose Meet space is still TRUSTED works -- it just makes
    // both parties wait to be admitted -- so it is the lower priority of the
    // two, and it must run second for a plainer reason: a session the first
    // pass has only just given an event to has already had its access set
    // by the same call.
    await retryDueMeetAccess(admin);
    // The detector sweep, after the response for the same reason: it makes
    // no outbound calls but it does run several aggregate queries, and a
    // finding that appears one render later costs nothing -- the queue
    // exists for patterns that have been building for days. Its own
    // interval guard means most renders skip it entirely.
    await runRiskSweep(admin);
  });

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
    { data: pendingAccounts },
    { data: pendingProfileChanges },
    { data: approvedTherapists },
    { data: appointments, error: appointmentsError },
    { data: packagePurchases },
    { data: paymentFailures },
    { data: payoutBatches },
    { data: appointmentExtraColumns },
    { data: settingsRow },
    { data: syncAttemptRows },
    { data: meetAccessRows },
    { data: availabilityTemplateRows },
    { data: availabilityOverrideRows },
    { data: scheduleStateRows },
    { data: onLeaveRows },
    { data: leaveDetailRows },
    { data: reassignmentLogs },
    { data: b2bLeads },
    { data: referrals },
    { data: capacityNoteRows },
    { data: allProfiles },
    { data: roleCodeRows },
    { data: treatmentCategories },
    { data: packages },
    { data: packagePurchaseSummaries },
    { data: testimonials },
    { data: faqs },
    { data: siteSettings },
    { data: payoutRequests },
    { data: conditionProfiles },
    { count: conditionRequestsPendingCount },
    { count: conditionAccessPendingCount },
    { data: homeVisitPackages },
    { data: homeVisitAreas },
    { data: homeVisitWaitlist },
    { data: homeVisitAreaUsage },
    { data: homeVisitAppointments },
    { data: homeVisitShareRows },
    { data: homeVisitPurchases },
    { data: adminScopeRows },
    { data: activityLogRows },
    { data: businessExpenseRows },
  ] = await Promise.all([
    // Both self-serve roles wait on admin approval, so this one query feeds
    // the single "Pending Approvals" list -- therapist applications and
    // patient registrations together, newest first. Hospital-referred
    // patients never show up here: that route creates them already approved
    // (the admin vetted them when issuing the invite).
    admin
      .from("profiles")
      .select("id, role, full_name, email, phone, credentials, avatar_url, created_at")
      .in("role", ["therapist", "patient"])
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

    // Four columns that live on appointments but are kept out of the big
    // shared select above: that select feeds Overview, Calendar, Session
    // Story and Metrics, so a missing-column error there (on a database the
    // migration hasn't reached) would blank all of those at once rather than
    // just the sections these four feed.
    //
    // They were four separate queries, one per column, which meant four full
    // scans of the fastest-growing table on this page every render. They are
    // one query now: the isolation that matters is from the *big* select, not
    // from each other, and all four columns have been live long enough that
    // the failure they are isolated against is a fresh-database case, where
    // they would all be missing together anyway. A genuinely new column still
    // gets its own call (see google_calendar_sync_attempts below) until it
    // has settled.
    admin
      .from("appointments")
      .select("id, therapist_payout_batch_id, session_code, meet_link, google_calendar_sync_error"),

    // Feature Control tab (Feature 16) -- these site_settings columns are
    // also new/migration-dependent, same isolation reasoning as the queries
    // above: a missing migration degrades to DEFAULT_ADMIN_SETTINGS rather
    // than blanking the whole dashboard.
    admin
      .from("site_settings")
      .select(SITE_SETTINGS_SELECT)
      .maybeSingle(),

    // The auto-retry attempt counter is newer than the error column above,
    // so it gets its own isolated call rather than joining it -- a database
    // that hasn't had this migration applied yet would otherwise fail that
    // query too and blank the whole Sync Health panel, instead of just
    // losing the "gave up" flag. Same convention as the settled columns above.
    admin.from("appointments").select("id, google_calendar_sync_attempts"),

    // The Meet waiting-room columns, newest of all and isolated for the same
    // reason: a database this migration has not reached loses the Waiting
    // Room panel and nothing else.
    admin.from("appointments").select("id, meet_access_open, meet_access_error, meet_access_attempts"),

    // Feeds the Manage Roster tab. Both queries can legitimately return
    // nothing (or error, if the migration hasn't been applied to this
    // database yet) -- the tab renders an empty-but-correct grid either way,
    // it never crashes the rest of the dashboard over this.
    admin.from("therapist_availability_template").select("therapist_id, day_of_week, hour"),
    admin
      .from("therapist_availability_override")
      .select("therapist_id, date, hour, available, note"),

    // The version each therapist's schedule is at, so an editor opened on
    // this screen can be rejected rather than silently overwrite an edit
    // made in another tab. Newest table in the file, so it gets the same
    // isolated treatment as the two above: without it, the roster editor
    // just sends no version and behaves as it did before.
    admin.from("therapist_schedule_state").select("therapist_id, version"),

    // Deliberately its own query rather than folded into the allProfiles
    // select below -- on_leave is new and migration-dependent same as the two
    // tables above, and allProfiles feeds nearly every other tab on this page.
    // An unknown-column error on one shared query would take all of them down;
    // keeping it isolated means only the roster tab's on_leave badges degrade.
    admin.from("profiles").select("id, on_leave"),

    // Leave dates and reason -- newer than on_leave itself and isolated for
    // the same reason. They annotate the flag; nothing computes
    // availability from them.
    admin.from("profiles").select("id, on_leave_from, on_leave_to, on_leave_reason"),

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
        "id, hospital_id, patient_name, medical_issue, treatment_needed, status, assigned_therapist_id, assigned_slot_time, invite_token, created_at, visit_mode, pincode"
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

    // Session Manager's Catalog section -- every column the admin catalog
    // form can edit (see PackageCatalogForm / validatePackagePayload.ts).
    admin
      .from("treatment_category_packages")
      .select(
        "id, package_code, category_id, title, subtitle, description, image_url, promises, badge_label, highlight, terms, session_count, price_paise, compare_at_paise, display_order, therapist_rate_basis, validity_days, session_duration_minutes, therapist_locked, min_gap_hours, max_sessions_per_week, max_purchases_per_patient, visible_on_home, visible_on_conditions, visible_in_dashboard, active"
      )
      .order("display_order", { ascending: true })
      .order("id", { ascending: true }),

    // Session Manager's Purchases section -- the view already derives
    // completed/scheduled/pending; names are resolved below via the
    // allProfiles/roleCodeMap lookups this page already has, same
    // avoid-a-blocked-RLS-join reasoning as the view's own comment in
    // schema.sql.
    admin
      .from("package_purchase_summary")
      .select(
        "id, purchase_code, patient_id, package_id, category_id, session_count, sessions_used, amount_paid_paise, payment_status, status, locked_therapist_id, expires_at, paid_at, created_at, completed_count, scheduled_count, pending_count"
      )
      .order("created_at", { ascending: false }),

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

    // Patient Care Intake / Pain Map -- new/migration-dependent tables,
    // same isolation reasoning as therapist_payout_requests above: an
    // unknown-table error here only empties the Patient Conditions tab and
    // its badge, not the rest of the dashboard.
    admin.from("patient_condition_profiles").select("patient_id, status, updated_at, data"),
    admin
      .from("condition_change_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
    admin
      .from("condition_access_grants")
      .select("id", { count: "exact", head: true })
      .eq("status", "requested"),

    // Home Visit tab. These four tables are new, so on a database that
    // hasn't re-run schema.sql each query fails on its own and comes back
    // as null -- emptying only the Home Visit tab, not the rest of this
    // page, same reasoning as the condition tables above.
    admin
      .from("home_visit_packages")
      .select(
        "id, package_code, title, subtitle, description, image_url, benefits, badge_label, highlight, terms, visit_count, price_paise, compare_at_paise, visit_duration_minutes, validity_days, travel_fee_included, therapist_locked, min_gap_hours, max_visits_per_week, max_purchases_per_patient, category_id, display_order, visible_on_home, visible_on_home_visit_page, visible_in_dashboard, active"
      )
      .order("display_order", { ascending: true })
      .order("id", { ascending: true }),
    admin
      .from("home_visit_areas")
      .select("id, city, area_name, pincode, travel_fee_paise, notes, active")
      .order("city", { ascending: true })
      .order("pincode", { ascending: true }),
    admin
      .from("home_visit_waitlist")
      .select("id, name, phone, email, pincode, city, note, status, created_at")
      .order("created_at", { ascending: false }),
    // Which areas are actually referenced by a booked visit. Drives whether
    // the Service Areas row offers Delete at all -- deleting an area that a
    // past visit points at would strip the fee context off that visit, so
    // the UI offers Deactivate instead. The route enforces this too (on the
    // foreign key); this is only so the button isn't shown to be refused.
    admin.from("appointments").select("visit_area_id").not("visit_area_id", "is", null),

    // The Visits queue. Its own query rather than a filter over the page's
    // main appointments read: that select predates the visit_ columns, and
    // adding them there would let one unknown column blank every session
    // list on this dashboard.
    admin
      .from("appointments")
      .select(
        "id, session_code, slot_time, timezone, concern, status, duration_minutes, patient_id, therapist_id, payment_status, amount_paid_paise, travel_fee_paise, no_show, visit_address_line1, visit_address_line2, visit_landmark, visit_city, visit_state, visit_pincode, visit_latitude, visit_longitude, visit_contact_phone, visit_access_notes, cash_collected_at, cash_collected_amount_paise, cash_remitted_at, payment_method, home_visit_purchase_id, refund_status, refund_amount_paise"
      )
      .eq("visit_mode", "home_visit")
      .order("slot_time", { ascending: true }),

    // The Payouts tab needs each therapist's home-visit-specific rate. Its
    // own isolated query, same reasoning as roleCodeRows -- this column
    // postdates the big shared profiles select, and an unknown-column error
    // there would blank the whole page, not just this one figure.
    admin.from("profiles").select("id, home_visit_revenue_share_percent").eq("role", "therapist"),

    // The Programmes sub-tab -- every home-visit purchase, not just the
    // current admin's session. No completed_count/scheduled_count view
    // exists for this table the way package_purchase_summary does for the
    // online side, so those are derived below from homeVisitAppointments
    // (already loaded, one purchase's visits are a handful of rows at
    // most) rather than adding a schema-level view for it.
    admin
      .from("home_visit_package_purchases")
      .select(
        "id, purchase_code, patient_id, package_id, visit_count, visits_used, amount_paid_paise, payment_mode, payment_status, status, locked_therapist_id, expires_at, created_at"
      )
      .order("created_at", { ascending: false }),

    // Team & access. admin_scope is new/migration-dependent, so it's its own
    // query rather than a column on the big allProfiles select -- an
    // unknown-column error there would blank every tab on this page, and
    // parseAdminScope() treats a missing value as 'full', which is exactly
    // how every admin behaved before scopes existed.
    admin.from("profiles").select("id, admin_scope").eq("role", "admin"),

    // Activity log -- brand-new table, so an unknown-table error here empties
    // only this one screen. Capped rather than unbounded: this table grows
    // forever by design, and the screen filters within what it loads.
    //
    // 200 rather than 500 because every row carries a jsonb `details` blob
    // and this is the largest payload on a page that loads all six sections
    // at once, for a screen almost nobody opens on a given day. Older
    // entries are still in the table; this is what the screen shows.
    admin
      .from("admin_activity_log")
      .select("id, actor_id, action, target_label, amount_paise, details, created_at")
      .order("created_at", { ascending: false })
      .limit(200),

    // The clinic's own running costs. Its own isolated query because
    // business_expenses is a new table -- before the migration lands, an
    // unknown-table error here must cost the Money screens their cost lines
    // and nothing else, the same convention session_notes and session_code
    // already follow.
    admin
      .from("business_expenses")
      .select("id, incurred_on, category, description, amount_paise")
      .order("incurred_on", { ascending: false })
      .limit(500),
  ]);

  // Resolved here rather than beside the admin-team list further down,
  // because the screens built below gate their own money controls on it. A
  // control a viewer's scope can't call must not render: the routes now
  // enforce scope (requireAdminScope), so an ungated button would be a 403
  // the admin can see but never explain. The session controls need no
  // equivalent flag here -- they only ever render inside the Sessions
  // section, which a viewer reaching them can open by definition. The
  // person pages are the exception, and compute their own (see
  // PatientDetailContent).
  const adminScopeById = new Map((adminScopeRows ?? []).map((r) => [r.id, r.admin_scope]));
  const viewerScope = parseAdminScope(adminScopeById.get(user.id));
  const canSeeMoney = scopeCanOpen(viewerScope, "money");

  // Read after the main Promise.all rather than inside it: every query in
  // there is against a table that has existed for a while, and these are
  // against three that are brand new. loadAccountingHealth swallows its own
  // errors and reports `available: false`, so a database that has not
  // re-run schema.sql shows one panel saying so instead of blanking the
  // whole dashboard -- the failure mode the migration-tolerance rule exists
  // to prevent.
  const accountingHealth = await loadAccountingHealth(admin);

  const activeApprovedTherapists = (approvedTherapists ?? []).filter(
    (t) => t.active !== false
  );

  // One query, four merges. Each consumer below still sees exactly the shape
  // it saw when these were four separate fetches.
  const appointmentExtras = appointmentExtraColumns ?? [];
  const payoutBatchIdByAppointmentId = new Map(
    appointmentExtras.map((a) => [a.id, a.therapist_payout_batch_id])
  );

  const adminSettings = parseAdminSettings(settingsRow);

  // When the ledger is authoritative, every balance on this page comes from
  // it instead of from sessions_used / visits_used. Applied to the rows
  // once, here, rather than to the ~8 components that read them -- they all
  // consume the same `session_count` / `sessions_used` shape, so replacing
  // the number on the row flips all of them at once. A no-op while the flag
  // is off.
  const ledgerAuthoritative = adminSettings.entitlementLedgerAuthoritative;
  const packagePurchasesForDisplay = await applyLedgerSessionBalances(
    admin,
    packagePurchaseSummaries ?? [],
    { authoritative: ledgerAuthoritative }
  );
  const homeVisitPurchasesForDisplay = await applyLedgerVisitBalances(
    admin,
    homeVisitPurchases ?? [],
    { authoritative: ledgerAuthoritative }
  );

  // Its own call, not part of SITE_SETTINGS_SELECT: this column is newer
  // than the rest, and a database that hasn't run the latest schema.sql
  // should leave the feature off rather than blank every other setting.
  const { data: suggestionsToggleRow } = await supabase
    .from("site_settings")
    .select("therapist_suggestions_enabled")
    .maybeSingle();
  const therapistSuggestionsEnabled =
    suggestionsToggleRow?.therapist_suggestions_enabled === true;

  // Same reasoning again, and through the same helper the submit route uses
  // so the screen and the rule cannot disagree about what the switch says.
  const carePlanRequiresApproval = await readCarePlanRequiresApproval(admin);

  // Same reasoning as the toggle above: treatment_categories.image_url is the
  // newest column on that table, and the batch it would otherwise join is one
  // Promise.all of ~40 queries -- an unknown-column error there would blank
  // the whole dashboard rather than one cover photo.
  const { data: categoryImageRows } = await admin
    .from("treatment_categories")
    .select("id, image_url");
  const categoryImageById = new Map(
    (categoryImageRows ?? []).map((row) => [row.id, row.image_url as string | null])
  );

  // And the condition type, newer still, in its own call for the same
  // reason -- losing it costs the therapist's picker its grouping, never the
  // dashboard.
  let categorySpecialtyById = new Map<string, string | null>();
  try {
    const { data: rows } = await admin
      .from("treatment_categories")
      .select("id, specialty");
    categorySpecialtyById = new Map(
      (rows ?? []).map((row) => [row.id, (row as { specialty: string | null }).specialty ?? null])
    );
  } catch {
    // Untagged database. Every condition reads as "Not set".
  }

  // testimonials.avatar_url is migration-dependent too, so it stays out of
  // the ~40-query Promise.all above for the reason the category covers do.
  const { data: testimonialAvatarRows } = await admin
    .from("testimonials")
    .select("id, avatar_url");
  const testimonialAvatarById = new Map(
    (testimonialAvatarRows ?? []).map((row) => [row.id, row.avatar_url as string | null])
  );

  const appointmentsWithSessionCode = mergeMeetLinks(
    mergeSessionCodes(
      appointments ?? [],
      appointmentExtras.map((a) => ({ id: a.id, session_code: a.session_code }))
    ),
    appointmentExtras.map((a) => ({ id: a.id, meet_link: a.meet_link }))
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
  const syncErrorById = new Map(
    appointmentExtras.map((r) => [r.id, r.google_calendar_sync_error])
  );
  const syncAttemptsById = new Map(
    (syncAttemptRows ?? []).map((r) => [r.id, r.google_calendar_sync_attempts])
  );
  const meetAccessById = new Map((meetAccessRows ?? []).map((r) => [r.id, r]));
  const googleMeetSyncIssues = appointmentsWithSessionCode
    .filter((a) => a.status === "confirmed")
    .map((a) => ({
      ...a,
      google_calendar_sync_error: syncErrorById.get(a.id) ?? null,
      google_calendar_sync_attempts: syncAttemptsById.get(a.id) ?? 0,
    }))
    .filter((a) => !a.meet_link || a.google_calendar_sync_error)
    .map((a) => ({
      id: a.id,
      sessionCode: a.session_code ?? null,
      slotTime: a.slot_time,
      patientName: profileMap.get(a.patient_id)?.full_name ?? "Unknown patient",
      therapistName: a.therapist_id ? profileMap.get(a.therapist_id)?.full_name ?? "Unknown therapist" : null,
      error: a.google_calendar_sync_error,
      // Separates "the automatic sweep hasn't got to this yet" from "the
      // sweep has given up and this needs a person" -- without it every row
      // in the panel looks equally like something the system might still fix
      // on its own, and the genuinely stuck ones never get looked at.
      autoRetryExhausted:
        (a.google_calendar_sync_attempts ?? 0) >= MAX_MEET_SYNC_AUTO_ATTEMPTS,
      autoRetryAttempts: a.google_calendar_sync_attempts ?? 0,
    }));

  // Waiting Room panel (Settings -> System Health): confirmed sessions whose
  // Meet space could not be switched to OPEN, so both the patient and the
  // therapist will be held until somebody admits them. Deliberately a
  // separate list from the sync issues above even though both render on the
  // same screen: these sessions have a working link and a working invite,
  // and the fix is a different call (see /api/admin/open-meet-access).
  const meetWaitingRoomIssues = appointmentsWithSessionCode
    .filter((a) => a.status === "confirmed")
    .map((a) => ({ ...a, access: meetAccessById.get(a.id) }))
    .filter((a) => a.meet_link && a.access?.meet_access_open === false)
    .map((a) => ({
      id: a.id,
      sessionCode: a.session_code ?? null,
      slotTime: a.slot_time,
      patientName: profileMap.get(a.patient_id)?.full_name ?? "Unknown patient",
      therapistName: a.therapist_id
        ? profileMap.get(a.therapist_id)?.full_name ?? "Unknown therapist"
        : null,
      error: a.access?.meet_access_error ?? null,
      autoRetryExhausted:
        (a.access?.meet_access_attempts ?? 0) >= MAX_MEET_ACCESS_AUTO_ATTEMPTS,
      autoRetryAttempts: a.access?.meet_access_attempts ?? 0,
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
    { totalBookings: number; paidBookings: number; totalRevenue: number; packageCashCollected: number }
  >();
  for (const appt of appointments ?? []) {
    if (!appt.category_id) continue;
    const entry = categoryStats.get(appt.category_id) ?? {
      totalBookings: 0,
      paidBookings: 0,
      totalRevenue: 0,
      packageCashCollected: 0,
    };
    entry.totalBookings += 1;
    if (appt.payment_status === "paid") {
      entry.paidBookings += 1;
      // A package-covered session's own amount_paid_paise is its slice of
      // the bundle price, so this already recognizes package revenue one
      // session at a time as sessions get scheduled -- see
      // packageRevenueInRange's comment in adminMetrics.ts for why that's
      // deliberately not the same number as packageCashCollected below.
      entry.totalRevenue += (appt.amount_paid_paise ?? SESSION_FEE_PAISE) / 100;
    }
    categoryStats.set(appt.category_id, entry);
  }
  // Full package purchase amounts, collected up front regardless of how
  // many of that purchase's sessions have been scheduled yet -- see
  // packageRevenueInRange's own comment for why this is kept separate from
  // totalRevenue rather than merged into it.
  for (const p of packagePurchaseSummaries ?? []) {
    if (p.payment_status !== "paid") continue;
    const entry = categoryStats.get(p.category_id) ?? {
      totalBookings: 0,
      paidBookings: 0,
      totalRevenue: 0,
      packageCashCollected: 0,
    };
    entry.packageCashCollected += (p.amount_paid_paise ?? 0) / 100;
    categoryStats.set(p.category_id, entry);
  }

  // The two queues that wait on a human decision: new signups, and requests
  // to change a profile. This used to carry a third card, a full "All
  // Bookings" list -- one of the four duplicate session lists the
  // reorganisation exists to remove. Sessions live in Sessions -> All
  // Sessions now, and nowhere else.
  const approvalsTab = (
    <>
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-8">
        <h2 className="font-display font-bold text-lg text-slate-800 mb-4 flex items-center gap-2">
          Pending Approvals
          {pendingAccounts && pendingAccounts.length > 0 && (
            <span className="text-xs font-bold text-amber-700 bg-amber-100 px-2 py-1 rounded-full">
              {pendingAccounts.length}
            </span>
          )}
        </h2>
        {/* What this queue is actually deciding, since the two halves of it
            are not the same decision. A therapist is a credential check --
            that is the real judgement here. A patient in this list is
            someone who registered without paying: anyone who genuinely
            attempts a payment is approved automatically at that moment (see
            approvePatientForGenuinePaymentAttempt), so nobody is waiting
            here to be allowed to buy their first session. */}
        <p className="-mt-2 mb-4 max-w-2xl text-xs leading-relaxed text-slate-500">
          Therapists here are waiting on a credentials check. Patients here registered without
          booking — a patient who starts a payment is approved automatically, so approving one
          from this list only affects what they can see, never whether they can pay.
        </p>
        {!pendingAccounts || pendingAccounts.length === 0 ? (
          <p className="text-xs text-slate-500 py-4 text-center">
            No pending applications or registrations.
          </p>
        ) : (
          <PagedList
            noun="application"
            storageKey="admin-pending-accounts"
            className="space-y-3"
            filters={[
              { key: "therapist", label: "Therapists" },
              { key: "patient", label: "Patients" },
            ]}
            items={pendingAccounts.map((p) => {
              const isTherapist = p.role === "therapist";
              return {
                id: p.id,
                group: isTherapist ? "therapist" : "patient",
                node: (
                <div className="flex items-center justify-between gap-4 p-4 rounded-xl border border-slate-200 text-xs">
                  <div className="flex items-center gap-3">
                    <AvatarThumbnail
                      url={p.avatar_url}
                      name={p.full_name ?? (isTherapist ? "T" : "P")}
                      size={36}
                    />
                    <div>
                      <p className="font-bold text-slate-900 flex items-center gap-2">
                        {p.full_name}
                        <span
                          className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full ${
                            isTherapist
                              ? "text-purple-700 bg-purple-100"
                              : "text-teal-700 bg-teal-100"
                          }`}
                        >
                          {isTherapist ? "Therapist" : "Patient"}
                        </span>
                      </p>
                      <p className="text-slate-500 mt-1">{p.email}</p>
                      {p.phone && <p className="text-slate-500 mt-1">{p.phone}</p>}
                      {isTherapist && p.credentials && (
                        <p className="text-slate-500 mt-1">{p.credentials}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <DeclineAccountButton
                      userId={p.id}
                      role={isTherapist ? "therapist" : "patient"}
                    />
                    <ApproveAccountButton userId={p.id} />
                  </div>
                </div>
              ),
              };
            })}
          />
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-8">
        <h2 className="font-display font-bold text-lg text-slate-800 mb-4 flex items-center gap-2">
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
          <PagedList
            noun="request"
            storageKey="admin-change-requests"
            className="space-y-3"
            items={pendingProfileChanges.map((r) => {
              const requester = profileMap.get(r.user_id);
              const changes = (r.changes ?? {}) as Record<string, unknown>;
              return {
                id: r.id,
                node: (
                <div className="flex items-center justify-between gap-4 p-4 rounded-xl border border-slate-200 text-xs flex-wrap">
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
                </div>
              ),
              };
            })}
          />
        )}
      </div>

    </>
  );

  const b2bPartners = (
    <>
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-8">
        <h2 className="font-display font-bold text-lg text-slate-800 mb-4 flex items-center gap-2">
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
          <PagedList
            noun="lead"
            storageKey="admin-leads"
            className="space-y-3"
            filters={[
              { key: "new", label: "New" },
              { key: "contacted", label: "Contacted" },
              { key: "onboarded", label: "Onboarded" },
            ]}
            items={b2bLeads.map((lead) => ({
              id: lead.id,
              group: lead.status,
              node: (
              <div className="p-4 rounded-xl border border-slate-200 text-xs space-y-2">
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
              </div>
              ),
            }))}
          />
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-8">
        <h2 className="font-display font-bold text-lg text-slate-800 mb-4">
          Hospital Partners
        </h2>
        {hospitals.length === 0 ? (
          <p className="text-xs text-slate-500 py-4 text-center">
            No hospital partners onboarded yet.
          </p>
        ) : (
          <PagedList
            noun="partner"
            nounPlural="partners"
            storageKey="admin-partners"
            className="space-y-3"
            filters={[
              { key: "active", label: "Active" },
              { key: "suspended", label: "Suspended" },
            ]}
            items={hospitals.map((h) => {
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
              return {
                id: h.id,
                group: isSuspended ? "suspended" : "active",
                node: (
                  <div className="p-4 rounded-xl border border-slate-200 text-xs space-y-2">
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
                      <EditRevenueShareForm
                        hospitalId={h.id}
                        currentPercent={sharePercent}
                      />
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
                      <p className="text-slate-400">Partner&apos;s share</p>
                      <p className="font-bold text-teal-700">
                        ₹{hospitalCut.toFixed(2)}
                      </p>
                      {isSuspended && (
                        <p className="text-red-600">Stopped — suspended</p>
                      )}
                    </div>
                    <div>
                      <p className="text-slate-400">Clinic&apos;s share</p>
                      <p className="font-bold text-slate-900">
                        ₹{companyCut.toFixed(2)}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-start justify-between gap-3 pt-2 border-t border-slate-100">
                    <ResetHospitalPasswordButton
                      hospitalId={h.id}
                      currentPassword={hospitalNoteMap.get(h.id)?.temp_password}
                      currentPasswordSetAt={
                        hospitalNoteMap.get(h.id)?.temp_password_set_at
                      }
                    />
                    <HospitalActiveToggle
                      hospitalId={h.id}
                      active={h.active !== false}
                      sharePercent={sharePercent}
                    />
                  </div>
                  </div>
                ),
              };
            })}
          />
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h2 className="font-display font-bold text-lg text-slate-800 mb-4 flex items-center gap-2">
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
          <PagedList
            noun="referral"
            storageKey="admin-referrals"
            className="space-y-3"
            filters={[
              { key: "pending_review", label: "Needs triage" },
              { key: "therapist_assigned", label: "Therapist assigned" },
              { key: "converted", label: "Booked" },
              { key: "declined", label: "Declined" },
              { key: "withdrawn", label: "Withdrawn" },
            ]}
            items={referrals.map((r) => {
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
              return {
                id: r.id,
                node: (
                <div className="p-4 rounded-xl border border-slate-200 text-xs space-y-2">
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
                    <div className="flex items-center gap-2">
                      {r.visit_mode === "home_visit" && (
                        <span className="font-semibold text-teal-700 bg-teal-50 px-3 py-1 rounded-full">
                          Home Visit{r.pincode ? ` · ${r.pincode}` : ""}
                        </span>
                      )}
                      <span className="font-semibold text-blue-700 bg-blue-50 px-3 py-1 rounded-full">
                        {formatReferralStatus(r.status)}
                      </span>
                    </div>
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
                </div>
              ),
              };
            })}
          />
        )}
      </div>
    </>
  );

  // Severity signal for the Patients tab -- surfacing what the patient
  // self-reported right where admin already manages patients, rather than
  // requiring a separate trip to Patient Conditions to see it. Not a
  // recommendation engine (that's a bigger product decision on its own) --
  // just visibility of the existing signal at the point admin is already
  // looking.
  const conditionSignalByPatientId = new Map(
    (conditionProfiles ?? []).map((c) => {
      const data = (c.data ?? {}) as Record<string, string>;
      const severity = data.severity ? Number(data.severity) : null;
      const areaCount = parseAreaPain(data.area_pain).length;
      return [c.patient_id, { severity, areaCount }];
    })
  );

  const conditionStatusByPatientId = new Map(
    (conditionProfiles ?? []).map((c) => [c.patient_id, c.status as string])
  );

  // "Has anyone written a record for this patient" -- keyed off the data
  // rather than off the specialty column, which defaults to ortho and so
  // is never null. An autosaved draft creates the row before anyone has
  // decided anything, which a null check would misread as a finished
  // chart.
  const onboardedPatientIds = new Set(
    (conditionProfiles ?? [])
      .filter((c) =>
        Object.values((c.data ?? {}) as Record<string, string>).some(
          (v) => typeof v === "string" && v.trim()
        )
      )
      .map((c) => c.patient_id as string)
  );

  // `specialty` is a new column, so it is read in its own query and
  // merged in. The dashboard's main Promise.all is ~40 queries deep and
  // an unknown-column error inside it would blank every screen rather
  // than one chip -- the rule treatment_categories.image_url documents.
  const { data: conditionSpecialtyRows } = await admin
    .from("patient_condition_profiles")
    .select("patient_id, specialty");
  const conditionSpecialtyByPatientId = new Map(
    (conditionSpecialtyRows ?? []).map((c) => [
      c.patient_id as string,
      parseConditionSpecialty(c.specialty),
    ])
  );

  const patientsTab = (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
      <h2 className="font-display font-bold text-lg text-slate-800 mb-4">
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
          noun="patient"
          storageKey="admin-patients"
          people={patients.map((p) => {
            const signal = conditionSignalByPatientId.get(p.id);
            const signalText =
              signal && (signal.severity != null || signal.areaCount > 0)
                ? [
                    signal.severity != null ? `Severity ${signal.severity}/10` : null,
                    signal.areaCount > 0 ? `${signal.areaCount} pain area${signal.areaCount > 1 ? "s" : ""}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")
                : null;
            return {
              id: p.id,
              full_name: p.full_name,
              subtitle: signalText ? `${p.email} · ${signalText}` : p.email,
              avatar_url: p.avatar_url,
              active: p.active,
              approved: p.approved,
              created_at: p.created_at,
              code: roleCodeMap.get(p.id)?.patient_code ?? null,
              careStatus: conditionStatusByPatientId.get(p.id) ?? "not_started",
            };
          })}
        />
      )}
    </div>
  );

  const conditionUpdatedAtByPatientId = new Map(
    (conditionProfiles ?? []).map((c) => [c.patient_id, c.updated_at as string])
  );
  const conditionsBadgeCount = (conditionRequestsPendingCount ?? 0) + (conditionAccessPendingCount ?? 0);

  const conditionsTab = (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
      <h2 className="font-display font-bold text-lg text-slate-800 mb-1">
        Patient Conditions
        {conditionsBadgeCount > 0 && (
          <span className="ml-2 rounded-full bg-amber-300 px-1.5 py-0.5 text-[11px] font-bold text-amber-900">
            {conditionsBadgeCount} pending
          </span>
        )}
      </h2>
      <p className="text-xs text-slate-500 mb-4">
        Health Profile answers and Pain Map data for every patient. Open a patient to review
        submissions, therapist access requests, and pain assessments.
      </p>

      <details className="mb-6 rounded-xl border border-slate-200 p-4">
        <summary className="text-sm font-bold text-slate-700 cursor-pointer">Manage Questions</summary>
        <div className="mt-4">
          <QuestionBankManager />
        </div>
      </details>

      {patients.length === 0 ? (
        <p className="text-xs text-slate-500 py-4 text-center">No patients have signed up yet.</p>
      ) : (
        <ConditionsListFilter
          rows={patients.map((p) => ({
            id: p.id,
            full_name: p.full_name,
            email: p.email,
            status: conditionStatusByPatientId.get(p.id) ?? "not_started",
            updatedAt: conditionUpdatedAtByPatientId.get(p.id) ?? null,
            specialty: conditionSpecialtyByPatientId.get(p.id) ?? DEFAULT_CONDITION_SPECIALTY,
            onboarded: onboardedPatientIds.has(p.id),
          }))}
        />
      )}
    </div>
  );

  const therapistsTab = (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
      <h2 className="font-display font-bold text-lg text-slate-800 mb-4">
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
          noun="therapist"
          storageKey="admin-therapists"
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

  // The home-visit half of a session, resolved once and handed to both
  // screens that can open a session -- the calendar and the All Sessions
  // list -- so a visit shows the same detail whichever one it was opened
  // from. Names come from the profile map this page already builds, the same
  // avoid-a-blocked-RLS-join approach used everywhere else here.
  const homeVisitRows = (homeVisitAppointments ?? []).map((v) => ({
    ...v,
    patientName: profileMap.get(v.patient_id)?.full_name ?? "Unknown patient",
    patientCode: roleCodeMap.get(v.patient_id)?.patient_code ?? null,
    therapistName: v.therapist_id
      ? profileMap.get(v.therapist_id)?.full_name ?? "Unknown therapist"
      : null,
  }));

  const calendarTab = (
    <AdminCalendarTab
      canSeeMoney={canSeeMoney}
      appointments={appointmentsWithSessionCode}
      people={allPeople}
      categories={categoriesForReassign}
      therapists={approvedTherapists ?? []}
      reassignmentLogs={reassignmentLogs ?? []}
      homeVisits={homeVisitRows}
    />
  );

  const allSessionsTab = (
    <AdminAllSessionsTab
      canSeeMoney={canSeeMoney}
      appointments={appointmentsWithSessionCode}
      homeVisits={homeVisitRows}
      people={allPeople}
      categories={categoriesForReassign}
      therapists={approvedTherapists ?? []}
      reassignmentLogs={reassignmentLogs ?? []}
    />
  );

  const newBookingTab = (
    <AdminNewBookingTab
      patients={patients.map((p) => ({ id: p.id, full_name: p.full_name, email: p.email }))}
      therapists={activeApprovedTherapists.map((t) => ({ id: t.id, full_name: t.full_name }))}
      categories={categoriesForReassign}
      leadTimeHours={adminSettings.onlineBookingLeadTimeHours}
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
  // booking still counts in full toward gross revenue and clinic share
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

  // One component, two screens: Summary answers "how much money", Performance
  // answers "how well did it go". The maths is identical and lives in
  // adminMetrics.ts either way -- see AdminMetricsTab's `view` prop.
  // Enriches the page's main appointments array with the home-visit columns
  // needed for correct payout math (visit_mode, travel_fee_paise, and the
  // cash collection/remittance pair the net-off reads). Left-joined via a
  // map rather than adding these columns to the shared select above -- that
  // select feeds Overview/Calendar/Session Story/Metrics too, so an
  // unknown-column error there would blank all of those, not just Payouts.
  const homeVisitPayoutDetailById = new Map(
    (homeVisitAppointments ?? []).map((v) => [
      v.id,
      {
        visit_mode: "home_visit" as const,
        travel_fee_paise: v.travel_fee_paise,
        payment_method: v.payment_method,
        cash_collected_at: v.cash_collected_at,
        cash_collected_amount_paise: v.cash_collected_amount_paise,
        cash_remitted_at: v.cash_remitted_at,
      },
    ])
  );
  const appointmentsForPayouts = (appointments ?? []).map((a) => ({
    ...a,
    ...(homeVisitPayoutDetailById.get(a.id) ?? {
      visit_mode: "online" as const,
      // An online session is always card/UPI through the gateway; only a
      // home visit can be settled in cash.
      payment_method: null as string | null,
    }),
  }));
  const homeVisitShareById = new Map(
    (homeVisitShareRows ?? []).map((r) => [r.id, r.home_visit_revenue_share_percent])
  );

  // Same map as homeVisitShareById, keyed for the Money screens' own
  // Record<string, number> props -- a therapist with no separate visit rate
  // is simply absent, which is what "fall back to the online share" means to
  // every consumer of it.
  const therapistHomeVisitSharePercent: Record<string, number> = {};
  for (const [id, percent] of homeVisitShareById) {
    if (percent !== null && percent !== undefined) therapistHomeVisitSharePercent[id] = percent;
  }

  const moneySummaryTab = (
    <>
      <div className="mt-6">
      <AdminMetricsTab
        view="summary"
        /* The payout-enriched array, not the plain one: without visit_mode,
           travel_fee_paise and the cash columns, every home visit's travel
           reimbursement drops out of the therapists' share and reappears as
           clinic share, and the "owed to therapists" balance ignores cash
           the therapist is already holding. */
        appointments={appointmentsForPayouts}
        packagePurchases={(packagePurchaseSummaries ?? []).map((p) => ({
          category_id: p.category_id,
          payment_status: p.payment_status,
          amount_paid_paise: p.amount_paid_paise,
          paid_at: p.paid_at,
        }))}
        therapists={allTherapists}
        categories={(treatmentCategories ?? []).map((c) => ({ id: c.id, title: c.title }))}
        patients={patients.map((p) => ({ id: p.id, full_name: p.full_name }))}
        expenses={businessExpenseRows ?? []}
        gatewayFeePercent={adminSettings.paymentGatewayFeePercent}
        therapistSharePercent={therapistSharePercent}
        therapistHomeVisitSharePercent={therapistHomeVisitSharePercent}
        patientHospitalSharePercent={patientHospitalSharePercent}
        hospitalReferredPatientIds={hospitalReferredPatientIds}
        nowMs={nowTimestamp()}
      />

      </div>
    </>
  );

  // Operating quality, under Sessions rather than Money. Same component and
  // the same one-pass maths as the money views -- only the slice differs.
  const deliveryTab = (
    <AdminMetricsTab
      view="delivery"
      appointments={appointmentsForPayouts}
      packagePurchases={(packagePurchaseSummaries ?? []).map((p) => ({
        category_id: p.category_id,
        payment_status: p.payment_status,
        amount_paid_paise: p.amount_paid_paise,
        paid_at: p.paid_at,
      }))}
      therapists={allTherapists}
      categories={(treatmentCategories ?? []).map((c) => ({ id: c.id, title: c.title }))}
      patients={patients.map((p) => ({ id: p.id, full_name: p.full_name }))}
      expenses={businessExpenseRows ?? []}
      gatewayFeePercent={adminSettings.paymentGatewayFeePercent}
      therapistSharePercent={therapistSharePercent}
      therapistHomeVisitSharePercent={therapistHomeVisitSharePercent}
      patientHospitalSharePercent={patientHospitalSharePercent}
      hospitalReferredPatientIds={hospitalReferredPatientIds}
      nowMs={nowTimestamp()}
    />
  );

  const moneyBreakdownTab = (
    <>
      <AdminMetricsTab
        view="breakdown"
        appointments={appointmentsForPayouts}
        packagePurchases={(packagePurchaseSummaries ?? []).map((p) => ({
          category_id: p.category_id,
          payment_status: p.payment_status,
          amount_paid_paise: p.amount_paid_paise,
          paid_at: p.paid_at,
        }))}
        therapists={allTherapists}
        categories={(treatmentCategories ?? []).map((c) => ({ id: c.id, title: c.title }))}
        patients={patients.map((p) => ({ id: p.id, full_name: p.full_name }))}
        expenses={businessExpenseRows ?? []}
        gatewayFeePercent={adminSettings.paymentGatewayFeePercent}
        therapistSharePercent={therapistSharePercent}
        therapistHomeVisitSharePercent={therapistHomeVisitSharePercent}
        patientHospitalSharePercent={patientHospitalSharePercent}
        hospitalReferredPatientIds={hospitalReferredPatientIds}
        nowMs={nowTimestamp()}
      />

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mt-8">
        <h2 className="font-display font-bold text-lg text-slate-800 mb-4">
          Category Performance
        </h2>
        {!treatmentCategories || treatmentCategories.length === 0 ? (
          <p className="text-xs text-slate-500 py-4 text-center">
            No categories yet — add one in Site Content to start tracking bookings.
          </p>
        ) : (
          <PagedList
            noun="category"
            nounPlural="categories"
            storageKey="admin-categories"
            className="space-y-3"
            items={treatmentCategories.map((c) => {
              const stats = categoryStats.get(c.id) ?? {
                totalBookings: 0,
                paidBookings: 0,
                totalRevenue: 0,
                packageCashCollected: 0,
              };
              return {
                id: c.id,
                node: (
                <div className="p-4 rounded-xl border border-slate-200 text-xs">
                  <p className="font-bold text-slate-900 mb-2">{c.title}</p>
                  <div className="grid grid-cols-4 gap-3">
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
                      <p className="text-slate-400">Session revenue</p>
                      <p className="font-bold text-teal-700">
                        ₹{stats.totalRevenue.toLocaleString("en-IN")}
                      </p>
                    </div>
                    <div title="Package purchases paid for under this category, collected up front. Session revenue to the left recognises the same money gradually instead, one session at a time as they get scheduled -- so the two are deliberately different figures, not a discrepancy.">
                      <p className="text-slate-400">Package cash collected</p>
                      <p className="font-bold text-teal-700">
                        ₹{stats.packageCashCollected.toLocaleString("en-IN")}
                      </p>
                    </div>
                  </div>
                </div>
              ),
              };
            })}
          />
        )}
      </div>
    </>
  );

  const payoutsTab = (
    <AdminPayoutsTab
      therapists={allTherapists.map((t) => ({
        id: t.id,
        full_name: t.full_name,
        revenue_share_percent: t.revenue_share_percent,
        home_visit_revenue_share_percent: homeVisitShareById.get(t.id) ?? null,
      }))}
      appointments={appointmentsForPayouts}
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
            appointmentsForPayouts.filter((a) => a.therapist_id === r.therapist_id),
            nowTimestamp(),
            homeVisitShareById.get(r.therapist_id) ?? null
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

  const leaveDetailById = new Map(
    (leaveDetailRows ?? []).map((r) => [
      r.id,
      {
        from: (r.on_leave_from as string | null) ?? null,
        to: (r.on_leave_to as string | null) ?? null,
        reason: (r.on_leave_reason as string | null) ?? null,
      },
    ])
  );

  const rosterTab = (
    <AdminRosterTab
      therapists={allTherapists.map((t) => ({
        id: t.id,
        full_name: t.full_name,
        timezone: t.timezone,
        on_leave: onLeaveMap.get(t.id) ?? false,
        on_leave_from: leaveDetailById.get(t.id)?.from ?? null,
        on_leave_to: leaveDetailById.get(t.id)?.to ?? null,
        on_leave_reason: leaveDetailById.get(t.id)?.reason ?? null,
        approved: t.approved ?? null,
        active: t.active ?? null,
      }))}
      templateRows={availabilityTemplateRows ?? []}
      overrideRows={availabilityOverrideRows ?? []}
      scheduleVersions={Object.fromEntries(
        (scheduleStateRows ?? []).map((r) => [r.therapist_id as string, r.version as number])
      )}
      // Only what the roster needs to warn about hours being removed from
      // under a booking -- the same array every other session screen on this
      // page already has, not a second fetch.
      appointments={appointmentsWithPayoutBatch.map((a) => ({
        id: a.id,
        therapist_id: a.therapist_id ?? null,
        slot_time: a.slot_time ?? null,
        status: a.status ?? null,
        patientName: profileMap.get(a.patient_id)?.full_name ?? "Unknown patient",
      }))}
      todayKey={istDateKey(new Date(nowTimestamp()).toISOString())}
      // The schedule and exception routes are `sessions`; leave is `people`.
      // Every scope that can open this section holds both today, but the
      // flags are computed rather than assumed -- a scope table change must
      // hide the control, not produce a 403 with nothing explaining it.
      canManageSchedule={scopeCanOpen(viewerScope, "sessions")}
      canManageLeave={scopeCanOpen(viewerScope, "people")}
    />
  );

  const b2bBadgeCount =
    (b2bLeads?.filter((l) => l.status === "new").length ?? 0) +
    (referrals?.filter((r) => r.status === "pending_review").length ?? 0);

  const packageTitleMap = new Map((packages ?? []).map((p) => [p.id, p.title]));
  const categoryTitleMap = new Map((treatmentCategories ?? []).map((c) => [c.id, c.title]));
  const packagePurchaseRows = packagePurchasesForDisplay.map((p) => ({
    id: p.id,
    purchaseCode: p.purchase_code,
    patientId: p.patient_id,
    patientName: profileMap.get(p.patient_id)?.full_name ?? "Unknown patient",
    patientCode: roleCodeMap.get(p.patient_id)?.patient_code ?? null,
    packageId: p.package_id,
    packageTitle: packageTitleMap.get(p.package_id) ?? "Session Package",
    categoryId: p.category_id,
    categoryTitle: categoryTitleMap.get(p.category_id) ?? "—",
    therapistId: p.locked_therapist_id,
    therapistName: p.locked_therapist_id ? profileMap.get(p.locked_therapist_id)?.full_name ?? "Unknown therapist" : null,
    sessionCount: p.session_count,
    sessionsUsed: p.sessions_used,
    completedCount: p.completed_count,
    scheduledCount: p.scheduled_count,
    pendingCount: p.pending_count,
    amountPaidPaise: p.amount_paid_paise,
    paymentStatus: p.payment_status,
    status: p.status,
    expiresAt: p.expires_at,
    createdAt: p.created_at,
  }));

  // The Session Manager tab used to own three unrelated things at once --
  // a catalog, a purchases table and a settings form. Each now sits with its
  // own kind: catalog and purchases next to their home-visit equivalents
  // under Catalog, settings with every other setting.
  const catalogPackagesTab = (
    <div className="space-y-8">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h2 className="font-display font-bold text-lg text-slate-800 mb-1">Session Packages</h2>
        <p className="text-xs text-slate-500 mb-4">
          Bundles of online sessions, priced against a condition category.
        </p>
        <PackageCatalogManager
          packages={packages ?? []}
          categories={(treatmentCategories ?? []).map((c) => ({
            id: c.id,
            title: c.title,
            price_paise: c.price_paise,
          }))}
        />
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h2 className="font-display font-bold text-lg text-slate-800 mb-1">Home Visit Packages</h2>
        <p className="text-xs text-slate-500 mb-4">
          Bundles of visits delivered at the patient&apos;s address. Different fields from the
          online packages above — visits rather than sessions, and travel is part of the deal —
          so they keep their own editor while living on the same screen.
        </p>
        <HomeVisitPackageManager
          packages={(homeVisitPackages ?? []).map((p) => ({
            ...p,
            // benefits is jsonb -- defaults to '[]' in the schema, but a row
            // written before that default (or by hand) can still be null.
            benefits: Array.isArray(p.benefits) ? (p.benefits as string[]) : [],
          }))}
          categories={(treatmentCategories ?? []).map((c) => ({ id: c.id, title: c.title }))}
        />
      </div>
    </div>
  );

  // An area is "in use" if any visit already points at it. patient_addresses
  // also reference areas, but an address is editable by its owner and never
  // needs the historical fee context a delivered visit does, so a visit is
  // the thing that makes an area permanent.
  const usedAreaIds = new Set(
    (homeVisitAreaUsage ?? []).map((a) => a.visit_area_id as string).filter(Boolean)
  );

  const homeVisitPackageTitleMap = new Map((homeVisitPackages ?? []).map((p) => [p.id, p]));
  const homeVisitNowMs = nowTimestamp();
  const homeVisitCompletedByPurchase = new Map<string, number>();
  const homeVisitScheduledByPurchase = new Map<string, number>();
  for (const v of homeVisitAppointments ?? []) {
    if (!v.home_visit_purchase_id) continue;
    if (v.status === "completed") {
      homeVisitCompletedByPurchase.set(
        v.home_visit_purchase_id,
        (homeVisitCompletedByPurchase.get(v.home_visit_purchase_id) ?? 0) + 1
      );
    } else if (
      (v.status === "requested" || v.status === "confirmed") &&
      v.slot_time &&
      new Date(v.slot_time).getTime() > homeVisitNowMs
    ) {
      homeVisitScheduledByPurchase.set(
        v.home_visit_purchase_id,
        (homeVisitScheduledByPurchase.get(v.home_visit_purchase_id) ?? 0) + 1
      );
    }
  }
  const homeVisitPurchaseRows = homeVisitPurchasesForDisplay.map((p) => {
    const completedCount = homeVisitCompletedByPurchase.get(p.id) ?? 0;
    const scheduledCount = homeVisitScheduledByPurchase.get(p.id) ?? 0;
    return {
      id: p.id,
      purchaseCode: p.purchase_code,
      patientId: p.patient_id,
      patientName: profileMap.get(p.patient_id)?.full_name ?? "Unknown patient",
      patientCode: roleCodeMap.get(p.patient_id)?.patient_code ?? null,
      packageId: p.package_id,
      packageTitle: homeVisitPackageTitleMap.get(p.package_id)?.title ?? "Home Visit Package",
      therapistId: p.locked_therapist_id,
      therapistName: p.locked_therapist_id
        ? profileMap.get(p.locked_therapist_id)?.full_name ?? "Unknown therapist"
        : null,
      visitCount: p.visit_count,
      visitsUsed: p.visits_used,
      completedCount,
      scheduledCount,
      pendingCount: Math.max(p.visit_count - p.visits_used, 0),
      amountPaidPaise: p.amount_paid_paise,
      paymentMode: p.payment_mode,
      paymentStatus: p.payment_status,
      status: p.status,
      expiresAt: p.expires_at,
      createdAt: p.created_at,
    };
  });

  const catalogPurchasesTab = (
    <div className="space-y-8">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h2 className="font-display font-bold text-lg text-slate-800 mb-1">Session Package Purchases</h2>
        <p className="text-xs text-slate-500 mb-4">
          Every online programme bought, and how much of it has been used.
        </p>
        <PackagePurchasesTable
          canSeeMoney={canSeeMoney}
          purchases={packagePurchaseRows}
          packages={(packages ?? []).map((p) => ({ id: p.id, title: p.title }))}
          categories={(treatmentCategories ?? []).map((c) => ({ id: c.id, title: c.title }))}
          therapists={activeApprovedTherapists.map((t) => ({ id: t.id, full_name: t.full_name }))}
        />
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h2 className="font-display font-bold text-lg text-slate-800 mb-1">Home Visit Purchases</h2>
        <p className="text-xs text-slate-500 mb-4">
          The same thing for visits at the patient&apos;s address. A cash-on-visit purchase sits
          at &ldquo;unpaid&rdquo; for its whole life by design — check the payment mode before
          reading that as money owed.
        </p>
        <HomeVisitPurchasesTable
          canSeeMoney={canSeeMoney}
          purchases={homeVisitPurchaseRows}
          packages={(homeVisitPackages ?? []).map((p) => ({ id: p.id, title: p.title }))}
          therapists={activeApprovedTherapists.map((t) => ({ id: t.id, full_name: t.full_name }))}
        />
      </div>
    </div>
  );

  const catalogAreasTab = (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
      <h2 className="font-display font-bold text-lg text-slate-800 mb-1">Service Areas</h2>
      <p className="text-xs text-slate-500 mb-4">
        Which pincodes home visits can be sold in, and the travel fee each one carries. The
        waitlist below is demand from outside those areas — a request for this list to grow.
      </p>
      <HomeVisitAreaManager
        areas={(homeVisitAreas ?? []).map((a) => ({
          ...a,
          in_use: usedAreaIds.has(a.id),
        }))}
        waitlist={homeVisitWaitlist ?? []}
      />
    </div>
  );

  // Site Content used to be one tab holding four unrelated things. Its
  // categories are what we sell (Catalog); its brand strings, public-page
  // content and ratings switch are configuration (Settings).
  // What is actually on sale right now, above the editor -- Catalog is the
  // one section where the question is "what does a patient see?", and that
  // was only answerable by opening all four tabs and counting.
  const activeCategoryCount = (treatmentCategories ?? []).filter((c) => c.active).length;
  const visiblePackageCount = (packages ?? []).filter((p) => p.active).length;
  const catalogStrip = (
    <div className="mb-5">
      <StatStrip
        cells={[
          {
            label: "Conditions on sale",
            value: String(activeCategoryCount),
            note:
              (treatmentCategories ?? []).length > activeCategoryCount
                ? `${(treatmentCategories ?? []).length - activeCategoryCount} hidden from patients`
                : "All of them are live",
            accent: "bg-teal-500",
          },
          {
            label: "Programmes",
            value: String(visiblePackageCount),
            note: "Therapists can recommend these",
            accent: visiblePackageCount > 0 ? "bg-blue-500" : "bg-slate-400",
          },
          {
            label: "Service areas",
            value: String((homeVisitAreas ?? []).length),
            note: adminSettings.homeVisitEnabled ? "Pincodes a therapist will travel to" : "Home visits are switched off",
            accent: adminSettings.homeVisitEnabled ? "bg-emerald-500" : "bg-slate-400",
          },
          {
            label: "Programmes sold",
            value: String(packagePurchaseRows.length),
            note: "Package purchases on record",
            accent: "bg-slate-400",
          },
        ]}
      />
    </div>
  );

  const catalogConditionsTab = (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
      <h2 className="font-display font-bold text-lg text-slate-800 mb-1">Conditions Treated</h2>
      <p className="text-xs text-slate-500 mb-4">
        Controls what shows on the public /conditions page, and what patients can pick (and get
        charged) in the booking wizard.
      </p>
      <TreatmentCategoryManager
        categories={(treatmentCategories ?? []).map((c) => ({
          ...c,
          image_url: categoryImageById.get(c.id) ?? null,
          specialty: categorySpecialtyById.get(c.id) ?? null,
          points: Array.isArray(c.points) ? (c.points as string[]) : [],
        }))}
      />
    </div>
  );

  const settingsBrandTab = (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
      <BrandContactDetailsForm
        details={{
          siteName: adminSettings.siteName,
          siteTagline: adminSettings.siteTagline,
          siteDescription: adminSettings.siteDescription,
          contactEmail: adminSettings.contactEmail,
          whatsappNumber: adminSettings.whatsappNumber,
          contactPhone: adminSettings.contactPhone,
          footerCopyrightText: adminSettings.footerCopyrightText,
        }}
      />
    </div>
  );

  const settingsPublicSiteTab = (
    <div className="space-y-8">
      <SiteRatingsVisibilityToggle visible={siteSettings?.ratings_visible_publicly ?? true} />

      <HomePageWalkthroughForm seconds={adminSettings.journeyStepSeconds} />

      <SplashScreenForm
        enabled={adminSettings.splashEnabled}
        brandLine={adminSettings.splashBrandLine}
        siteName={adminSettings.siteName}
        phrase={adminSettings.splashPhrase}
        holdSeconds={adminSettings.splashHoldSeconds}
        revisitMinutes={adminSettings.splashRevisitMinutes}
      />

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h2 className="font-display font-bold text-lg text-slate-800 mb-1">Testimonials</h2>
        <p className="text-xs text-slate-500 mb-4">
          Controls the patient-story band on the Home page and Our Mission.
        </p>
        <TestimonialManager
          testimonials={(testimonials ?? []).map((t) => ({
            ...t,
            avatar_url: testimonialAvatarById.get(t.id) ?? null,
          }))}
        />
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h2 className="font-display font-bold text-lg text-slate-800 mb-1">FAQ</h2>
        <p className="text-xs text-slate-500 mb-4">Controls what shows on the public /faq page.</p>
        <FaqManager faqs={faqs ?? []} />
      </div>
    </div>
  );

  // Every rule about how booking behaves, in one place -- the platform-wide
  // switches, then the two package rule sets. They were on three different
  // tabs before, which is how the online lead time ended up hardcoded while
  // its home-visit twin was a setting.
  const settingsBookingTab = (
    <div className="space-y-8">
      <AdminFeatureControlTab
        settings={adminSettings}
        syncIssues={googleMeetSyncIssues}
        waitingRoomIssues={meetWaitingRoomIssues}
        adminEmail={adminProfile?.email ?? user.email ?? ""}
        view="booking"
      />
      <RecommendationSettingsForm
        settings={adminSettings}
        requiresApproval={carePlanRequiresApproval}
      />
      <PackageSettingsForm
        settings={adminSettings}
        therapistSuggestionsEnabled={therapistSuggestionsEnabled}
        autoAssignEnabled={adminSettings.autoAssignTherapistEnabled}
      />
      <HomeVisitSettingsForm
        settings={adminSettings}
        areaCount={(homeVisitAreas ?? []).length}
        packageCount={(homeVisitPackages ?? []).length}
      />
    </div>
  );

  const settingsClinicalTab = (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
      <h2 className="font-display font-bold text-lg text-slate-800 mb-1">Clinical Questions</h2>
      <p className="text-xs text-slate-500 mb-4">
        The Health Profile question sets and the Pain Map templates. Editing these changes
        what patients and therapists are asked from here on; answers already submitted are
        untouched.
      </p>
      <QuestionBankManager />
    </div>
  );

  const settingsHealthTab = (
    <div className="space-y-8">
      <AdminFeatureControlTab
        settings={adminSettings}
        syncIssues={googleMeetSyncIssues}
        waitingRoomIssues={meetWaitingRoomIssues}
        adminEmail={adminProfile?.email ?? user.email ?? ""}
        view="health"
        // Read here rather than in the component: this is a server-only
        // secret, and only its presence crosses to the browser.
        webhookSecretConfigured={!!process.env.RAZORPAY_WEBHOOK_SECRET}
      />
      <AccountingHealthPanel health={accountingHealth} />
    </div>
  );

  const settingsSecurityTab = (
    <AdminFeatureControlTab
      settings={adminSettings}
      syncIssues={googleMeetSyncIssues}
      waitingRoomIssues={meetWaitingRoomIssues}
      adminEmail={adminProfile?.email ?? user.email ?? ""}
      view="security"
    />
  );

  const adminRows: AdminRow[] = (allProfiles ?? [])
    .filter((p) => p.role === "admin")
    .map((p) => ({
      id: p.id,
      fullName: p.full_name,
      email: p.email,
      scope: parseAdminScope(adminScopeById.get(p.id)),
      isSelf: p.id === user.id,
    }));

  // Who can see what, in one place: which admins hold which scope, and how
  // much of a patient's contact details a therapist is handed by default.
  const settingsTeamTab = (
    <div className="space-y-8">
      <AdminTeamAccessTab admins={adminRows} viewerScope={viewerScope} />
      <ContactControlsForm settings={adminSettings} />
    </div>
  );

  const activityRows: ActivityRow[] = (activityLogRows ?? []).map((r) => ({
    id: r.id,
    actorName: profileMap.get(r.actor_id)?.full_name ?? "Unknown admin",
    action: r.action,
    targetLabel: r.target_label,
    amountPaise: r.amount_paise,
    details: (r.details ?? null) as Record<string, unknown> | null,
    createdAt: r.created_at,
  }));

  // Read on its own rather than inside the ~40-query batch above, per the
  // migration-dependent rule: a database that has not applied the risk
  // tables yet renders an empty queue instead of blanking every screen on
  // this page.
  // The whole queue, not merely the ability to close a row, is full-access
  // only: a signal names a colleague and quotes what they wrote. A scoped
  // admin's render does not even fetch it.
  type RiskSignalQueryRow = {
    id: string;
    rule_key: string;
    subject_kind: string;
    subject_id: string;
    severity: string;
    summary: string;
    evidence: unknown;
    status: string;
    detected_at: string;
  };
  type AdminCarePlanQueryRow = {
    id: string;
    patient_id: string;
    therapist_id: string;
    status: string;
    category_id: string | null;
    current_version_id: string | null;
    created_at: string;
  };
  type CommunicationFlagQueryRow = {
    id: string;
    surface: string;
    author_id: string | null;
    patient_id: string | null;
    tier: string;
    findings: unknown;
    blocked: boolean;
    content: string | null;
    created_at: string;
  };
  type ContactRevealQueryRow = {
    id: string;
    therapist_id: string;
    patient_id: string;
    field: string;
    reason: string | null;
    created_at: string;
  };
  type RiskRuleQueryRow = {
    rule_key: string;
    label: string;
    description: string;
    enabled: boolean;
    config: unknown;
  };
  const viewerCanSeeRisk = viewerScope === "full";
  const { data: riskSignalRows } = viewerCanSeeRisk
    ? await admin
    .from("risk_signals")
    .select("id, rule_key, subject_kind, subject_id, severity, summary, evidence, status, detected_at")
    .order("detected_at", { ascending: false })
    .limit(200)
    : { data: [] as RiskSignalQueryRow[] };
  const { data: riskRuleRows } = viewerCanSeeRisk
    ? await admin
        .from("risk_rules")
        .select("rule_key, label, description, enabled, config")
        .order("rule_key")
    : { data: [] as RiskRuleQueryRow[] };

  const riskSignalIds = (riskSignalRows ?? []).map((r) => r.id);
  const { data: riskReviewRows } = riskSignalIds.length
    ? await admin
        .from("risk_reviews")
        .select("id, signal_id, reviewer_id, outcome, note, created_at")
        .in("signal_id", riskSignalIds)
        .order("created_at", { ascending: true })
    : { data: [] as { id: string; signal_id: string; reviewer_id: string; outcome: string; note: string; created_at: string }[] };

  // A signal names a subject by id and kind. Resolving that to something an
  // admin recognises needs the admin client, since a therapist's or a
  // patient's name is not readable through the caller's own RLS -- the same
  // one lookup every other cross-role surface makes.
  const riskRuleLabels = new Map((riskRuleRows ?? []).map((r) => [r.rule_key, r.label]));
  const riskPersonIds = [
    ...new Set(
      (riskSignalRows ?? [])
        .filter((r) => r.subject_kind !== "appointment")
        .map((r) => r.subject_id)
    ),
  ];
  const riskAppointmentIds = [
    ...new Set(
      (riskSignalRows ?? [])
        .filter((r) => r.subject_kind === "appointment")
        .map((r) => r.subject_id)
    ),
  ];
  const [{ data: riskPeople }, { data: riskAppointments }] = await Promise.all([
    riskPersonIds.length
      ? admin.from("profiles").select("id, full_name").in("id", riskPersonIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
    riskAppointmentIds.length
      ? admin.from("appointments").select("id, session_code").in("id", riskAppointmentIds)
      : Promise.resolve({ data: [] as { id: string; session_code: string | null }[] }),
  ]);
  const riskSubjectNames = new Map<string, string>();
  for (const p of riskPeople ?? []) riskSubjectNames.set(p.id, p.full_name ?? "Unknown");
  for (const a of riskAppointments ?? [])
    riskSubjectNames.set(a.id, a.session_code ?? `Session ${a.id.slice(0, 8)}`);

  // The evidence itself, read only for a full admin, on its own so a
  // database without the tables renders an empty panel rather than blanking
  // the dashboard.
  const { data: flagRows } = viewerCanSeeRisk
    ? await admin
        .from("communication_flags")
        .select("id, surface, author_id, patient_id, tier, findings, blocked, content, created_at")
        .order("created_at", { ascending: false })
        .limit(200)
    : { data: [] as CommunicationFlagQueryRow[] };
  const { data: revealRows } = viewerCanSeeRisk
    ? await admin
        .from("contact_reveal_log")
        .select("id, therapist_id, patient_id, field, reason, created_at")
        .order("created_at", { ascending: false })
        .limit(200)
    : { data: [] as ContactRevealQueryRow[] };

  // One name lookup for both, since RLS gives an admin no route to another
  // person's name -- the same admin-client lookup every cross-role surface
  // makes.
  const evidencePersonIds = [
    ...new Set(
      [
        ...(flagRows ?? []).flatMap((f) => [f.author_id, f.patient_id]),
        ...(revealRows ?? []).flatMap((r) => [r.therapist_id, r.patient_id]),
      ].filter((id): id is string => !!id)
    ),
  ];
  const { data: evidencePeople } = evidencePersonIds.length
    ? await admin.from("profiles").select("id, full_name").in("id", evidencePersonIds)
    : { data: [] as { id: string; full_name: string }[] };
  const evidenceNames = new Map(
    (evidencePeople ?? []).map((p) => [p.id, p.full_name ?? "Unknown"])
  );

  const riskFlags: CommunicationFlagRow[] = (flagRows ?? []).map((f) => ({
    id: f.id,
    surface: f.surface,
    authorName: f.author_id ? evidenceNames.get(f.author_id) ?? "Unknown" : "Unknown",
    patientName: f.patient_id ? evidenceNames.get(f.patient_id) ?? null : null,
    tier: f.tier,
    blocked: f.blocked,
    summary: summariseFindings(
      Array.isArray(f.findings) ? (f.findings as LeakFinding[]) : []
    ),
    content: f.content,
    createdAt: f.created_at,
  }));
  const riskReveals: ContactRevealRow[] = (revealRows ?? []).map((r) => ({
    id: r.id,
    therapistName: evidenceNames.get(r.therapist_id) ?? "Unknown",
    patientName: evidenceNames.get(r.patient_id) ?? "Unknown",
    field: r.field,
    reason: r.reason,
    createdAt: r.created_at,
  }));

  const riskSignals: RiskSignalRow[] = (riskSignalRows ?? []).map((r) => ({
    id: r.id,
    ruleKey: r.rule_key,
    subjectKind: r.subject_kind as RiskSubjectKind,
    subjectId: r.subject_id,
    severity: r.severity as RiskSeverity,
    summary: r.summary,
    evidence: (r.evidence ?? {}) as Record<string, unknown>,
    status: r.status as RiskStatus,
    detectedAt: r.detected_at,
    ruleLabel: riskRuleLabels.get(r.rule_key) ?? r.rule_key,
    subjectName: riskSubjectNames.get(r.subject_id) ?? "Unknown",
  }));
  const riskReviews: RiskReviewRow[] = (riskReviewRows ?? []).map((r) => ({
    id: r.id,
    signalId: r.signal_id,
    reviewerName: profileMap.get(r.reviewer_id)?.full_name ?? "An admin",
    outcome: r.outcome,
    note: r.note,
    createdAt: r.created_at,
  }));

  // The whole queue is `full` scope only, not merely the deciding. A signal
  // names a colleague and quotes what they wrote; an operations admin who
  // needs the bookings screen has no business reading that. The routes
  // enforce it and the screen matches, rather than handing a scoped admin a
  // 403 with nothing to explain it.
  const canSeeRisk = viewerCanSeeRisk;
  const openRiskCount = canSeeRisk
    ? riskSignals.filter((r) => r.status === "open").length
    : 0;

  const todayRiskTab = !canSeeRisk ? (
    <SurfaceCard title="Risk signals" icon="fa-triangle-exclamation">
      <EmptyState
        icon="fa-lock"
        title="Full access only"
        body="These findings name individual therapists and quote what they wrote, so they are limited to full-access admins."
      />
    </SurfaceCard>
  ) : (
    <RiskSignalsTab
      signals={riskSignals}
      reviews={riskReviews}
      rules={(riskRuleRows ?? []).map((r) => ({
        ruleKey: r.rule_key,
        label: r.label,
        description: r.description,
        enabled: r.enabled,
        config: (r.config ?? {}) as Record<string, unknown>,
      }))}
      flags={riskFlags}
      reveals={riskReveals}
      detectorsEnabled={adminSettings.riskSignalsEnabled}
      canReview
    />
  );

  // Every recommendation, on its own call for the usual
  // migration-tolerance reason. Sessions scope, matching the withdraw route
  // and the section it sits in.
  const canSeeCarePlans = scopeCanOpen(viewerScope, "sessions");
  const { data: adminCarePlanRows } = canSeeCarePlans
    ? await admin
        .from("care_plans")
        .select(
          "id, patient_id, therapist_id, status, category_id, current_version_id, created_at"
        )
        .order("created_at", { ascending: false })
        .limit(200)
    : { data: [] as AdminCarePlanQueryRow[] };

  const adminPlanVersionIds = (adminCarePlanRows ?? [])
    .map((p) => p.current_version_id)
    .filter((id): id is string => !!id);
  const { data: adminPlanVersions } = adminPlanVersionIds.length
    ? await admin
        .from("care_plan_versions")
        .select(
          "id, offer_snapshot, offer_kind, session_package_id, home_visit_package_id, clinical_rationale, instructions, hands_on_required, frequency_per_week, expires_at, authored_at"
        )
        .in("id", adminPlanVersionIds)
    : {
        data: [] as {
          id: string;
          offer_snapshot: unknown;
          offer_kind: string;
          session_package_id: string | null;
          home_visit_package_id: string | null;
          clinical_rationale: string | null;
          instructions: string | null;
          hands_on_required: boolean;
          frequency_per_week: number | null;
          expires_at: string | null;
          authored_at: string;
        }[],
      };
  const adminPlanVersionById = new Map((adminPlanVersions ?? []).map((v) => [v.id, v]));

  const carePlanPersonIds = [
    ...new Set(
      (adminCarePlanRows ?? []).flatMap((p) => [p.patient_id, p.therapist_id])
    ),
  ];
  const { data: carePlanPeople } = carePlanPersonIds.length
    ? await admin.from("profiles").select("id, full_name").in("id", carePlanPersonIds)
    : { data: [] as { id: string; full_name: string }[] };
  const carePlanNames = new Map(
    (carePlanPeople ?? []).map((p) => [p.id, p.full_name ?? "Unknown"])
  );

  // When each one was sent, read on its own. `submitted_at` arrived with the
  // review step, later than the rows it sits on, so an unknown-column error
  // must cost the queue its ordering rather than cost the screen every
  // recommendation on it.
  const submittedAtByPlan = new Map<string, string>();
  if ((adminCarePlanRows ?? []).length > 0) {
    try {
      const { data: submittedRows } = await admin
        .from("care_plans")
        .select("id, submitted_at")
        .in(
          "id",
          (adminCarePlanRows ?? []).map((p) => p.id)
        );
      for (const row of submittedRows ?? []) {
        const at = (row as { submitted_at?: string | null }).submitted_at;
        if (at) submittedAtByPlan.set(row.id, at);
      }
    } catch {
      // Falls back to created_at below, which sorts a queue sensibly.
    }
  }

  // What the patient already owns, for the patients in the queue only.
  //
  // The single commonest reason to turn a recommendation down is that this
  // patient still has sessions they have not used, and an admin could not
  // see that from the card -- they would have had to leave the queue, find
  // the patient, come back, and by then have lost their place. Its own
  // query, scoped to the queued patients, so a screen with an empty queue
  // pays nothing for it.
  const queuedPatientIds = [
    ...new Set(
      (adminCarePlanRows ?? [])
        .filter((p) => p.status === "pending_review")
        .map((p) => p.patient_id)
    ),
  ];
  const unusedSessionsByPatient = new Map<string, number>();
  if (queuedPatientIds.length > 0) {
    try {
      const [{ data: openPurchases }, { data: openVisits }] = await Promise.all([
        admin
          .from("patient_package_purchases")
          .select("id, patient_id, session_count, sessions_used, status, payment_status")
          .in("patient_id", queuedPatientIds)
          .eq("payment_status", "paid")
          .eq("status", "active"),
        admin
          .from("home_visit_package_purchases")
          .select("id, patient_id, visit_count, visits_used, status, payment_status")
          .in("patient_id", queuedPatientIds)
          .eq("status", "active"),
      ]);

      // Through the same helper every other balance surface uses. Reading
      // `sessions_used` raw would make this figure disagree with the
      // Purchases screen the moment an admin flips the ledger switch --
      // which is the "the list disagrees with the number" bug in the one
      // place it would be read as a reason to refuse someone treatment.
      const sessionRows = await applyLedgerSessionBalances(
        admin,
        openPurchases ?? [],
        { authoritative: ledgerAuthoritative }
      );
      const visitRows = await applyLedgerVisitBalances(admin, openVisits ?? [], {
        authoritative: ledgerAuthoritative,
      });

      const add = (patientId: string, left: number) => {
        if (left <= 0) return;
        unusedSessionsByPatient.set(
          patientId,
          (unusedSessionsByPatient.get(patientId) ?? 0) + left
        );
      };
      for (const p of sessionRows) {
        add(p.patient_id, (p.session_count ?? 0) - (p.sessions_used ?? 0));
      }
      // Home visits count too: a recommendation can be for either, and a
      // patient with visits left is in exactly the position this line
      // exists to surface.
      for (const p of visitRows) {
        add(p.patient_id, (p.visit_count ?? 0) - (p.visits_used ?? 0));
      }
    } catch {
      // Losing this costs the card a warning line, never the queue.
    }
  }

  const adminCarePlans: AdminCarePlanRow[] = (adminCarePlanRows ?? []).map((p) => {
    const version = p.current_version_id
      ? adminPlanVersionById.get(p.current_version_id)
      : undefined;
    const snapshot = parseOfferSnapshot(version?.offer_snapshot);
    return {
      id: p.id,
      patientName: carePlanNames.get(p.patient_id) ?? "Unknown",
      therapistName: carePlanNames.get(p.therapist_id) ?? "Unknown",
      title: snapshot?.title ?? "Treatment programme",
      sessionCount: snapshot?.sessionCount ?? 0,
      pricePaise: snapshot?.pricePaise ?? 0,
      isHomeVisit: version?.offer_kind === "home_visit_package",
      state: carePlanState(
        { status: p.status as CarePlanStatus },
        { expires_at: version?.expires_at ?? null },
        nowTimestamp()
      ),
      status: p.status,
      authoredAt: version?.authored_at ?? p.created_at,
      expiresAt: version?.expires_at ?? null,
      rationale: version?.clinical_rationale ?? null,
      // Only the queue uses these. They are what an edit-and-approve starts
      // from: an admin changing a recommendation begins from what the
      // therapist wrote, not from an empty form.
      instructions: version?.instructions ?? null,
      handsOnRequired: version?.hands_on_required === true,
      frequencyPerWeek: version?.frequency_per_week ?? null,
      offerKind:
        version?.offer_kind === "home_visit_package"
          ? "home_visit_package"
          : "session_package",
      packageId:
        version?.session_package_id ?? version?.home_visit_package_id ?? null,
      categoryId: p.category_id ?? null,
      // What the queue is ordered and aged by. Falls back to the row's own
      // creation time for a plan written before the column existed, so an
      // old row sorts sensibly rather than to one end.
      submittedAt: submittedAtByPlan.get(p.id) ?? p.created_at,
      unusedSessions: unusedSessionsByPatient.get(p.patient_id) ?? 0,
    };
  });

  // Completed sessions an admin could write a recommendation against:
  // recent, and only where that patient has no live plan already, since a
  // second one would lose the one-active-plan race anyway and offering it
  // would be an invitation to a 409.
  // Either open state counts. A patient with a recommendation still in the
  // clinic's own queue cannot take a second one either -- the unique index
  // covers both, so offering it would be an invitation to a 409.
  const patientsWithLivePlan = new Set(
    (adminCarePlanRows ?? [])
      .filter((p) => p.status === "active" || p.status === "pending_review")
      .map((p) => p.patient_id)
  );
  const { data: authorableRows } = canSeeCarePlans
    ? await admin
        .from("appointments")
        .select("id, patient_id, therapist_id, session_code, slot_time, category_id")
        .eq("status", "completed")
        .not("therapist_id", "is", null)
        .gte("slot_time", new Date(nowTimestamp() - 60 * 86_400_000).toISOString())
        .order("slot_time", { ascending: false })
        .limit(60)
    : {
        data: [] as {
          id: string;
          patient_id: string;
          therapist_id: string | null;
          session_code: string | null;
          slot_time: string;
          category_id: string | null;
        }[],
      };

  const authorableIds = [
    ...new Set(
      (authorableRows ?? []).flatMap((a) => [a.patient_id, a.therapist_id]).filter(
        (id): id is string => !!id
      )
    ),
  ];
  const { data: authorablePeople } = authorableIds.length
    ? await admin.from("profiles").select("id, full_name").in("id", authorableIds)
    : { data: [] as { id: string; full_name: string }[] };
  const authorableNames = new Map(
    (authorablePeople ?? []).map((p) => [p.id, p.full_name ?? "Unknown"])
  );

  const authorableSessions: AuthorableSession[] = (authorableRows ?? [])
    .filter((a) => a.therapist_id && !patientsWithLivePlan.has(a.patient_id))
    .map((a) => ({
      appointmentId: a.id,
      patientId: a.patient_id,
      patientName: authorableNames.get(a.patient_id) ?? "Unknown",
      therapistName: authorableNames.get(a.therapist_id!) ?? "Unknown",
      sessionCode: a.session_code,
      slotTime: a.slot_time,
      categoryId: a.category_id ?? null,
    }));

  // Every recommendable package, not the ones for one category: the screen
  // narrows them per selected session in the browser, because which session
  // the admin picks decides which category applies and that choice is made
  // after this render.
  const adminPackageOptions: RecommendableOption[] = canSeeCarePlans
    ? (await loadRecommendablePackages(admin)).map((p) => ({
        id: p.id,
        kind: p.kind,
        title: p.title,
        snapshot: p.snapshot,
        categoryId: p.categoryId,
        categoryTitle: p.categoryTitle,
        specialty: p.specialty,
      }))
    : [];

  const sessionsRecommendationsTab = (
    <AdminCarePlansTab
      nowMs={nowTimestamp()}
      plans={adminCarePlans}
      authorable={authorableSessions}
      packageOptions={adminPackageOptions}
      canWithdraw={canSeeCarePlans}
    />
  );

  const settingsActivityTab = (
    <AdminActivityLogTab
      rows={activityRows}
      actors={adminRows.map((a) => ({ id: a.id, name: a.fullName ?? "Unnamed admin" }))}
    />
  );

  // This page hides the shared Navbar entirely, so it needs the debug
  // bar's own top offset for its fixed sidebar. See AdminShell's offsetTop prop.
  const showDebugNav = isDebugNavVisible();

  // Derived from the rows the Recommendations screen already loaded, rather
  // than a count query of its own: the figure and the list it links to have
  // to agree, and a second query is a second chance for them not to.
  const carePlansPendingCount = adminCarePlans.filter(
    (p) => p.state === "pending_review"
  ).length;
  // Urgent means late, not merely present. Marking the row urgent whenever
  // anything is queued makes it permanently red on a clinic that is keeping
  // up, and a badge that is always on is a badge nobody reads -- which is
  // how the one queue with a patient waiting behind it stops being looked
  // at. Same threshold the cards themselves colour on.
  const carePlansStaleCount = adminCarePlans.filter(
    (p) => p.state === "pending_review" && isQueueStale(p.submittedAt, nowTimestamp())
  ).length;

  // ---- Today's action inbox -------------------------------------------
  // Every count here already existed somewhere on this page; what didn't
  // exist was one place to read them all. Nothing new is computed.
  const todayKeyIST = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const sessionsToday = appointmentsWithSessionCode.filter(
    (a) =>
      a.slot_time &&
      a.status !== "cancelled" &&
      new Date(a.slot_time).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }) ===
        todayKeyIST
  );
  const unassignedToday = sessionsToday.filter((a) => !a.therapist_id).length;
  const unassignedTotal = appointmentsWithSessionCode.filter(
    (a) => !a.therapist_id && a.status !== "cancelled"
  ).length;
  const cashOwedByTherapists = homeVisitRows.filter(
    (v) => v.cash_collected_at && !v.cash_remitted_at
  ).length;
  const manualRefundsPending = homeVisitRows.filter(
    (v) => v.refund_status === "manual_pending"
  ).length;

  const inboxGroups: InboxGroup[] = [
    {
      title: "Approvals",
      icon: "fa-user-check",
      items: [
        {
          label: "Accounts waiting to be approved",
          count: pendingAccounts?.length ?? 0,
          section: "today",
          tab: "approvals",
          hint: "Patients and therapists who signed up themselves.",
        },
        {
          label: "Profile change requests",
          count: pendingProfileChanges?.length ?? 0,
          section: "today",
          tab: "approvals",
          hint: "Someone wants a detail on their profile changed.",
        },
      ],
    },
    {
      title: "Risk",
      icon: "fa-triangle-exclamation",
      items: [
        {
          label: "Signals nobody has looked at",
          count: openRiskCount,
          section: "today",
          tab: "risk",
          hint: "Patterns worth a person's attention. Nothing acts on them by itself.",
          urgent:
            canSeeRisk &&
            riskSignals.some((r) => r.status === "open" && r.severity === "high"),
        },
      ],
    },
    {
      title: "Scheduling",
      icon: "fa-calendar-day",
      items: [
        {
          label: "Sessions with no therapist",
          count: unassignedTotal,
          section: "sessions",
          tab: "all",
          // Opens All Sessions already filtered to exactly these rows --
          // the count and the list it links to have to agree.
          view: "unassigned",
          hint: "Nobody is assigned to run these yet.",
          urgent: unassignedToday > 0,
        },
        {
          label: "Referrals waiting on triage",
          count: referrals?.filter((r) => r.status === "pending_review").length ?? 0,
          section: "people",
          tab: "partners",
          hint: "A hospital sent a patient and is waiting on an answer.",
        },
      ],
    },
    {
      title: "Clinical",
      icon: "fa-notes-medical",
      items: [
        {
          // First in the clinical group and marked urgent, because it is the
          // only queue in the app with a patient on the other side of it who
          // has been told nothing at all. Everything else here is waiting on
          // a decision; this is waiting on a decision after a session that
          // has already ended.
          label: "Recommendations waiting for approval",
          count: carePlansPendingCount,
          section: "sessions",
          tab: "recommendations",
          hint:
            carePlansStaleCount > 0
              ? `A therapist recommended a programme. ${carePlansStaleCount} ${
                  carePlansStaleCount === 1 ? "has" : "have"
                } been waiting over ${CARE_PLAN_QUEUE_STALE_HOURS} hours, and the patient cannot see it yet.`
              : "A therapist recommended a programme. The patient cannot see it yet.",
          urgent: carePlansStaleCount > 0,
        },
        {
          label: "Care intake submissions to review",
          count: conditionRequestsPendingCount ?? 0,
          section: "people",
          tab: "patients",
          hint: "Patient history waiting to go live.",
        },
        {
          label: "Therapist access requests",
          count: conditionAccessPendingCount ?? 0,
          section: "people",
          tab: "patients",
          hint: "A therapist wants write access to a patient's records.",
        },
      ],
    },
    {
      title: "Money",
      icon: "fa-sack-dollar",
      items: [
        {
          label: "Payout requests open",
          count: payoutRequestsBadgeCount,
          section: "money",
          tab: "payouts",
          hint: "A therapist has asked to be paid.",
        },
        {
          label: "Cash refunds to hand back",
          count: manualRefundsPending,
          section: "money",
          tab: "payouts",
          hint: "Cash was collected and the visit was cancelled — no Razorpay refund exists.",
          urgent: true,
        },
        {
          label: "Cash collected, not remitted",
          count: cashOwedByTherapists,
          section: "money",
          tab: "payouts",
          hint: "Money the business is owed, currently with a therapist.",
        },
      ],
    },
    {
      title: "Growth",
      icon: "fa-seedling",
      items: [
        {
          label: "New B2B leads",
          count: b2bLeads?.filter((l) => l.status === "new").length ?? 0,
          section: "people",
          tab: "partners",
          hint: "An organisation asked about partnering.",
        },
        {
          label: "Out-of-area visit requests",
          count: homeVisitWaitlist?.filter((w) => w.status === "new").length ?? 0,
          section: "catalog",
          tab: "areas",
          hint: "Demand for a pincode home visits aren't sold in yet.",
        },
      ],
    },
    {
      title: "Health",
      icon: "fa-heart-pulse",
      items: [
        {
          label: "Calendar / Meet sync failures",
          count: googleMeetSyncIssues.length,
          section: "settings",
          tab: "health",
          hint: "Confirmed sessions with no Meet link — the patient has no way in.",
          urgent: true,
        },
        {
          label: "Accounting checks needing a look",
          count: accountingProblemCount(accountingHealth),
          section: "settings",
          tab: "health",
          hint: "Balances that disagree, money nothing is attached to, or a delivered session with nothing behind it.",
          // Money is either unaccounted for or a session was delivered
          // without it, so this reads red for the same reason the cash
          // refund queue does.
          urgent: true,
        },
      ],
    },
  ];

  const allowedSections = sectionsForScope(viewerScope);

  const inboxTotal = inboxGroups.reduce(
    (sum, g) => sum + g.items.reduce((s, i) => s + i.count, 0),
    0
  );

  const adminFeed = buildAdminFeed({
    activity: activityRows.slice(0, 10).map((r) => ({
      id: r.id,
      action: r.action,
      created_at: r.createdAt,
      actor_name: r.actorName,
      summary: r.targetLabel,
    })),
    pendingApprovals: pendingAccounts?.length ?? 0,
    pendingRequests: pendingProfileChanges?.length ?? 0,
    failedSyncs: googleMeetSyncIssues.length,
  });

  // A figure on this strip is a question ("how many sessions have nobody on
  // them?"), so tapping it opens the answer rather than the whole table --
  // ?view= is the preset the target screen applies (see adminScreenHref).
  // Scope-gated: an admin whose scope cannot open Sessions gets the figure
  // without a link, rather than a link into a 403.
  const canOpenSessions = allowedSections.includes("sessions");
  const canOpenMoney = allowedSections.includes("money");

  const adminOverviewCells: StatCell[] = [
    {
      label: "Sessions today",
      value: String(sessionsToday.length),
      note:
        unassignedToday > 0
          ? `${unassignedToday} with no therapist yet`
          : "All of today's work is assigned",
      accent: unassignedToday > 0 ? "bg-amber-500" : "bg-teal-500",
      href: canOpenSessions ? adminScreenHref("sessions", "all", "today") : undefined,
    },
    {
      label: "Needs a person",
      value: String(inboxTotal),
      note: inboxTotal === 0 ? "The queues are clear" : "Across approvals, scheduling and money",
      accent: inboxTotal > 0 ? "bg-red-500" : "bg-emerald-500",
    },
    {
      label: "Unassigned sessions",
      value: String(unassignedTotal),
      note: "Booked but nobody is running them",
      accent: unassignedTotal > 0 ? "bg-amber-500" : "bg-emerald-500",
      href: canOpenSessions ? adminScreenHref("sessions", "all", "unassigned") : undefined,
    },
    {
      label: "Cash to remit",
      value: String(cashOwedByTherapists),
      unit: cashOwedByTherapists === 1 ? "visit" : "visits",
      note:
        manualRefundsPending > 0
          ? `${manualRefundsPending} manual refund${manualRefundsPending === 1 ? "" : "s"} pending too`
          : "Cash collected on home visits, not yet handed in",
      accent: cashOwedByTherapists > 0 ? "bg-amber-500" : "bg-emerald-500",
      href: canOpenMoney ? adminScreenHref("money", "payouts", "owed") : undefined,
    },
  ];

  const adminOverviewTab = (
    <DashboardOverview
      greeting="The clinic today"
      headline={
        inboxTotal > 0
          ? `${inboxTotal} thing${inboxTotal === 1 ? "" : "s"} waiting on an admin, and ${sessionsToday.length} session${
              sessionsToday.length === 1 ? "" : "s"
            } scheduled today.`
          : `Nothing is waiting on you. ${sessionsToday.length} session${
              sessionsToday.length === 1 ? "" : "s"
            } scheduled today.`
      }
      cells={adminOverviewCells}
      feed={adminFeed}
      feedTitle="Activity"
      feedEmptyBody="Admin actions and anything waiting on a person appear here."
      aside={<AdminInboxQueues groups={inboxGroups} allowedSections={allowedSections} />}
      actions={[
        { label: "Approvals", hint: "Signups and profile change requests", icon: "fa-user-check", href: "/admin/dashboard?section=today&tab=approvals", primary: true },
        { label: "All sessions", hint: "Assign, reschedule, refund", icon: "fa-calendar-check", href: "/admin/dashboard?section=sessions&tab=all" },
        { label: "Money summary", hint: "Revenue, payouts and cash", icon: "fa-indian-rupee-sign", href: "/admin/dashboard?section=money&tab=summary" },
      ]}
    />
  );

  // ---- Global search ---------------------------------------------------
  // Built from data this page already loaded, so the box costs one pass over
  // arrays that are already in memory rather than a new query.
  const searchEntities: SearchEntity[] = [
    ...patients.map((p) => ({
      id: p.id,
      label: p.full_name ?? "Unnamed patient",
      terms: [p.email ?? "", p.phone ?? "", roleCodeMap.get(p.id)?.patient_code ?? ""],
      kind: "Patient" as const,
      href: `/admin/dashboard/patients/${p.id}`,
      hint: p.email,
    })),
    ...allTherapists.map((t) => ({
      id: t.id,
      label: t.full_name ?? "Unnamed therapist",
      terms: [t.email ?? "", t.phone ?? "", roleCodeMap.get(t.id)?.therapist_code ?? ""],
      kind: "Therapist" as const,
      href: `/admin/dashboard/therapists/${t.id}`,
      hint: t.credentials ?? t.email,
    })),
    ...hospitals.map((h) => ({
      id: h.id,
      label: h.organization_name ?? h.full_name ?? "Partner",
      terms: [h.email ?? "", h.referral_code ?? "", roleCodeMap.get(h.id)?.hospital_code ?? ""],
      kind: "Partner" as const,
      href: adminScreenHref("people", "partners"),
      hint: h.full_name,
    })),
    ...appointmentsWithSessionCode
      .filter((a) => a.session_code)
      .map((a) => ({
        id: a.id,
        label: a.session_code as string,
        terms: [
          profileMap.get(a.patient_id)?.full_name ?? "",
          a.therapist_id ? profileMap.get(a.therapist_id)?.full_name ?? "" : "",
          a.concern ?? "",
        ],
        kind: "Session" as const,
        href: adminScreenHref("sessions", "all"),
        hint: `${profileMap.get(a.patient_id)?.full_name ?? "Unknown"} · ${a.status}`,
      })),
    ...packagePurchaseRows
      .filter((p) => p.purchaseCode)
      .map((p) => ({
        id: p.id,
        label: p.purchaseCode as string,
        terms: [p.patientName, p.packageTitle, p.patientCode ?? ""],
        kind: "Purchase" as const,
        href: adminScreenHref("catalog", "purchases"),
        hint: `${p.patientName} · ${p.packageTitle}`,
      })),
    ...homeVisitPurchaseRows
      .filter((p) => p.purchaseCode)
      .map((p) => ({
        id: p.id,
        label: p.purchaseCode as string,
        terms: [p.patientName, p.packageTitle, p.patientCode ?? ""],
        kind: "Purchase" as const,
        href: adminScreenHref("catalog", "purchases"),
        hint: `${p.patientName} · ${p.packageTitle}`,
      })),
  ];

  // Every screen, keyed "<section>:<tab>" exactly as ADMIN_SECTIONS defines
  // them. The shell only decides which key is visible.
  const screens: AdminScreens = {
    "today:overview": adminOverviewTab,
    "today:approvals": approvalsTab,
    "today:risk": todayRiskTab,
    "sessions:schedule": calendarTab,
    "sessions:all": allSessionsTab,
    "sessions:roster": rosterTab,
    "sessions:new": newBookingTab,
    "people:patients": (
      <div className="space-y-8">
        {patientsTab}
        {conditionsTab}
      </div>
    ),
    "people:therapists": therapistsTab,
    "people:partners": b2bPartners,
    // Every Money screen ends with the same glossary. It used to sit on
    // Summary alone, which is the one screen whose labels are self-evident
    // -- an admin reading "Net payable" on Payouts or "Session revenue" on
    // Performance is the one who needs it.
    "money:summary": (
      <>
        {moneySummaryTab}
        <div className="mt-8">
          <MoneyGlossary />
        </div>
      </>
    ),
    "money:transactions": (
      <>
        {paymentHistoryTab}
        <div className="mt-8">
          <MoneyGlossary />
        </div>
      </>
    ),
    "money:payouts": (
      <div className="space-y-8">
        {payoutsTab}
        {payoutRequestsTab}
        <HomeVisitCashLedger visits={homeVisitRows} nowMs={nowTimestamp()} />
        <MoneyGlossary />
      </div>
    ),
    "money:costs": (
      <>
        <AdminCostsTab
          expenses={businessExpenseRows ?? []}
          gatewayFeePercent={adminSettings.paymentGatewayFeePercent}
          todayIso={istDateKey(new Date(nowTimestamp()).toISOString())}
        />
        <div className="mt-8">
          <MoneyGlossary />
        </div>
      </>
    ),
    "money:breakdown": (
      <>
        {moneyBreakdownTab}
        <div className="mt-8">
          <MoneyGlossary />
        </div>
      </>
    ),
    "sessions:recommendations": sessionsRecommendationsTab,
    "sessions:delivery": deliveryTab,
    "catalog:conditions": (
      <>
        {catalogStrip}
        {catalogConditionsTab}
      </>
    ),
    "catalog:packages": (
      <>
        {catalogStrip}
        {catalogPackagesTab}
      </>
    ),
    "catalog:areas": (
      <>
        {catalogStrip}
        {catalogAreasTab}
      </>
    ),
    "catalog:purchases": (
      <>
        {catalogStrip}
        {catalogPurchasesTab}
      </>
    ),
    "settings:brand": settingsBrandTab,
    "settings:public": settingsPublicSiteTab,
    "settings:booking": settingsBookingTab,
    "settings:clinical": settingsClinicalTab,
    "settings:team": settingsTeamTab,
    "settings:health": settingsHealthTab,
    "settings:activity": settingsActivityTab,
    "settings:security": settingsSecurityTab,
  };

  // Badges, keyed the same way. A section's own badge is the sum of its
  // tabs', computed inside the shell so the two can never disagree.
  const badges: Record<string, number> = {
    "today:overview": inboxTotal,
    "sessions:all": unassignedTotal,
    "today:approvals": (pendingAccounts?.length ?? 0) + (pendingProfileChanges?.length ?? 0),
    "today:risk": openRiskCount,
    "people:patients": conditionsBadgeCount,
    "people:partners": b2bBadgeCount,
    "money:payouts": payoutRequestsBadgeCount + manualRefundsPending,
    "catalog:areas": homeVisitWaitlist?.filter((w) => w.status === "new").length ?? 0,
    "settings:health": googleMeetSyncIssues.length + accountingProblemCount(accountingHealth),
  };

  return (
    <JoinWindowProvider
      beforeMinutes={adminSettings.joinWindowMinutes}
      afterMinutes={adminSettings.joinWindowAfterMinutes}
      completedAfterMinutes={adminSettings.sessionCompletedAfterMinutes}
    >
      <AdminShell
        initialSection={sectionParam ?? null}
        initialTab={tabParam ?? null}
        screens={screens}
        badges={badges}
        searchEntities={searchEntities}
        allowedSections={allowedSections}
        adminName={adminProfile?.full_name ?? "Admin"}
        adminEmail={adminProfile?.email ?? user.email ?? ""}
        adminAvatarUrl={adminProfile?.avatar_url ?? null}
        offsetTop={showDebugNav}
      />
    </JoinWindowProvider>
  );
}
