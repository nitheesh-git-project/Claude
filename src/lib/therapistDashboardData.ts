import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseAdminSettings, SITE_SETTINGS_SELECT } from "@/lib/adminSettings";
import { mergeSessionCodes } from "@/lib/sessionCode";
import { mergeMeetLinks } from "@/lib/meetLink";
import { buildTherapistNavItems } from "@/lib/dashboardNavItems";
import { buildTherapistFeed } from "@/lib/dashboardFeed";
import { computeTherapistEarningRows, computeTherapistPendingOwed } from "@/lib/therapistEarnings";
import { buildTherapistPayoutReceipts } from "@/lib/receipts";
import { computeRatingAggregate } from "@/lib/ratingAggregate";
import { computePerVisitFeePaise } from "@/lib/homeVisitPricing";
import { SESSION_FEE_PAISE } from "@/lib/pricing";
import { sessionsAwaitingNote, type SessionNoteRow } from "@/lib/sessionNotes";
import type { StatCell } from "@/components/dashboard/StatStrip";
import { loadRecommendablePackages } from "@/lib/carePlanServer";
import { maskPhone } from "@/lib/contactMasking";
import { parseOfferSnapshot } from "@/lib/carePlans";

// Everything the therapist dashboard's screens read, loaded once per
// request -- the same split as the patient's loader, and for the same
// reason: each section is now its own route rather than an anchor on one
// long scroll, and seven routes must not grow seven copies of these
// queries.
//
// Server-only: it holds admin-client reads (patient names, package info).

function nowTimestamp() {
  return Date.now();
}

/** Stands in for a query this screen doesn't need -- see the patient
 *  loader's copy for why the destructuring stays positional. */
function emptyRows<T>(): Promise<{ data: T[] }> {
  return Promise.resolve({ data: [] as T[] });
}

/** Which screen is asking -- see PatientScreen for the reasoning. */
export type TherapistScreen =
  | "overview"
  | "availability"
  | "sessions"
  | "home-visits"
  | "earnings"
  | "receipts";

