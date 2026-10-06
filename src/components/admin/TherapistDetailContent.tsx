import Link from "next/link";
import ActivityTimeline from "@/components/admin/ActivityTimeline";
import { formatClinicDate, formatClinicDateTimeWithZone } from "@/lib/formatDateTime";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminContext } from "@/lib/supabase/requireAdmin";
import { scopeCanOpen } from "@/lib/adminScope";
import AvatarThumbnail from "@/components/profile/AvatarThumbnail";
import ApproveAccountButton from "@/components/admin/ApproveAccountButton";
import TherapistActiveToggle from "@/components/admin/TherapistActiveToggle";
import ViewAsUserButton from "@/components/admin/ViewAsUserButton";
import TherapistTeamVisibilityToggle from "@/components/admin/TherapistTeamVisibilityToggle";
import TherapistNotAvailableToggle from "@/components/admin/TherapistNotAvailableToggle";
import TherapistContactEditForm from "@/components/admin/TherapistContactEditForm";
import TherapistNotesForm from "@/components/admin/TherapistNotesForm";
import TherapistDisplayContentForm from "@/components/admin/TherapistDisplayContentForm";
import TherapistRevenueShareForm from "@/components/admin/TherapistRevenueShareForm";
import ResetTherapistPasswordButton from "@/components/admin/ResetTherapistPasswordButton";
import DeleteAccountButton from "@/components/admin/DeleteAccountButton";
import TherapistPayoutButton from "@/components/admin/TherapistPayoutButton";
import RatingManager from "@/components/admin/RatingManager";
import ProfileSessionList from "@/components/admin/ProfileSessionList";
import { PROFILE_FIELD_LABELS } from "@/lib/profileFieldLabels";
import { SESSION_FEE_PAISE } from "@/lib/pricing";
import { computeRatingAggregate } from "@/lib/ratingAggregate";
import { computeNoShowRate, computeCancellationRate } from "@/lib/adminMetrics";
import {
  computeTherapistPayoutSummary,
  type PayoutAppointment,
} from "@/lib/therapistPayouts";
import { mergeSessionCodes } from "@/lib/sessionCode";
import { mergeMeetLinks } from "@/lib/meetLink";
import { parseAdminSettings } from "@/lib/adminSettings";
import { JoinWindowProvider } from "@/lib/joinWindowContext";

// A plain module-level helper rather than a bare Date.now() inside a Server
// Component's render -- the same reasoning as the admin dashboard's and the
// patient loader's own nowTimestamp(): render must stay pure.
function nowTimestamp() {
  return Date.now();
}
import SpecialtyChip from "@/components/SpecialtyChip";
import TherapistReadinessPanel from "@/components/admin/TherapistReadinessPanel";
import { specialtyLabel } from "@/lib/therapistSpecialties";

