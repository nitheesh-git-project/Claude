import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import CompleteSessionButton from "@/components/CompleteSessionButton";
import SessionNoteButton from "@/components/therapist/SessionNoteButton";
import {
  isNoteEditable,
  noteEditHoursLeft,
  sessionsAwaitingNote,
  type SessionNoteRow,
} from "@/lib/sessionNotes";
import MarkNoShowButton from "@/components/MarkNoShowButton";
import SessionFeedbackForm from "@/components/SessionFeedbackForm";
import TherapistAvailabilityRoster from "@/components/TherapistAvailabilityRoster";
import TherapistOnLeaveToggle from "@/components/TherapistOnLeaveToggle";
import TherapistUpcomingOverrides from "@/components/TherapistUpcomingOverrides";
import TherapistPayoutReceiptsSection from "@/components/TherapistPayoutReceiptsSection";
import TherapistEarningsTab from "@/components/TherapistEarningsTab";
import PackageChip from "@/components/packages/PackageChip";
import TherapistProgrammePatients from "@/components/packages/TherapistProgrammePatients";
import DashboardShell from "@/components/dashboard/DashboardShell";
import DashboardOverview from "@/components/dashboard/DashboardOverview";
import SurfaceCard, { EmptyState } from "@/components/dashboard/SurfaceCard";
import type { StatCell } from "@/components/dashboard/StatStrip";
import { buildTherapistFeed } from "@/lib/dashboardFeed";
import SessionCalendarTab from "@/components/dashboard/SessionCalendarTab";
import { buildTherapistNavItems } from "@/lib/dashboardNavItems";
import {
  formatAddressBlock,
  mapsSearchUrl,
  visitAddressFromAppointment,
} from "@/lib/formatAddress";
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
import { computePerVisitFeePaise } from "@/lib/homeVisitPricing";
import CollectCashButton from "@/components/CollectCashButton";

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

