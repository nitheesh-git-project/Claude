import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import CompleteSessionButton from "@/components/CompleteSessionButton";
import MarkNoShowButton from "@/components/MarkNoShowButton";
import SessionFeedbackForm from "@/components/SessionFeedbackForm";
import TherapistAvailabilityRoster from "@/components/TherapistAvailabilityRoster";
import TherapistOnLeaveToggle from "@/components/TherapistOnLeaveToggle";
import TherapistUpcomingOverrides from "@/components/TherapistUpcomingOverrides";
import TherapistPayoutReceiptsSection from "@/components/TherapistPayoutReceiptsSection";
import TherapistEarningsTab from "@/components/TherapistEarningsTab";
import DashboardShell from "@/components/dashboard/DashboardShell";
import SessionCalendarTab from "@/components/dashboard/SessionCalendarTab";
import { THERAPIST_NAV_ITEMS } from "@/lib/dashboardNavItems";
import { formatSlotTime } from "@/lib/formatSlotTime";
import { computeRatingAggregate } from "@/lib/ratingAggregate";
import { buildTherapistPayoutReceipts } from "@/lib/receipts";
import { mergeSessionCodes } from "@/lib/sessionCode";
import { mergeMeetLinks } from "@/lib/meetLink";
import JoinSessionButton from "@/components/JoinSessionButton";
import { computeTherapistEarningRows, computeTherapistPendingOwed } from "@/lib/therapistEarnings";
import { SESSION_FEE_PAISE } from "@/lib/pricing";
import { parseAdminSettings, SITE_SETTINGS_SELECT } from "@/lib/adminSettings";
import { JoinWindowProvider } from "@/lib/joinWindowContext";

const STATUS_BADGE_STYLES: Record<string, string> = {
  requested: "text-amber-700 bg-amber-50",
  confirmed: "text-purple-700 bg-purple-50",
  completed: "text-teal-700 bg-teal-50",
  cancelled: "text-red-700 bg-red-50",
};

// See patient/dashboard/page.tsx's matching NO_SHOW_STYLE comment -- a
// completed session with no_show=true is otherwise visually identical to
// one that was actually held.
const NO_SHOW_STYLE = "text-orange-700 bg-orange-50";

export const metadata: Metadata = {
  title: "Therapist Dashboard | Dr. Pooja's Physio",
};