export async function loadTherapistDashboard(screen: TherapistScreen = "overview") {
  const needAvailability = screen === "availability";
  // Earnings maths also backs the Overview's "owed to you" figure.
  const needEarnings = screen === "earnings" || screen === "receipts" || screen === "overview";
  const needNotes =
    screen === "overview" || screen === "sessions" || screen === "home-visits";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // Same posture as the patient loader: every caller sits behind the
    // dashboard proxy, so this only fires if a session evaporates
    // mid-request. Throwing keeps the return type non-nullable.
    throw new Error("No signed-in therapist");
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
    { data: leaveDetailRow },
    { data: scheduleStateRow },
    { data: availabilitySlots },
    { data: rawAppointments },
    { data: visitDetailRows },
    { data: sessionCodeLinks },
    { data: meetLinkRows },
    { data: payoutBatches },
    { data: treatmentCategories },
    { data: payoutRequests },
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

    // Leave dates and reason, and the schedule's version -- all three are
    // newer than the columns beside them, so they get their own calls for
    // the same reason on_leave does. A database missing them costs the
    // dates on the leave card and the concurrency check on Save, not the
    // page.
    supabase
      .from("profiles")
      .select("on_leave_from, on_leave_to, on_leave_reason")
      .eq("id", user.id)
      .maybeSingle(),

    supabase
      .from("therapist_schedule_state")
      .select("version")
      .eq("therapist_id", user.id)
      .maybeSingle(),

    needAvailability
      ? supabase.from("therapist_availability_template").select("day_of_week, hour").eq("therapist_id", user.id)
      : emptyRows<{ day_of_week: number; hour: number }>(),

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
    needEarnings
      ? supabase
          .from("therapist_payout_batches")
          .select("id, therapist_id, amount_paise, method, note, created_at")
          .eq("therapist_id", user.id)
          .order("created_at", { ascending: false })
      : emptyRows<{
          id: string;
          therapist_id: string;
          amount_paise: number;
          method: string | null;
          note: string | null;
          created_at: string;
        }>(),

    supabase.from("treatment_categories").select("id, title"),

    // therapist_payout_requests is new/migration-dependent -- kept isolated
    // (it's its own brand-new table, so this is inherently its own query
    // already) so an unknown-table error here only empties the Earnings
    // tab's pending-request state, not the whole dashboard.
    needEarnings
      ? supabase
          .from("therapist_payout_requests")
          .select("id, requested_amount_paise, status, requested_at, acknowledged_at")
          .eq("therapist_id", user.id)
          .order("requested_at", { ascending: false })
      : emptyRows<{
          id: string;
          requested_amount_paise: number;
          status: string;
          requested_at: string;
          acknowledged_at: string | null;
        }>(),

    // This therapist's own session notes. Its own query (rather than a
    // join on appointments) because session_notes is a brand-new table:
    // an unknown-table error before the migration runs should only empty
    // the note buttons, not blank the dashboard. RLS scopes it to notes
    // this clinician may read -- see session_notes_select_clinician.
    needNotes
      ? supabase
          .from("session_notes")
          .select("id, appointment_id, patient_id, therapist_id, data, free_text, created_at, updated_at")
          .order("created_at", { ascending: false })
      : emptyRows<SessionNoteRow>(),
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
    ...new Set((appointments ?? []).map((a) => a.patient_id).filter(Boolean)),
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
    { data: homeVisitPurchasesForFees },
  ] = await Promise.all([
    supabase
      .from("therapist_availability_override")
      .select("date, hour, available, note")
      .eq("therapist_id", user.id)
      .gte("date", todayKey),
    // Deliberately no `email`, and the phone is masked before it leaves
    // this function (see below). A therapist's dashboard used to hand over
    // every one of their patients' full contact details on every render --
    // a caseload copyable in an afternoon, with nothing anywhere recording
    // that it had been. The real number now comes one session at a time
    // through /api/therapist/reveal-contact, which logs the ask.
    patientIds.length > 0
      ? admin.from("profiles").select("id, full_name, phone, patient_code").in("id", patientIds)
      : Promise.resolve({
          data: [] as { id: string; full_name: string; phone: string | null; patient_code: string | null }[],
        }),
    homeVisitPurchaseIds.length > 0
      ? admin
          .from("home_visit_package_purchases")
          .select("id, amount_paid_paise, visit_count")
          .in("id", homeVisitPurchaseIds)
      : Promise.resolve({ data: [] as { id: string; amount_paid_paise: number | null; visit_count: number }[] }),
  ]);
  // Masking is applied here, at the one place the rows are loaded, rather
  // than in each card -- the same reasoning ledgerBalances.ts documents for
  // substituting a balance. A surface that renders `phone` gets the masked
  // string whether or not its author remembered the rule, and the plaintext
  // number is never in the page at all, so "masked" is not something a
  // reader can defeat with dev tools.
  const maskContacts = await readContactMaskingEnabled(admin);
  const patientMap = new Map(
    (patients ?? []).map((p) => [
      p.id,
      {
        ...p,
        phone: maskContacts ? maskPhone(p.phone).masked : p.phone,
        phoneMasked: maskContacts && maskPhone(p.phone).present,
      },
    ])
  );
  const patientNameById = new Map(
    (patients ?? []).map((p) => [p.id, p.full_name ?? "Unknown patient"])
  );
  // Which of this therapist's patients nobody has onboarded yet. Overview
  // only -- it feeds one feed item, and every other screen would pay for
  // a query it never renders.
  //
  // Its own call, and keyed off whether there is a record on file rather
  // than off the specialty column: `specialty` defaults to ortho, and an
  // autosaved draft creates the row before anyone has decided anything.
  // Isolated for the usual migration-tolerance reason.
  const { data: conditionProfileRows } =
    screen === "overview" && patientIds.length > 0
      ? await supabase
          .from("patient_condition_profiles")
          .select("patient_id, data")
          .in("patient_id", patientIds)
      : { data: [] as { patient_id: string; data: Record<string, string> | null }[] };
  const onboardedPatientIds = new Set(
    (conditionProfileRows ?? [])
      .filter((r) =>
        Object.values((r.data ?? {}) as Record<string, string>).some(
          (v) => typeof v === "string" && v.trim()
        )
      )
      .map((r) => r.patient_id)
  );

  const homeVisitPerVisitFeeByPurchaseId = new Map(
    (homeVisitPurchasesForFees ?? []).map((p) => [
      p.id,
      computePerVisitFeePaise(p.amount_paid_paise, p.visit_count),
    ])
  );

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

  // Recommendations this therapist wrote that the patient has now answered.
  // Overview only, and in its own call: it is one feed item, and every
  // other screen would pay for a query it never renders.
  const { data: answeredPlans } =
    screen === "overview"
      ? await admin
          .from("care_plans")
          .select("id, patient_id, status, accepted_at, declined_at, current_version_id")
          .eq("therapist_id", user.id)
          .in("status", ["accepted", "declined"])
          .order("updated_at", { ascending: false })
          .limit(10)
      : {
          data: [] as {
            id: string;
            patient_id: string;
            status: string;
            accepted_at: string | null;
            declined_at: string | null;
            current_version_id: string | null;
          }[],
        };

  const answeredVersionIds = (answeredPlans ?? [])
    .map((p) => p.current_version_id)
    .filter((id): id is string => !!id);
  const { data: answeredVersions } = answeredVersionIds.length
    ? await admin
        .from("care_plan_versions")
        .select("id, offer_snapshot")
        .in("id", answeredVersionIds)
    : { data: [] as { id: string; offer_snapshot: unknown }[] };
  const answeredTitleByVersion = new Map(
    (answeredVersions ?? []).map((v) => [
      v.id,
      parseOfferSnapshot(v.offer_snapshot)?.title ?? "Treatment programme",
    ])
  );

  const therapistFeed = buildTherapistFeed({
    carePlanAnswers: (answeredPlans ?? [])
      .filter((p) => p.accepted_at || p.declined_at)
      .map((p) => ({
        id: p.id,
        patientName: patientNameById.get(p.patient_id) ?? "A patient",
        title: p.current_version_id
          ? answeredTitleByVersion.get(p.current_version_id) ?? "Treatment programme"
          : "Treatment programme",
        status: p.status === "accepted" ? ("accepted" as const) : ("declined" as const),
        answeredAt: (p.accepted_at ?? p.declined_at) as string,
      })),
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
    onboardingPatients:
      screen === "overview"
        ? patientIds
            .filter((id) => !onboardedPatientIds.has(id))
            .map((id) => ({
              id,
              name: patientNameById.get(id) ?? "a patient",
              // Their earliest appointment with this therapist is when
              // the task began, so it sorts alongside everything else in
              // the feed rather than always pinning to now.
              assignedAt:
                (appointments ?? [])
                  .filter((a) => a.patient_id === id && a.slot_time)
                  .map((a) => a.slot_time as string)
                  .sort()[0] ?? new Date(nowMsForOverview).toISOString(),
            }))
        : [],
  }).concat(
    notesOwed.slice(0, 4).map((s) => ({
      id: `note-${s.id}`,
      at: s.slot_time ?? new Date(nowMsForOverview).toISOString(),
      icon: "fa-file-pen",
      tone: "warn" as const,
      title: `Session note needed — ${patientNameById.get(s.patient_id) ?? "a patient"}`,
      detail: "Write it while it's fresh; it's what you'll read before their next session.",
      href: "/therapist/dashboard/sessions",
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
      href: "/therapist/dashboard/sessions",
    },
    {
      label: "Upcoming",
      value: String(upcomingSessions.length),
      unit: upcomingSessions.length === 1 ? "session" : "sessions",
      note: "Confirmed and awaiting-assignment work",
      accent: "bg-blue-500",
      href: "/therapist/dashboard/sessions",
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
      href: "/therapist/dashboard/sessions",
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
      href: "/therapist/dashboard/earnings",
    },
  ];

  const navItems = buildTherapistNavItems();

  // Shared between "Assigned Patient Sessions" and the Calendar tab's
  // tap-a-date detail list -- one true card style for a session, not two
  // copies that can drift apart.
  // Programmes a therapist may recommend, resolved once for the whole
  // dashboard rather than per session card. Its own call and failure
  // tolerant: `recommendable` is a new column, and losing it must cost the
  // recommend control rather than the dashboard.
  const recommendablePackages = await loadRecommendablePackages(admin);

  return {
    user,
    sessionCodeByAppointmentId,
    profile,
    therapistCodeRow,
    adminSettings,
    appointments,
    onlineAppointments,
    homeVisits,
    patientMap,
    patientNameById,
    categoryTitleById,
    visitDetailById,
    availabilitySlots,
    upcomingOverrides,
    onLeaveProfile,
    scheduleVersion:
      typeof scheduleStateRow?.version === "number" ? scheduleStateRow.version : 0,
    leaveDates: {
      from: (leaveDetailRow?.on_leave_from as string | null) ?? null,
      to: (leaveDetailRow?.on_leave_to as string | null) ?? null,
      reason: (leaveDetailRow?.on_leave_reason as string | null) ?? null,
    },
    // The therapist's own local "today", already computed above for the
    // exceptions cutoff -- the availability screen needs the same one, and
    // deriving a second from a different clock is how the two would come to
    // disagree about which exceptions are upcoming.
    therapistTodayKey: todayKey,
    // Only what the schedule editor needs to warn that hours are being
    // removed from under a booked session. Derived from the appointments
    // this loader already has; it never writes to them.
    rosterAppointments: (appointments ?? []).map((a) => ({
      id: a.id as string,
      slotTime: (a.slot_time as string | null) ?? null,
      status: (a.status as string | null) ?? null,
      label: patientNameById.get(a.patient_id as string) ?? "A patient",
    })),
    earningRows,
    pendingOwedPaise,
    requestStatus,
    latestCompletedRequest,
    payoutReceipts,
    ownRating,
    navItems,
    sessionNotes,
    noteByAppointmentId,
    recommendablePackages,
    notesOwed,
    therapistFeed,
    overviewCells,
    nextSession,
    homeVisitPerVisitFeeByPurchaseId,
    nowMs: nowMsForOverview,
  };
}

export type TherapistDashboardData = Awaited<ReturnType<typeof loadTherapistDashboard>>;

/**
 * Whether contact masking is on, read on its own.
 *
 * Isolated from SITE_SETTINGS_SELECT for the migration-dependent-column
 * reason, and failing *closed* -- a database without the column masks. This
 * is the opposite direction to the scanner's mode, deliberately: an
 * unscanned day costs a record nobody reads, whereas an unmasked dashboard
 * hands out every patient's number, and the safe answer to "I do not know"
 * is different in each case.
 */
async function readContactMaskingEnabled(
  admin: ReturnType<typeof createAdminClient>
): Promise<boolean> {
  try {
    const { data } = await admin
      .from("site_settings")
      .select("contact_masking_enabled")
      .maybeSingle();
    return data?.contact_masking_enabled !== false;
  } catch {
    return true;
  }
}