// Shared body for both the standalone /admin/dashboard/therapists/[id] page
// (hard navigation, shareable link) and the @modal intercepted route that
// overlays it on top of the dashboard for in-portal soft navigation -- see
// Bug 10 and PatientDetailContent's identical rationale.
export default async function TherapistDetailContent({ id }: { id: string }) {
  // A person's page carries money -- what they paid, what we made on them,
  // what we owe them. The Money *section* is hidden from scopes that
  // shouldn't see it, but this page is reachable from People, which every
  // scope can open, so hiding the section alone would leave the numbers one
  // click away. Decided here, next to the data, rather than trusted from a
  // prop.
  const viewer = await getAdminContext();
  const canSeeMoney = viewer !== null && scopeCanOpen(viewer.scope, "money");
  // Same rule for the session controls in the list below: Reassign,
  // Cancel, Reopen and the rating actions all call routes guarded by
  // requireAdminScope("sessions"), which a finance admin does not have
  // even though they can open this page.
  const canManageSessions = viewer !== null && scopeCanOpen(viewer.scope, "sessions");

  const admin = createAdminClient();

  // Independent of each other -- run in parallel instead of one at a time.
  // See admin/dashboard/page.tsx's identical Promise.all for the reasoning.
  const [
    { data: settingsRow },
    { data: therapist },
    { data: therapistCodeRow },
    { data: displayContentRow },
    { data: homeVisitShareRow },
  ] = await Promise.all([
    // Isolated query, same migration-dependent convention as everything
    // else on this page -- only feeds the Join button's window here, never
    // blocks the rest of the detail page if the columns aren't migrated yet.
    admin.from("site_settings").select("join_window_minutes").maybeSingle(),

    admin
      .from("profiles")
      .select(
        "id, full_name, email, phone, avatar_url, active, approved, created_at, credentials, specialization, years_experience, bio, languages, revenue_share_percent, visible_on_team, rating_visible, on_leave"
      )
      .eq("id", id)
      .eq("role", "therapist")
      .single(),

    // therapist_code is new/migration-dependent -- kept isolated (see
    // sessionCode.ts's comment) so an unknown-column error here only
    // degrades this one badge, not the whole page.
    admin.from("profiles").select("therapist_code").eq("id", id).maybeSingle(),

    // public_display_note is also new/migration-dependent (Feature 38) --
    // same isolation reasoning as therapistCodeRow above.
    admin.from("profiles").select("public_display_note").eq("id", id).maybeSingle(),

    // home_visit_revenue_share_percent is newer still, and the dashboard reads
    // it the same isolated way (page.tsx's own query). Folded into the select
    // above it would take the whole profile down on a database that has not
    // run the migration -- this way the second share card is simply absent.
    admin
      .from("profiles")
      .select("home_visit_revenue_share_percent")
      .eq("id", id)
      .maybeSingle(),
  ]);
  const adminSettings = parseAdminSettings(settingsRow);

  if (!therapist) {
    notFound();
  }

  const [
    { data: note },
    { data: rawAppointments },
    { data: changeRequests },
    { data: openPayoutRequests },
    { data: sessionCodeLinks },
    { data: meetLinkRows },
    { data: homeVisitPayoutRows },
  ] = await Promise.all([
    admin
      .from("therapist_admin_notes")
      .select("note")
      .eq("therapist_id", id)
      .maybeSingle(),
    admin
      .from("appointments")
      .select(
        "id, slot_time, timezone, concern, status, payment_status, amount_paid_paise, duration_minutes, category_id, notes, created_at, patient_id, therapist_id, paid_at, patient_rating, patient_feedback, patient_rating_excluded, therapist_rating, therapist_feedback, therapist_rating_excluded, cancellation_reason, refund_status, refund_amount_paise, package_purchase_id, no_show, therapist_payout_paid_at, therapist_payout_amount_paise, therapist_payout_method, therapist_payout_note"
      )
      .eq("therapist_id", id)
      // Not what decides the list's order any more -- ProfileSessionList
      // orders by the session's own slot_time (src/lib/sessionOrdering.ts).
      // This is the deterministic input that comparator's created_at
      // tie-break reads, and it keeps the money lists below, which sort
      // themselves by paid_at, falling back to a settled order.
      .order("created_at", { ascending: false }),
    admin
      .from("profile_change_requests")
      .select("id, status, admin_notes, changes, created_at")
      .eq("user_id", id)
      .order("created_at", { ascending: false }),
    admin
      .from("therapist_payout_requests")
      .select("id")
      .eq("therapist_id", id)
      .in("status", ["pending", "reviewing"]),
    // session_code is also new/migration-dependent -- same isolation
    // reasoning as therapistCodeRow above.
    admin.from("appointments").select("id, session_code").eq("therapist_id", id),
    // meet_link is also new/migration-dependent -- same isolation reasoning
    // as sessionCodeLinks above.
    admin.from("appointments").select("id, meet_link").eq("therapist_id", id),
    // The home-visit columns the payout maths needs: a visit pays the
    // home-visit rate and reimburses travel in full, and cash the therapist is
    // holding nets off what a settlement transfers. Read on their own and
    // merged by id rather than added to the select above -- that select feeds
    // the session list, the ratings and the reassignment log too, so an
    // unknown column there would blank the whole page. Exactly the split
    // admin/dashboard/page.tsx already makes for AdminPayoutsTab.
    admin
      .from("appointments")
      .select(
        "id, visit_mode, travel_fee_paise, cash_collected_at, cash_collected_amount_paise, cash_remitted_at"
      )
      .eq("therapist_id", id),
  ]);

  const appointments = mergeMeetLinks(
    mergeSessionCodes(rawAppointments ?? [], sessionCodeLinks),
    meetLinkRows
  );


  const categoryIds = [
    ...new Set((appointments ?? []).map((a) => a.category_id).filter(Boolean)),
  ];
  const patientIds = [
    ...new Set((appointments ?? []).map((a) => a.patient_id).filter(Boolean)),
  ];
  const [
    { data: categories },
    { data: patients },
    { data: approvedTherapists },
    { count: weeklyHourCount },
  ] = await Promise.all([
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
    // Whether they work at all, for the readiness panel. A count rather than
    // the rows: nothing on this page draws the roster, and "has any hours"
    // is the whole of the question.
    admin
      .from("therapist_availability_template")
      .select("therapist_id", { count: "exact", head: true })
      .eq("therapist_id", id),
  ]);
  const homeVisitPayoutById = new Map(
    (homeVisitPayoutRows ?? [])
      .filter((v) => v.visit_mode === "home_visit")
      .map((v) => [
        v.id,
        {
          visit_mode: "home_visit" as const,
          travel_fee_paise: v.travel_fee_paise,
          cash_collected_at: v.cash_collected_at,
          cash_collected_amount_paise: v.cash_collected_amount_paise,
          cash_remitted_at: v.cash_remitted_at,
        },
      ])
  );
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

  // Sorted by when payment actually cleared, not booking-creation order -
  // same reasoning as the patient detail page's Payment History.
  const paidAppointments = (appointments ?? [])
    .filter((a) => a.payment_status === "paid")
    .sort((a, b) => {
      const at = a.paid_at ? new Date(a.paid_at).getTime() : new Date(a.created_at).getTime();
      const bt = b.paid_at ? new Date(b.paid_at).getTime() : new Date(b.created_at).getTime();
      return bt - at;
    });
  const sharePercent = therapist.revenue_share_percent;
  const homeVisitSharePercent =
    (homeVisitShareRow?.home_visit_revenue_share_percent as number | null | undefined) ?? null;

  // What this therapist is owed, from the one module that answers it.
  //
  // This page used to compute it inline off `revenue_share_percent` alone,
  // with no home-visit branch and no travel term -- so for any therapist who
  // does home visits the figure here, the figure on Money -> Payouts and the
  // amount the Pay button actually transfers were three different numbers.
  // `computeTherapistPayoutSummary` is what the Payouts screen and
  // `settle-therapist-payout` already agree on: a visit pays the home-visit
  // rate where one is set, travel is reimbursed in full on top, and cash the
  // therapist is already holding nets off the transfer. A profile that
  // disagrees with the button on it is worse than a profile missing a field.
  const payoutAppointments = (appointments ?? []).map((a) => ({
    ...a,
    ...(homeVisitPayoutById.get(a.id) ?? { visit_mode: "online" as const }),
  }));
  const payoutSummary = computeTherapistPayoutSummary(
    therapist.id,
    sharePercent,
    payoutAppointments as PayoutAppointment[],
    nowTimestamp(),
    homeVisitSharePercent
  );
  const owedPaise = payoutSummary.owedPaise;

  // Surfaced in the suspend confirmation so an admin isn't suspending
  // blind -- see TherapistActiveToggle.
  const upcomingSessionCount = (appointments ?? []).filter(
    (a) => a.status === "requested" || a.status === "confirmed"
  ).length;
  const openPayoutRequestCount = (openPayoutRequests ?? []).length;

  // All-time, this therapist only -- same math as the fleet-wide Metrics
  // tab stat (computeNoShowRate/computeCancellationRate), just scoped to
  // this one person's own appointments instead of a date-ranged fleet set.
  const noShowStats = computeNoShowRate(
    (appointments ?? []).filter((a) => a.status === "completed")
  );
  const cancellationStats = computeCancellationRate(appointments ?? []);

  return (
    <JoinWindowProvider
      beforeMinutes={adminSettings.joinWindowMinutes}
      afterMinutes={adminSettings.joinWindowAfterMinutes}
      completedAfterMinutes={adminSettings.sessionCompletedAfterMinutes}
    >
      {/* Above the header, not below the fold: what is missing here is the
          reason an assignment will not happen, so it belongs where somebody
          arriving to assign will read it. It renders nothing at all when
          there is nothing missing. */}
      <TherapistReadinessPanel
        name={therapist.full_name ?? "This therapist"}
        therapist={{
          approved: therapist.approved,
          active: therapist.active,
          onLeave: therapist.on_leave,
          weeklyHourCount: weeklyHourCount ?? 0,
          revenueSharePercent: therapist.revenue_share_percent,
          specialization: therapist.specialization,
        }}
      />
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <AvatarThumbnail url={therapist.avatar_url} name={therapist.full_name ?? "T"} size={64} />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-slate-900">{therapist.full_name}</h1>
                {therapistCodeRow?.therapist_code && (
                  <span className="text-[10px] font-mono font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">
                    {therapistCodeRow.therapist_code}
                  </span>
                )}
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
                <span
                  className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                    therapist.on_leave
                      ? "text-amber-700 bg-amber-100"
                      : "text-green-700 bg-green-100"
                  }`}
                >
                  {therapist.on_leave ? "Not Available" : "Available"}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                {/* Date and time, for the reason the patient page says. */}
                {therapist.credentials} • Joined{" "}
                {formatClinicDateTimeWithZone(therapist.created_at)}
              </p>
              <span className="mt-1.5 block">
                <SpecialtyChip specialization={therapist.specialization} />
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* Master Admin only, re-checked by the route -- see the same
                control on the patient page. */}
            {viewer?.scope === "full" && (
              <ViewAsUserButton
                userId={therapist.id}
                userName={therapist.full_name ?? "this therapist"}
              />
            )}
            {!therapist.approved && <ApproveAccountButton userId={therapist.id} />}
            <TherapistTeamVisibilityToggle
              therapistId={therapist.id}
              visibleOnTeam={therapist.visible_on_team}
              active={therapist.active}
              approved={therapist.approved}
            />
            <TherapistNotAvailableToggle therapistId={therapist.id} onLeave={therapist.on_leave} />
            <TherapistActiveToggle
              therapistId={therapist.id}
              active={therapist.active}
              upcomingSessionCount={upcomingSessionCount}
              openPayoutRequestCount={openPayoutRequestCount}
            />
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
              Specialist in: {specialtyLabel(therapist.specialization) ?? "Not set"}
            </p>
            <p className="text-slate-600">
              {therapist.years_experience !== null
                ? `${therapist.years_experience}+ years of experience`
                : "Years of experience not set"}
            </p>
            {therapist.languages && (
              <p className="text-slate-600">Languages: {therapist.languages}</p>
            )}
            {therapist.bio && <p className="text-slate-600">{therapist.bio}</p>}
          </div>
          <div className="mt-4 pt-4 border-t border-slate-100 space-y-3">
            {/*
              No password is shown or stored: the button issues a one-time
              link for them to set their own -- see src/lib/accessLink.ts.
            */}
            <ResetTherapistPasswordButton
              therapistId={therapist.id}
            />
            {/* See the patient screen's note: Master Admin only, checked
                again by the route. */}
            {viewer?.scope === "full" && (
              <DeleteAccountButton
                userId={therapist.id}
                name={therapist.full_name ?? therapist.email ?? "this therapist"}
                afterDeleteHref="/admin/dashboard?section=people&tab=therapists"
              />
            )}
          </div>
        </div>

        {/* Same rule as the Money section -- see canSeeMoney above. */}
        {canSeeMoney && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <h2 className="font-bold text-sm text-slate-800 mb-3">Revenue Share</h2>
          <TherapistRevenueShareForm
            therapistId={therapist.id}
            currentPercent={therapist.revenue_share_percent}
          />
          {/* The home-visit rate is a second, separate number that the payout
              maths has read since home visits shipped and that nothing in the
              app could write -- it was settable only in SQL. Blank is a real
              answer here and means "no separate rate", which is why the form
              takes `clearable`. */}
          <div className="mt-4 pt-4 border-t border-slate-100">
            <h2 className="font-bold text-sm text-slate-800 mb-1">Home-visit Revenue Share</h2>
            <p className="text-[11px] text-slate-500 mb-3">
              A home visit can pay a different rate. Travel is reimbursed in full on top of
              whichever share applies.
            </p>
            <TherapistRevenueShareForm
              therapistId={therapist.id}
              currentPercent={homeVisitSharePercent}
              endpoint="/api/admin/update-therapist-home-visit-revenue-share"
              field="homeVisitSharePercent"
              label="Home-visit %"
              clearable
              fallbackNote={
                sharePercent !== null
                  ? `Not set - home visits use the ordinary ${sharePercent}%.`
                  : "Not set - home visits use the ordinary session share."
              }
            />
          </div>
          <div className="mt-4 pt-4 border-t border-slate-100">
            <h2 className="font-bold text-sm text-slate-800 mb-1">Admin Notes</h2>
            <p className="text-[11px] text-slate-500 mb-3">Private - never shown to the therapist.</p>
            <TherapistNotesForm therapistId={therapist.id} currentNote={note?.note ?? ""} />
          </div>
        </div>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-6">
        <h2 className="font-bold text-sm text-slate-800 mb-1">Public Display Content</h2>
        <p className="text-[11px] text-slate-500 mb-3">
          Shown to visitors in this therapist&apos;s /team profile popup, alongside their own bio.
        </p>
        <TherapistDisplayContentForm
          therapistId={therapist.id}
          currentDisplayNote={displayContentRow?.public_display_note ?? ""}
        />
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
        <h2 className="font-bold text-sm text-slate-800 mb-3">Session Performance</h2>
        <p className="text-[11px] text-slate-500 -mt-2 mb-3">
          All-time, this therapist only. Same math as the fleet-wide rates on the Metrics tab.
        </p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-slate-500">No-Show Rate</p>
            <p className="font-bold text-slate-900 text-lg">
              {noShowStats.rate === null ? "-" : `${noShowStats.rate.toFixed(1)}%`}
            </p>
            <p className="text-slate-500">
              {noShowStats.noShowCount} of {noShowStats.completedCount} completed sessions
            </p>
          </div>
          <div>
            <p className="text-slate-500">Cancellation Rate</p>
            <p className="font-bold text-slate-900 text-lg">
              {cancellationStats.rate === null ? "-" : `${cancellationStats.rate.toFixed(1)}%`}
            </p>
            <p className="text-slate-500">
              {cancellationStats.cancelledCount} cancelled ({cancellationStats.refundedCount} refunded,{" "}
              {cancellationStats.forfeitedCount} forfeited)
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-6">
        <h2 className="font-bold text-sm text-slate-800 mb-3">Assigned Sessions</h2>
        <p className="text-[11px] text-slate-500 -mt-2 mb-3">
          Click a session to see its full detail, including rating &amp; feedback.
        </p>
        <ProfileSessionList
          canSeeMoney={canSeeMoney}
          canManageSessions={canManageSessions}
          variant="therapist"
          appointments={appointments ?? []}
          peopleMap={peopleMap}
          categoryMap={categoryMap}
          therapists={approvedTherapists ?? []}
          categories={categories ?? []}
          emptyMessage="No sessions assigned yet."
        />
      </div>

      {/* Same rule as the Money section -- see canSeeMoney above. */}
      {canSeeMoney && (
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
              // Same rule as the total above: a home visit is paid at the
              // home-visit rate where one is set, and its travel fee is
              // reimbursed in full on top. A row printing the online rate
              // beside a total that used the other one is what makes a
              // correct figure look wrong.
              const visit = homeVisitPayoutById.get(a.id);
              const isHomeVisit = !!visit;
              const rowShare = isHomeVisit ? homeVisitSharePercent ?? sharePercent : sharePercent;
              const travelPaise = isHomeVisit ? Math.max(0, visit.travel_fee_paise ?? 0) : 0;
              const computedPaise = Math.round((feePaise * rowShare) / 100) + travelPaise;
              const payoutPaise = isSettled
                ? a.therapist_payout_amount_paise ?? computedPaise
                : computedPaise;
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
                    {a.session_code && (
                      <span className="font-mono text-[11px] text-slate-500">{a.session_code}</span>
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
                        <span className="font-semibold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-full">
                          Owed
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="text-slate-500">
                    Session fee ₹{(feePaise / 100).toLocaleString("en-IN")} × {rowShare}%
                    {travelPaise > 0 && (
                      <> + ₹{(travelPaise / 100).toLocaleString("en-IN")} travel</>
                    )}{" "}
                    • Paid {a.paid_at ? formatClinicDate(a.paid_at) : "date unknown"}
                  </p>
                  {isSettled && (
                    <p className="text-slate-500">
                      Settled {formatClinicDate(a.therapist_payout_paid_at as string)}{" "}
                      via {a.therapist_payout_method}
                      {a.therapist_payout_note && <> - &quot;{a.therapist_payout_note}&quot;</>}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      )}

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
                    <span className="text-slate-500">
                      {formatClinicDate(r.created_at)}
                    </span>
                  </div>
                  <ul className="text-slate-600 space-y-0.5">
                    {Object.entries(changes).map(([field, value]) => (
                      <li key={field}>
                        <span className="text-slate-500">
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

      {/* Everything done by or to this person, with filters -- see
          src/lib/activityTimeline.ts. */}
      <div className="mt-6">
        <ActivityTimeline personId={id} title="Activity log" />
      </div>
    </JoinWindowProvider>
  );
}