export default async function TherapistDashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  // All of these are independent of each other -- run in parallel instead
  // of one at a time, since router.refresh() re-runs this whole page on
  // every button click (Complete Session, Mark No-Show, availability edits,
  // payout requests). See admin/dashboard/page.tsx's identical Promise.all
  // for the reasoning. upcomingOverrides and patients further below stay
  // sequential -- they genuinely need profile.timezone and appointments'
  // patient_id list to resolve first.
  const [
    { data: profile },
    { data: settingsRow },
    { data: therapistCodeRow },
    { data: onLeaveProfile },
    { data: availabilitySlots },
    { data: rawAppointments },
    { data: sessionCodeLinks },
    { data: meetLinkRows },
    { data: payoutBatches },
    { data: treatmentCategories },
    { data: payoutRequests },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, credentials, avatar_url, revenue_share_percent, rating_visible, timezone")
      .eq("id", user.id)
      .single(),

    // These site_settings columns are new/migration-dependent -- isolated
    // so a missing migration only disables Feature Control's effects, not
    // the whole page.
    supabase
      .from("site_settings")
      .select(SITE_SETTINGS_SELECT)
      .maybeSingle(),

    // therapist_code is new/migration-dependent -- kept isolated for the
    // same reason as onLeaveProfile below (see its own comment).
    supabase.from("profiles").select("therapist_code").eq("id", user.id).maybeSingle(),

    // Kept as its own query rather than folded into the profile select
    // above -- on_leave is new and migration-dependent, and that select
    // feeds the whole page header (name, credentials, rating). An unknown-
    // column error there would blank the entire dashboard; isolated, only
    // the On Leave toggle degrades (defaults to "available") until the
    // migration runs.
    supabase.from("profiles").select("on_leave").eq("id", user.id).single(),

    supabase.from("therapist_availability_template").select("day_of_week, hour").eq("therapist_id", user.id),

    supabase
      .from("appointments")
      .select(
        "id, slot_time, timezone, concern, status, duration_minutes, notes, patient_id, therapist_rating, therapist_feedback, no_show, patient_rating, patient_rating_excluded, therapist_payout_batch_id, therapist_payout_amount_paise, payment_status, amount_paid_paise, therapist_payout_paid_at, category_id"
      )
      .eq("therapist_id", user.id)
      .order("created_at", { ascending: false }),

    // session_code is also new/migration-dependent -- same isolation
    // reasoning as therapistCodeRow above.
    supabase.from("appointments").select("id, session_code").eq("therapist_id", user.id),

    // meet_link is also new/migration-dependent -- same isolation reasoning
    // as sessionCodeLinks above.
    supabase.from("appointments").select("id, meet_link").eq("therapist_id", user.id),

    // Kept as its own query rather than folded into the profile select for
    // the same reason as onLeaveProfile -- therapist_payout_batches is new
    // and migration-dependent, and an unknown-table error here should only
    // degrade the Payout Receipts section (empty until the migration runs),
    // not blank the whole dashboard.
    supabase
      .from("therapist_payout_batches")
      .select("id, therapist_id, amount_paise, method, note, created_at")
      .eq("therapist_id", user.id)
      .order("created_at", { ascending: false }),

    supabase.from("treatment_categories").select("id, title"),

    // therapist_payout_requests is new/migration-dependent -- kept isolated
    // (it's its own brand-new table, so this is inherently its own query
    // already) so an unknown-table error here only empties the Earnings
    // tab's pending-request state, not the whole dashboard.
    supabase
      .from("therapist_payout_requests")
      .select("id, requested_amount_paise, status, requested_at, acknowledged_at")
      .eq("therapist_id", user.id)
      .order("requested_at", { ascending: false }),
  ]);

  const adminSettings = parseAdminSettings(settingsRow);
  const categoryTitleById = new Map((treatmentCategories ?? []).map((c) => [c.id, c.title]));

  const appointments = mergeMeetLinks(
    mergeSessionCodes(rawAppointments ?? [], sessionCodeLinks),
    meetLinkRows
  );
  const sessionCodeByAppointmentId = Object.fromEntries(
    appointments.map((a) => [a.id, a.session_code])
  );

  // What patients rated THIS therapist -- the therapist's own standing,
  // shown to them regardless of whether it's currently visible to the
  // public (rating_visible/site_settings only gate the public /team page
  // and homepage, not what a therapist can see about themselves).
  const ownRating = computeRatingAggregate(
    (appointments ?? []).map((a) => ({
      rating: a.patient_rating,
      excluded: a.patient_rating_excluded,
    }))
  );

  // Computed in the therapist's OWN timezone, not the server's UTC clock --
  // override dates are plain calendar dates meant to match the therapist's
  // own local "today" (see schema.sql's comment on this table). A UTC-based
  // cutoff would show a just-past override as "upcoming" for hours after
  // local midnight in timezones ahead of UTC, or hide a genuinely-still-
  // upcoming one in timezones behind UTC.
  const todayKey = new Date().toLocaleDateString("en-CA", {
    timeZone: profile?.timezone || "UTC",
  });

  // A therapist can read their own appointment rows via RLS, but not the
  // linked patients' profiles (that policy only allows a user to read
  // their own row) — so their patients' names/contact info have to be
  // looked up here via the admin client, scoped to just the columns
  // needed to actually run the session.
  const patientIds = [...new Set((appointments ?? []).map((a) => a.patient_id))];
  const admin = createAdminClient();
  const [{ data: upcomingOverrides }, { data: patients }] = await Promise.all([
    supabase
      .from("therapist_availability_override")
      .select("date, hour, available, note")
      .eq("therapist_id", user.id)
      .gte("date", todayKey),
    patientIds.length > 0
      ? admin.from("profiles").select("id, full_name, phone, email").in("id", patientIds)
      : Promise.resolve({
          data: [] as { id: string; full_name: string; phone: string | null; email: string }[],
        }),
  ]);
  const patientMap = new Map((patients ?? []).map((p) => [p.id, p]));
  const patientNameById = new Map(
    (patients ?? []).map((p) => [p.id, p.full_name ?? "Unknown patient"])
  );

  const payoutReceipts = buildTherapistPayoutReceipts(
    payoutBatches ?? [],
    appointments ?? [],
    patientNameById
  );

  const earningRows = computeTherapistEarningRows(
    appointments ?? [],
    profile?.revenue_share_percent ?? null,
    categoryTitleById,
    patientNameById,
    SESSION_FEE_PAISE
  );
  const pendingOwedPaise = computeTherapistPendingOwed(earningRows);
  const openRequest = (payoutRequests ?? []).find(
    (r) => r.status === "pending" || r.status === "reviewing"
  );
  const requestStatus: "none" | "pending" | "reviewing" =
    openRequest?.status === "reviewing" ? "reviewing" : openRequest ? "pending" : "none";
  // The most recent request whose completion the therapist hasn't seen yet
  // -- acknowledging it (see NotificationBanner) clears it so it doesn't
  // show forever.
  const latestCompletedRequest = (payoutRequests ?? []).find(
    (r) => r.status === "completed" && !r.acknowledged_at
  );

  const navItems = THERAPIST_NAV_ITEMS;

  // Shared between "Assigned Patient Sessions" and the Calendar tab's
  // tap-a-date detail list -- one true card style for a session, not two
  // copies that can drift apart.
  function renderAppointmentCard(a: (typeof appointments)[number]) {
    const patient = patientMap.get(a.patient_id);
    return (
      <div className="p-4 rounded-xl border border-slate-200 text-xs space-y-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <p className="font-bold text-slate-900">
              {patient?.full_name ?? "Unknown patient"}
            </p>
            <p className="text-slate-500">
              {patient?.phone || patient?.email || "No contact on file"}
            </p>
          </div>
          <span
            className={`capitalize font-semibold px-3 py-1 rounded-full ${
              a.no_show ? NO_SHOW_STYLE : STATUS_BADGE_STYLES[a.status] ?? "text-slate-600 bg-slate-100"
            }`}
          >
            {a.no_show ? "No-Show" : a.status}
          </span>
        </div>
        <p className="font-bold text-sm text-slate-900">
          {a.concern ?? "General Consultation"}
          {a.session_code && (
            <span className="ml-2 font-mono font-normal text-[11px] text-slate-400">
              {a.session_code}
            </span>
          )}
        </p>
        <p className="text-sm text-slate-500">
          {formatSlotTime(a.slot_time, a.timezone)}
          {a.duration_minutes && ` • ${a.duration_minutes} min`}
        </p>
        {a.notes && (
          <p className="text-slate-500">
            <span className="font-semibold text-slate-400">Notes:</span> {a.notes}
          </p>
        )}
        <div className="flex items-center gap-2 flex-wrap">
          <JoinSessionButton
            meetLink={a.meet_link}
            slotTime={a.slot_time}
            status={a.status}
            durationMinutes={a.duration_minutes}
          />
          {a.status === "confirmed" && (
            <>
              <CompleteSessionButton appointmentId={a.id} slotTime={a.slot_time} />
              <MarkNoShowButton appointmentId={a.id} />
            </>
          )}
        </div>
        {a.status === "completed" && !a.no_show && (
          <SessionFeedbackForm
            appointmentId={a.id}
            role="therapist"
            existingRating={a.therapist_rating}
            existingFeedback={a.therapist_feedback}
          />
        )}
      </div>
    );
  }

  // Same computation as the root layout's own showDebugNav -- duplicated
  // here (rather than threaded through props from a layout) because this
  // page hides the shared Navbar entirely and needs the same dev-only-bar
  // offset for its own fixed sidebar. See DashboardShell's offsetTop prop.
  const showDebugNav =
    process.env.NEXT_PUBLIC_SHOW_DEBUG_NAV === "true" ||
    (process.env.NEXT_PUBLIC_SHOW_DEBUG_NAV !== "false" &&
      process.env.NODE_ENV !== "production");

  return (
    <JoinWindowProvider beforeMinutes={adminSettings.joinWindowMinutes} afterMinutes={adminSettings.joinWindowAfterMinutes}>
    <DashboardShell
      brandLabel="Therapist Panel"
      brandIcon="fa-user-doctor"
      basePath="/therapist/dashboard"
      navItems={navItems}
      userName={profile?.full_name ?? "Therapist"}
      userEmail={user.email ?? ""}
      userAvatarUrl={profile?.avatar_url ?? null}
      userCode={therapistCodeRow?.therapist_code ?? null}
      offsetTop={showDebugNav}
      sessionTimeoutMinutes={adminSettings.sessionTimeoutMinutes}
      realtimeTables={["appointments", "therapist_payout_requests", "profile_change_requests"]}
      headerTitle={`Welcome, ${profile?.full_name ?? "there"}`}
      headerSubtitle={
        <>
          <p>{profile?.credentials}</p>
          {profile?.revenue_share_percent !== null &&
            profile?.revenue_share_percent !== undefined && (
              <p className="mt-1">
                Your Revenue Share:{" "}
                <strong className="text-slate-600">{profile.revenue_share_percent}%</strong>
              </p>
            )}
          <p className="mt-1">
            Your Rating:{" "}
            {ownRating.average === null ? (
              <strong className="text-slate-600">No ratings yet</strong>
            ) : (
              <strong className="text-slate-600">
                {ownRating.average.toFixed(1)} ({ownRating.count} rating
                {ownRating.count === 1 ? "" : "s"})
              </strong>
            )}
            {profile?.rating_visible === false && (
              <span className="text-slate-400"> — hidden from public pages</span>
            )}
          </p>
        </>
      }
    >
      <div id="availability">
        <div className="mb-6">
          <TherapistOnLeaveToggle initialOnLeave={onLeaveProfile?.on_leave ?? false} />
        </div>

        <div className="mb-6">
          <TherapistAvailabilityRoster
            initialSlots={availabilitySlots ?? []}
            timezone={profile?.timezone ?? null}
          />
        </div>

        {upcomingOverrides && upcomingOverrides.length > 0 && (
          <div className="mb-6">
            <TherapistUpcomingOverrides overrides={upcomingOverrides} />
          </div>
        )}
      </div>

      <div id="sessions" className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h2 className="font-bold text-lg text-slate-800 mb-4">
          Assigned Patient Sessions
        </h2>

        {!appointments || appointments.length === 0 ? (
          <p className="text-xs text-slate-500 py-8 text-center">
            No sessions have been assigned to you yet.
          </p>
        ) : (
          <ul className="space-y-3">
            {appointments.map((a) => (
              <li key={a.id}>{renderAppointmentCard(a)}</li>
            ))}
          </ul>
        )}
      </div>

      <div id="calendar" className="mt-8">
        <SessionCalendarTab
          sessions={appointments}
          cardsById={Object.fromEntries(appointments.map((a) => [a.id, renderAppointmentCard(a)]))}
        />
      </div>

      <div id="earnings" className="mt-8">
        <TherapistEarningsTab
          rows={earningRows}
          pendingOwedPaise={pendingOwedPaise}
          requestStatus={requestStatus}
          latestCompletedRequest={
            latestCompletedRequest
              ? {
                  id: latestCompletedRequest.id,
                  requestedAmountPaise: latestCompletedRequest.requested_amount_paise,
                  requestedAt: latestCompletedRequest.requested_at,
                }
              : null
          }
        />
      </div>

      <div id="receipts">
        <TherapistPayoutReceiptsSection
          receipts={payoutReceipts}
          sessionCodeByAppointmentId={sessionCodeByAppointmentId}
        />
      </div>
    </DashboardShell>
    </JoinWindowProvider>
  );
}