// A plain module-level helper, not a bare Date.now() inline in the
// component body -- same reasoning as admin/dashboard/page.tsx's
// nowTimestamp(): a Server Component's render must stay pure.
function nowTimestamp() {
  return Date.now();
}

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
    { data: homeVisitShareRow },
    { data: onLeaveProfile },
    { data: availabilitySlots },
    { data: rawAppointments },
    { data: visitDetailRows },
    { data: sessionCodeLinks },
    { data: meetLinkRows },
    { data: payoutBatches },
    { data: treatmentCategories },
    { data: payoutRequests },
    { data: programmePurchases },
    { data: sessionNoteRows },
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

    // home_visit_revenue_share_percent is new/migration-dependent -- kept
    // isolated for the same reason as therapistCodeRow above. Feeds the
    // Earnings tab's home-visit-aware payout math; a missing migration just
    // means home visits fall back to the regular revenue_share_percent.
    supabase
      .from("profiles")
      .select("home_visit_revenue_share_percent")
      .eq("id", user.id)
      .maybeSingle(),

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
        "id, slot_time, timezone, concern, status, duration_minutes, notes, patient_id, therapist_rating, therapist_feedback, no_show, patient_rating, patient_rating_excluded, therapist_payout_batch_id, therapist_payout_amount_paise, payment_status, amount_paid_paise, therapist_payout_paid_at, category_id, package_purchase_id"
      )
      .eq("therapist_id", user.id)
      .order("created_at", { ascending: false }),

    // The home-visit columns, kept as their own query rather than added to
    // the select above: they are new and migration-dependent, and that
    // select feeds every session list, the calendar and the earnings math.
    // An unknown-column error there would blank the whole dashboard;
    // isolated, a missing migration only means no Home Visits section.
    supabase
      .from("appointments")
      .select(
        "id, visit_mode, visit_label, visit_address_line1, visit_address_line2, visit_landmark, visit_city, visit_state, visit_pincode, visit_latitude, visit_longitude, visit_contact_phone, visit_access_notes, travel_fee_paise, home_visit_purchase_id, cash_collected_at, cash_collected_amount_paise"
      )
      .eq("therapist_id", user.id),

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

    // Package purchases locked onto this therapist -- readable directly
    // via package_purchases_select_locked_therapist (schema.sql), no
    // admin client needed for the row itself. Feeds the Programme Patients
    // section: the whole point is seeing the arc of a package patient's
    // care, not just a flat list of disconnected sessions.
    supabase
      .from("patient_package_purchases")
      .select("id, purchase_code, patient_id, package_id, category_id, session_count, sessions_used, status, expires_at")
      .eq("locked_therapist_id", user.id)
      .order("created_at", { ascending: false }),

    // This therapist's own session notes. Its own query (rather than a
    // join on appointments) because session_notes is a brand-new table:
    // an unknown-table error before the migration runs should only empty
    // the note buttons, not blank the dashboard. RLS scopes it to notes
    // this clinician may read -- see session_notes_select_clinician.
    supabase
      .from("session_notes")
      .select("id, appointment_id, patient_id, therapist_id, data, free_text, created_at, updated_at")
      .order("created_at", { ascending: false }),
  ]);

  const adminSettings = parseAdminSettings(settingsRow);
  const categoryTitleById = new Map((treatmentCategories ?? []).map((c) => [c.id, c.title]));

  const visitDetailById = new Map((visitDetailRows ?? []).map((r) => [r.id, r]));

  const sessionNotes = (sessionNoteRows ?? []) as SessionNoteRow[];
  const noteByAppointmentId = new Map(sessionNotes.map((n) => [n.appointment_id, n]));

  const appointments = mergeMeetLinks(
    mergeSessionCodes(rawAppointments ?? [], sessionCodeLinks),
    meetLinkRows
  ).map((a) => ({ ...a, visit: visitDetailById.get(a.id) ?? null }));

  // One query, split in memory -- a therapist's list is small, and a second
  // round trip to the same table filtered the other way would cost more
  // than the filter does.
  const onlineAppointments = appointments.filter((a) => a.visit?.visit_mode !== "home_visit");
  const homeVisits = appointments.filter((a) => a.visit?.visit_mode === "home_visit");
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
  const patientIds = [
    ...new Set(
      [
        ...(appointments ?? []).map((a) => a.patient_id),
        ...(programmePurchases ?? []).map((p) => p.patient_id),
      ].filter(Boolean)
    ),
  ];
  const programmePackageIds = [
    ...new Set((programmePurchases ?? []).map((p) => p.package_id).filter(Boolean)),
  ];
  // Which home-visit purchases this therapist's own visits reference --
  // needed only to compute the exact "Collect ₹X" figure on a cash-on-visit
  // card (per-visit fee derived from the purchase's total, same math
  // bookHomeVisitSession used when the visit was created).
  const homeVisitPurchaseIds = [
    ...new Set(
      (visitDetailRows ?? [])
        .map((v) => v.home_visit_purchase_id)
        .filter((id): id is string => !!id)
    ),
  ];
  const admin = createAdminClient();
  const [
    { data: upcomingOverrides },
    { data: patients },
    { data: programmePackageInfo },
    { data: homeVisitPurchasesForFees },
  ] = await Promise.all([
    supabase
      .from("therapist_availability_override")
      .select("date, hour, available, note")
      .eq("therapist_id", user.id)
      .gte("date", todayKey),
    patientIds.length > 0
      ? admin.from("profiles").select("id, full_name, phone, email, patient_code").in("id", patientIds)
      : Promise.resolve({
          data: [] as { id: string; full_name: string; phone: string | null; email: string; patient_code: string | null }[],
        }),
    programmePackageIds.length > 0
      ? admin.from("treatment_category_packages").select("id, title").in("id", programmePackageIds as string[])
      : Promise.resolve({ data: [] as { id: string; title: string }[] }),
    homeVisitPurchaseIds.length > 0
      ? admin
          .from("home_visit_package_purchases")
          .select("id, amount_paid_paise, visit_count")
          .in("id", homeVisitPurchaseIds)
      : Promise.resolve({ data: [] as { id: string; amount_paid_paise: number | null; visit_count: number }[] }),
  ]);
  const patientMap = new Map((patients ?? []).map((p) => [p.id, p]));
  const patientNameById = new Map(
    (patients ?? []).map((p) => [p.id, p.full_name ?? "Unknown patient"])
  );
  const programmePackageTitleById = new Map((programmePackageInfo ?? []).map((p) => [p.id, p.title]));
  const homeVisitPerVisitFeeByPurchaseId = new Map(
    (homeVisitPurchasesForFees ?? []).map((p) => [
      p.id,
      computePerVisitFeePaise(p.amount_paid_paise, p.visit_count),
    ])
  );

  // Same in-memory completed/scheduled derivation as the patient
  // dashboard's package widget -- every session on a purchase locked to
  // this therapist already carries their own therapist_id, so it's
  // already inside `appointments` above; no extra query needed.
  const programmeCompletedByPurchase = new Map<string, number>();
  const programmeScheduledByPurchase = new Map<string, number>();
  for (const a of appointments ?? []) {
    if (!a.package_purchase_id) continue;
    if (a.status === "completed") {
      programmeCompletedByPurchase.set(a.package_purchase_id, (programmeCompletedByPurchase.get(a.package_purchase_id) ?? 0) + 1);
    } else if (
      (a.status === "requested" || a.status === "confirmed") &&
      a.slot_time &&
      new Date(a.slot_time).getTime() > nowTimestamp()
    ) {
      programmeScheduledByPurchase.set(a.package_purchase_id, (programmeScheduledByPurchase.get(a.package_purchase_id) ?? 0) + 1);
    }
  }

  const payoutReceipts = buildTherapistPayoutReceipts(
    payoutBatches ?? [],
    appointments ?? [],
    patientNameById
  );

  const earningRows = computeTherapistEarningRows(
    (appointments ?? []).map((a) => ({
      ...a,
      visit_mode: a.visit?.visit_mode ?? null,
      travel_fee_paise: a.visit?.travel_fee_paise ?? null,
    })),
    profile?.revenue_share_percent ?? null,
    categoryTitleById,
    patientNameById,
    SESSION_FEE_PAISE,
    homeVisitShareRow?.home_visit_revenue_share_percent ?? null
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

  // ---- Overview -----------------------------------------------------
  // The same three questions the other dashboards answer, in therapist
  // terms: how is my week, what needs me, what do I do next.
  const nowMsForOverview = nowTimestamp();
  const upcomingSessions = (appointments ?? [])
    .filter(
      (a) =>
        (a.status === "confirmed" || a.status === "requested") &&
        a.slot_time &&
        new Date(a.slot_time).getTime() > nowMsForOverview
    )
    .sort((a, b) => new Date(a.slot_time!).getTime() - new Date(b.slot_time!).getTime());
  const nextSession = upcomingSessions[0] ?? null;
  const todayCount = (appointments ?? []).filter((a) => {
    if (!a.slot_time) return false;
    const slot = new Date(a.slot_time);
    const today = new Date(nowMsForOverview);
    return (
      slot.getFullYear() === today.getFullYear() &&
      slot.getMonth() === today.getMonth() &&
      slot.getDate() === today.getDate() &&
      a.status !== "cancelled"
    );
  }).length;
  // A session whose slot has passed but which nobody has marked complete
  // is the therapist's own to-do -- the payout can't count it until then.
  const awaitingCompletion = (appointments ?? []).filter(
    (a) => a.status === "confirmed" && a.slot_time && new Date(a.slot_time).getTime() < nowMsForOverview
  ).length;
  // Delivered sessions with nothing written about them yet. Nudge, never
  // block: completion stays a one-tap action, and this is what keeps the
  // note from being forgotten instead.
  const notesOwed = sessionsAwaitingNote(
    (appointments ?? []).map((a) => ({
      id: a.id,
      slot_time: a.slot_time,
      status: a.no_show ? "cancelled" : a.status,
      patient_id: a.patient_id,
    })),
    noteByAppointmentId,
    nowMsForOverview
  );

  const therapistFeed = buildTherapistFeed({
    appointments: (appointments ?? []).map((a) => ({
      id: a.id,
      slot_time: a.slot_time,
      status: a.status,
      visit_mode: a.visit?.visit_mode ?? null,
      created_at: a.slot_time,
      patient_name: patientNameById.get(a.patient_id) ?? null,
    })),
    payouts: (payoutBatches ?? []).map((b) => ({
      id: b.id,
      status: "paid",
      amount_paise: b.amount_paise ?? 0,
      created_at: b.created_at,
      paid_at: b.created_at,
    })),
    accessGrants: [],
  }).concat(
    notesOwed.slice(0, 4).map((s) => ({
      id: `note-${s.id}`,
      at: s.slot_time ?? new Date(nowMsForOverview).toISOString(),
      icon: "fa-file-pen",
      tone: "warn" as const,
      title: `Session note needed — ${patientNameById.get(s.patient_id) ?? "a patient"}`,
      detail: "Write it while it's fresh; it's what you'll read before their next session.",
      href: "/therapist/dashboard#sessions",
      needsYou: true,
    }))
  );

  const overviewCells: StatCell[] = [
    {
      label: "Today",
      value: String(todayCount),
      unit: todayCount === 1 ? "session" : "sessions",
      note: nextSession?.slot_time
        ? `Next at ${new Date(nextSession.slot_time).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
        : "Nothing scheduled today",
      accent: "bg-teal-500",
      href: "#sessions",
    },
    {
      label: "Upcoming",
      value: String(upcomingSessions.length),
      unit: upcomingSessions.length === 1 ? "session" : "sessions",
      note: "Confirmed and awaiting-assignment work",
      accent: "bg-blue-500",
      href: "#calendar",
    },
    {
      label: "Notes to write",
      value: String(notesOwed.length),
      note:
        notesOwed.length === 0
          ? awaitingCompletion > 0
            ? `${awaitingCompletion} still to mark complete`
            : "Every delivered session is written up"
          : "Delivered sessions with nothing recorded yet",
      accent: notesOwed.length > 0 ? "bg-amber-500" : "bg-emerald-500",
      href: "#sessions",
    },
    {
      label: "Owed to you",
      value: `₹${(pendingOwedPaise / 100).toLocaleString("en-IN")}`,
      note:
        requestStatus === "none"
          ? "Not yet requested"
          : requestStatus === "reviewing"
            ? "Payout request under review"
            : "Payout request sent",
      accent: "bg-emerald-500",
      href: "#earnings",
    },
  ];

  const navItems = buildTherapistNavItems({ hasHomeVisits: homeVisits.length > 0 });

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
            {a.patient_id && (
              <Link
                href={`/therapist/dashboard/health-profile/${a.patient_id}`}
                className="inline-block mt-1 text-[11px] font-semibold text-teal-700 hover:text-teal-800"
              >
                View Health Profile →
              </Link>
            )}
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
        {a.package_purchase_id && <PackageChip purchaseId={a.package_purchase_id} />}
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
          {/* The note lives on the card, not behind the patient's chart:
              the moment a therapist can write an accurate note is the
              moment they finish and are still looking at the session. */}
          {!a.no_show &&
            (a.status === "completed" ||
              (a.status === "confirmed" && !!a.slot_time && new Date(a.slot_time).getTime() < nowMsForOverview)) && (
              <SessionNoteButton
                appointmentId={a.id}
                patientName={patient?.full_name ?? "Patient"}
                sessionLabel={formatSlotTime(a.slot_time, a.timezone)}
                note={noteByAppointmentId.get(a.id) ?? null}
                editable={
                  !noteByAppointmentId.has(a.id) ||
                  isNoteEditable(noteByAppointmentId.get(a.id)!, nowMsForOverview)
                }
                hoursLeft={
                  noteByAppointmentId.has(a.id)
                    ? noteEditHoursLeft(noteByAppointmentId.get(a.id)!, nowMsForOverview)
                    : null
                }
              />
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

  // The home-visit twin of renderAppointmentCard. A separate function
  // rather than branches inside that one: almost every line differs (an
  // address block and a map link instead of a Join button, a cash badge,
  // no Meet link at all), and interleaving the two would make both harder
  // to read than having them side by side.
  function renderHomeVisitCard(a: (typeof appointments)[number]) {
    const patient = patientMap.get(a.patient_id);
    const visit = a.visit;
    const visitAddress = visit ? visitAddressFromAppointment(visit) : null;
    const addressLines = visitAddress ? formatAddressBlock(visitAddress) : [];
    const mapsUrl = visitAddress ? mapsSearchUrl(visitAddress) : null;
    // The number to ring at the door, which may deliberately differ from
    // the account holder's -- an elderly patient's booking is often made
    // by a relative.
    const callNumber = visit?.visit_contact_phone || patient?.phone || null;
    // An unpaid home visit is a cash-at-the-door booking by definition:
    // the prepaid path marks the appointment paid at creation, so anything
    // still unpaid here is money the therapist collects on arrival.
    const cashDue = a.payment_status !== "paid" && !visit?.cash_collected_at;

    return (
      <div className="p-4 rounded-xl border border-slate-200 text-xs space-y-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <p className="font-bold text-slate-900">{patient?.full_name ?? "Unknown patient"}</p>
            {callNumber ? (
              <a href={`tel:${callNumber}`} className="text-teal-700 font-semibold hover:underline">
                {callNumber}
              </a>
            ) : (
              <p className="text-slate-500">{patient?.email || "No contact on file"}</p>
            )}
            {a.patient_id && (
              <Link
                href={`/therapist/dashboard/health-profile/${a.patient_id}`}
                className="inline-block mt-1 text-[11px] font-semibold text-teal-700 hover:text-teal-800"
              >
                View Health Profile →
              </Link>
            )}
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
          {a.concern ?? "Home Physiotherapy Visit"}
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

        {addressLines.length > 0 && (
          <div className="rounded-lg bg-slate-50 p-3 space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              Address
            </p>
            {addressLines.map((line) => (
              <p key={line} className="text-slate-700">
                {line}
              </p>
            ))}
            {visit?.visit_access_notes && (
              <p className="text-slate-600 pt-1">
                <span className="font-semibold text-slate-400">Getting in:</span>{" "}
                {visit.visit_access_notes}
              </p>
            )}
            {mapsUrl && (
              <a
                href={mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 pt-1 text-[11px] font-semibold text-teal-700 hover:text-teal-800"
              >
                <i className="fa-solid fa-location-dot" /> Open in Maps
              </a>
            )}
          </div>
        )}

        {a.notes && (
          <p className="text-slate-500">
            <span className="font-semibold text-slate-400">Notes:</span> {a.notes}
          </p>
        )}

        {cashDue && (
          <div className="rounded-lg bg-amber-50 px-3 py-2">
            <p className="mb-2 font-semibold text-amber-800">
              <i className="fa-solid fa-indian-rupee-sign mr-1.5" />
              Collect payment at the door
            </p>
            <CollectCashButton
              appointmentId={a.id}
              amountPaise={
                (visit?.home_visit_purchase_id
                  ? homeVisitPerVisitFeeByPurchaseId.get(visit.home_visit_purchase_id) ?? 0
                  : 0) + Math.max(0, visit?.travel_fee_paise ?? 0)
              }
            />
          </div>
        )}
        {visit?.cash_collected_at && (
          <p className="text-teal-700 font-semibold">
            <i className="fa-solid fa-circle-check mr-1.5" />
            Cash collected
            {visit.cash_collected_amount_paise
              ? ` — ₹${(visit.cash_collected_amount_paise / 100).toLocaleString("en-IN")}`
              : ""}
          </p>
        )}

        {/* No JoinSessionButton: there is nothing to join, the therapist is
            travelling to the address above. */}
        {a.status === "confirmed" && (
          <div className="flex items-center gap-2 flex-wrap">
            <CompleteSessionButton appointmentId={a.id} slotTime={a.slot_time} />
            <MarkNoShowButton appointmentId={a.id} />
          </div>
        )}

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
      realtimeTables={[
        "appointments",
        "therapist_payout_requests",
        "profile_change_requests",
        "profiles",
        "site_settings",
        "therapist_availability_template",
        "therapist_availability_override",
        "therapist_payout_batches",
        "treatment_categories",
        "patient_package_purchases",
      ]}
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
      <DashboardOverview
        greeting="Your practice today"
        headline={
          nextSession?.slot_time
            ? `Next up: ${patientNameById.get(nextSession.patient_id) ?? "a patient"} at ${new Date(
                nextSession.slot_time
              ).toLocaleString([], { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}.`
            : "No sessions booked yet — keep your availability open and the clinic assigns work to it."
        }
        cells={overviewCells}
        feed={therapistFeed}
        feedEmptyBody="Assignments, completed sessions and payouts show up here as they happen."
        actions={[
          { label: "Set your availability", hint: "Weekly hours and day overrides", icon: "fa-calendar-days", href: "/therapist/dashboard#availability", primary: true },
          { label: "Your assigned sessions", hint: "Join, complete, or mark a no-show", icon: "fa-clipboard-list", href: "/therapist/dashboard#sessions" },
          { label: "Patient health profiles", hint: "Intake answers and pain maps", icon: "fa-notes-medical", href: "/therapist/dashboard/health-profile" },
          { label: "Earnings and payouts", hint: "What you've earned and what's owed", icon: "fa-chart-line", href: "/therapist/dashboard#earnings" },
        ]}
      />

      <div className="mt-8" />

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

      <SurfaceCard
        id="sessions"
        title="Assigned Patient Sessions"
        icon="fa-clipboard-list"
        subtitle="Video consultations the clinic has assigned to you."
      >
        {onlineAppointments.length === 0 ? (
          <EmptyState
            icon="fa-clipboard-list"
            title="No sessions assigned yet"
            body="Keep your weekly availability up to date — the clinic assigns bookings into the hours you have open."
          />
        ) : (
          <ul className="space-y-3">
            {onlineAppointments.map((a) => (
              <li key={a.id}>{renderAppointmentCard(a)}</li>
            ))}
          </ul>
        )}
      </SurfaceCard>

      {homeVisits.length > 0 && (
        <SurfaceCard
          id="home-visits"
          title="Home Visits"
          icon="fa-house-medical"
          subtitle="Sessions you travel to. Check the address and access notes before you set off."
          className="mt-8"
        >
          <ul className="space-y-3">
            {homeVisits.map((a) => (
              <li key={a.id}>{renderHomeVisitCard(a)}</li>
            ))}
          </ul>
        </SurfaceCard>
      )}

      <SurfaceCard
        id="programmes"
        title="Programme Patients"
        icon="fa-layer-group"
        subtitle="Package purchases locked to you for their whole programme — tap one for the full completed/upcoming/pending picture."
        className="mt-8"
      >
        <TherapistProgrammePatients
          purchases={(programmePurchases ?? []).map((p) => ({
            id: p.id,
            purchaseCode: p.purchase_code,
            patientName: patientNameById.get(p.patient_id) ?? "Unknown patient",
            patientCode: patientMap.get(p.patient_id)?.patient_code ?? null,
            packageTitle: programmePackageTitleById.get(p.package_id) ?? "Session Package",
            sessionCount: p.session_count,
            sessionsUsed: p.sessions_used,
            completedCount: programmeCompletedByPurchase.get(p.id) ?? 0,
            scheduledCount: programmeScheduledByPurchase.get(p.id) ?? 0,
            status: p.status,
          }))}
        />
      </SurfaceCard>

      <div id="calendar" className="mt-8">
        {/* Both kinds share the calendar -- a therapist's day is one day,
            whether a slot is a call or a journey. Each entry renders the
            card that matches its own mode. */}
        <SessionCalendarTab
          sessions={appointments}
          cardsById={Object.fromEntries(
            appointments.map((a) => [
              a.id,
              a.visit?.visit_mode === "home_visit"
                ? renderHomeVisitCard(a)
                : renderAppointmentCard(a),
            ])
          )}
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
