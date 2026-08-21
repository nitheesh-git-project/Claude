import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseAdminSettings, SITE_SETTINGS_SELECT } from "@/lib/adminSettings";
import { mergeSessionCodes } from "@/lib/sessionCode";
import { mergeMeetLinks } from "@/lib/meetLink";
import { countAnswered, INTAKE_QUESTIONS } from "@/lib/conditionIntake";
import { buildPatientFeed } from "@/lib/dashboardFeed";
import { buildPatientNavItems } from "@/lib/dashboardNavItems";
import { expireDueHomeVisitPurchases } from "@/lib/expireHomeVisitPurchases";
import { expireDuePackagePurchases } from "@/lib/expirePackagePurchases";
import type { StatCell } from "@/components/dashboard/StatStrip";

// Everything the patient dashboard's screens read, loaded once per
// request.
//
// The dashboard used to be a single page whose sections were anchors on
// one enormous scroll, with the sidebar highlighting whichever section
// happened to be nearest the top. That made the nav feel like it was
// choosing for you. Each section is now its own route (/book, /sessions,
// /calendar, ...), so a nav item is a real page you land on -- and this
// module is what stops seven routes growing seven slightly different
// copies of the same twenty queries.
//
// Server-only: it holds an admin-client read (therapist names, category
// prices) that must never reach the browser.

// A plain module-level helper rather than a bare Date.now() inside a
// Server Component's render -- same reasoning as the admin dashboard's
// nowTimestamp(): render must stay pure.
function nowTimestamp() {
  return Date.now();
}

// Row shapes for the two Book-a-Session queries. Spelled out because the
// placeholder used when a screen doesn't need them has to carry the same
// shape the hub component expects, and an inferred `never` would not.
type HubCategoryRow = {
  id: string;
  title: string;
  description: string | null;
  price_paise: number;
  duration_minutes: number | null;
  cta_label: string | null;
};

type HubHomeVisitPackageRow = {
  id: string;
  title: string;
  subtitle: string | null;
  image_url: string | null;
  benefits: unknown;
  badge_label: string | null;
  highlight: boolean | null;
  visit_count: number;
  price_paise: number;
  compare_at_paise: number | null;
  visit_duration_minutes: number | null;
  validity_days: number | null;
  travel_fee_included: boolean | null;
  therapist_locked: boolean | null;
};

/** Stands in for a query this screen doesn't need, so the destructuring
 *  below stays positional and every caller still gets the same shape. */
function emptyRows<T>(): Promise<{ data: T[] }> {
  return Promise.resolve({ data: [] as T[] });
}

/** Which screen is asking. Each route passes its own, and the loader
 *  skips the queries that screen cannot render -- switching tabs is a
 *  server round trip now, so a tab must not pay for the whole dashboard's
 *  data to show one list. Everything the sidebar needs to decide which
 *  entries exist stays in the always-loaded core, or the nav would change
 *  shape as you move between screens. */
export type PatientScreen =
  | "overview"
  | "book"
  | "sessions"
  | "home-visits"
  | "calendar"
  | "packages"
  | "receipts";

export async function loadPatientDashboard(screen: PatientScreen = "overview") {
  const needHub = screen === "book";
  const needReceipts = screen === "receipts";
  const needPackageDetail = screen === "packages";
  const needFeed = screen === "overview";
  // Session cards name their therapist; so does the Overview's feed.
  const needTherapistNames =
    screen === "overview" || screen === "sessions" || screen === "home-visits" || screen === "calendar";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // Callers are all behind the dashboard proxy, so this only happens if
    // a session evaporates mid-request. Throwing keeps the return type
    // non-nullable for every screen rather than making each one re-check.
    throw new Error("No signed-in patient");
  }

  // Runs before the big read below so this same request already sees any
  // of this patient's purchases this sweep just flipped to 'expired' --
  // see the helper's own comment for why this is a lazy sweep rather than
  // a scheduled job. This admin client instance is reused further down for
  // the category/therapist/package-info lookups that already needed one.
  const admin = createAdminClient();
  await expireDuePackagePurchases(admin);
  await expireDueHomeVisitPurchases(admin);

  // All of these are independent of each other -- run in parallel instead
  // of one at a time, since router.refresh() re-runs this whole page on
  // every button click (Pay Now, Cancel Session, feedback, package
  // purchase) and this is the single most-hit page in the app. See
  // admin/dashboard/page.tsx's identical Promise.all for the reasoning.
  // categoryPrices and therapists further below stay sequential -- they
  // genuinely need appointments/allPackagePurchases to resolve first.
  const [
    { data: profile },
    { data: settingsRow },
    { data: patientCodeRow },
    { data: rawAppointments },
    { data: sessionCodeLinks },
    { data: meetLinkRows },
    { data: allPackagePurchases },
    { data: paymentFailures },
    { data: activeCategories },
    { data: availablePackages },
    { data: ownedPackages },
    { data: onboardingRow },
    { data: conditionProfile },
    { data: conditionRequests },
    { data: visitDetailRows },
    { data: homeVisitPackages },
    { data: ownedHomeVisitPackages },
    { data: bookableCategories },
  ] = await Promise.all([
    supabase.from("profiles").select("full_name, email, avatar_url").eq("id", user.id).single(),

    // These site_settings columns are new/migration-dependent -- isolated
    // so a missing migration only disables Feature Control's effects, not
    // the whole page.
    supabase
      .from("site_settings")
      .select(SITE_SETTINGS_SELECT)
      .maybeSingle(),

    // patient_code is new and migration-dependent -- its own isolated query
    // (rather than folded into the select above) so a missing-column error
    // before the migration runs only hides this one badge, not the whole
    // profile fetch this page's header depends on.
    supabase.from("profiles").select("patient_code").eq("id", user.id).maybeSingle(),

    supabase
      .from("appointments")
      .select(
        "id, slot_time, timezone, concern, status, payment_status, amount_paid_paise, paid_at, razorpay_payment_id, category_id, duration_minutes, therapist_id, patient_rating, patient_feedback, refund_status, package_purchase_id, no_show, therapist_payout_paid_at"
      )
      .eq("patient_id", user.id)
      .order("created_at", { ascending: false }),

    // session_code is also new/migration-dependent -- same isolation
    // reasoning as patientCodeRow above.
    supabase.from("appointments").select("id, session_code").eq("patient_id", user.id),

    // meet_link is also new/migration-dependent -- same isolation reasoning
    // as sessionCodeLinks above.
    supabase.from("appointments").select("id, meet_link").eq("patient_id", user.id),

    // Full purchase history (not just currently-usable packages -- that's
    // ownedPackages below, filtered to paid ones with sessions remaining) so
    // the Receipts section can show a payment-confirmed receipt for every
    // package ever bought, same as every other paid appointment.
    needReceipts
      ? supabase
          .from("patient_package_purchases")
          .select("id, category_id, session_count, payment_status, amount_paid_paise, paid_at, razorpay_payment_id")
          .eq("patient_id", user.id)
          .order("created_at", { ascending: false })
      : emptyRows<{
          id: string;
          category_id: string | null;
          session_count: number;
          payment_status: string;
          amount_paid_paise: number | null;
          paid_at: string | null;
          razorpay_payment_id: string | null;
        }>(),

    needReceipts
      ? supabase
          .from("payment_failure_log")
          .select(
            "id, patient_id, appointment_id, package_purchase_id, amount_paise, error_code, error_reason, error_description, created_at"
          )
          .eq("patient_id", user.id)
          .order("created_at", { ascending: false })
      : emptyRows<{
          id: string;
          patient_id: string;
          appointment_id: string | null;
          package_purchase_id: string | null;
          amount_paise: number | null;
          error_code: string | null;
          error_reason: string | null;
          error_description: string | null;
          created_at: string;
        }>(),

    supabase.from("treatment_categories").select("id, title").eq("active", true),

    supabase
      .from("treatment_category_packages")
      .select(
        "id, category_id, title, subtitle, image_url, promises, badge_label, session_count, price_paise, compare_at_paise, validity_days, therapist_locked"
      )
      .eq("active", true)
      .eq("visible_in_dashboard", true)
      .order("display_order", { ascending: true }),

    supabase
      .from("patient_package_purchases")
      .select(
        "id, package_id, category_id, purchase_code, session_count, sessions_used, status, locked_therapist_id, expires_at"
      )
      .eq("patient_id", user.id)
      .eq("payment_status", "paid")
      .order("created_at", { ascending: false }),

    // onboarding_seen_at / patient_condition_profiles.status are both
    // new/migration-dependent -- kept isolated so an unknown-column error
    // only hides the welcome modal / health-profile reminder banner, not
    // the whole dashboard.
    supabase.from("profiles").select("onboarding_seen_at").eq("id", user.id).maybeSingle(),
    supabase
      .from("patient_condition_profiles")
      .select("status, data, draft_data")
      .eq("patient_id", user.id)
      .maybeSingle(),
    // Feeds the Overview's notification list. Isolated from the profile
    // read above so a migration-dependent column on either table can only
    // blank its own half.
    needFeed
      ? supabase
          .from("condition_change_requests")
          .select("id, status, admin_notes, created_at")
          .eq("patient_id", user.id)
          .order("created_at", { ascending: false })
          .limit(5)
      : emptyRows<{ id: string; status: string; admin_notes: string | null; created_at: string }>(),

    // The home-visit columns for this patient's own appointments. Isolated
    // from the main appointments select above for the same reason as
    // everywhere else: that select feeds every session card, the calendar
    // and the receipts, so one unknown column there would blank the page.
    supabase
      .from("appointments")
      .select(
        "id, visit_mode, visit_address_line1, visit_address_line2, visit_landmark, visit_city, visit_state, visit_pincode, visit_latitude, visit_longitude, visit_access_notes, travel_fee_paise, home_visit_purchase_id"
      )
      .eq("patient_id", user.id),

    // The Book a Session hub's home-visit group.
    needHub
      ? supabase
          .from("home_visit_packages")
          .select(
            "id, title, subtitle, image_url, benefits, badge_label, highlight, visit_count, price_paise, compare_at_paise, visit_duration_minutes, validity_days, travel_fee_included, therapist_locked"
          )
          .eq("active", true)
          .eq("visible_in_dashboard", true)
          .order("display_order", { ascending: true })
      : emptyRows<HubHomeVisitPackageRow>(),

    // Cash-on-visit purchases legitimately sit at payment_status 'unpaid'
    // for the life of the programme (see home_visit_package_purchases'
    // own schema comment) -- filtering on payment_status alone, the way
    // the online packages query does, would hide every cash programme
    // from the patient's own widget. A purchase counts as "owned" here
    // when it's either a settled prepaid purchase or any cash purchase
    // that made it past checkout.
    supabase
      .from("home_visit_package_purchases")
      .select(
        "id, package_id, purchase_code, visit_count, visits_used, status, locked_therapist_id, expires_at, travel_fee_paise, payment_mode"
      )
      .eq("patient_id", user.id)
      .or("payment_status.eq.paid,payment_mode.eq.cash_on_visit")
      .order("created_at", { ascending: false }),

    // Single online consultations for the hub. activeCategories above is
    // only id+title (it resolves names on existing bookings); the hub needs
    // the price and length it is selling.
    needHub
      ? supabase
          .from("treatment_categories")
          .select("id, title, description, price_paise, duration_minutes, cta_label")
          .eq("active", true)
          .order("display_order", { ascending: true })
          .order("id", { ascending: true })
      : emptyRows<HubCategoryRow>(),
  ]);

  const adminSettings = parseAdminSettings(settingsRow);

  const appointments = mergeMeetLinks(
    mergeSessionCodes(rawAppointments ?? [], sessionCodeLinks),
    meetLinkRows
  );

  // Unpaid bookings won't have amount_paid_paise set yet (that's only
  // recorded once a payment order is created), so fall back to the linked
  // category's price, or the flat base fee if there's no category. Looked
  // up via the admin client (not the active-only public policy) so this
  // always matches what /api/razorpay/create-order will actually charge,
  // even for a category that's since been deactivated. Also covers
  // packages' category ids, so the Receipts section can show a package's
  // category title even after it's been deactivated or renamed.
  const categoryIds = [
    ...new Set(
      [
        ...(appointments ?? []).map((a) => a.category_id),
        ...(allPackagePurchases ?? []).map((p) => p.category_id),
      ].filter(Boolean)
    ),
  ];
  // A patient can read their own appointment rows via RLS, but not the
  // linked therapist's profile (that policy only allows a user to read
  // their own row) — so the assigned therapist's name has to be looked up
  // here via the admin client, same pattern as the therapist dashboard
  // looking up its patients' names.
  const therapistIds = [
    ...new Set(
      [
        ...(appointments ?? []).map((a) => a.therapist_id),
        ...(ownedPackages ?? []).map((p) => p.locked_therapist_id),
        ...(ownedHomeVisitPackages ?? []).map((p) => p.locked_therapist_id),
      ].filter(Boolean)
    ),
  ];
  // Owned packages can reference a package that's since been deactivated
  // or hidden (visible_in_dashboard flipped off) -- availablePackages'
  // active/visible-only policy wouldn't cover that, so this is its own
  // admin-client lookup, same reasoning as categoryPrices below.
  const ownedPackageIds = [
    ...new Set((ownedPackages ?? []).map((p) => p.package_id).filter(Boolean)),
  ];
  const ownedHomeVisitPackageIds = [
    ...new Set((ownedHomeVisitPackages ?? []).map((p) => p.package_id).filter(Boolean)),
  ];
  const [{ data: categoryPrices }, { data: therapists }, { data: ownedPackageInfo }, { data: ownedHomeVisitPackageInfo }] =
    await Promise.all([
      categoryIds.length > 0
        ? admin.from("treatment_categories").select("id, price_paise, title").in("id", categoryIds as string[])
        : Promise.resolve({ data: [] as { id: string; price_paise: number; title: string }[] }),
      therapistIds.length > 0 && needTherapistNames
        ? admin.from("profiles").select("id, full_name").in("id", therapistIds as string[])
        : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
      ownedPackageIds.length > 0 && needPackageDetail
        ? admin
            .from("treatment_category_packages")
            .select("id, title, image_url")
            .in("id", ownedPackageIds as string[])
        : Promise.resolve({ data: [] as { id: string; title: string; image_url: string | null }[] }),
      ownedHomeVisitPackageIds.length > 0 && needPackageDetail
        ? admin
            .from("home_visit_packages")
            .select("id, title, image_url")
            .in("id", ownedHomeVisitPackageIds as string[])
        : Promise.resolve({ data: [] as { id: string; title: string; image_url: string | null }[] }),
    ]);
  const categoryPriceMap = new Map(
    (categoryPrices ?? []).map((c) => [c.id, c.price_paise])
  );
  const categoryTitleMap = new Map((categoryPrices ?? []).map((c) => [c.id, c.title]));
  const therapistMap = new Map((therapists ?? []).map((t) => [t.id, t.full_name]));
  const activeCategoryMap = new Map((activeCategories ?? []).map((c) => [c.id, c.title]));
  const ownedPackageInfoMap = new Map((ownedPackageInfo ?? []).map((p) => [p.id, p]));
  const ownedHomeVisitPackageInfoMap = new Map((ownedHomeVisitPackageInfo ?? []).map((p) => [p.id, p]));
  const purchaseCodeById = new Map((ownedPackages ?? []).map((p) => [p.id, p.purchase_code]));

  // completed/scheduled per purchase, derived from the appointments already
  // loaded above rather than a fresh query -- same counter semantics as
  // package_purchase_summary (schema.sql), just computed in memory since
  // this page already has every one of this patient's appointments.
  const nowMsForPackages = nowTimestamp();
  const completedCountByPurchase = new Map<string, number>();
  const scheduledCountByPurchase = new Map<string, number>();
  for (const a of appointments ?? []) {
    if (!a.package_purchase_id) continue;
    if (a.status === "completed") {
      completedCountByPurchase.set(
        a.package_purchase_id,
        (completedCountByPurchase.get(a.package_purchase_id) ?? 0) + 1
      );
    } else if (
      (a.status === "requested" || a.status === "confirmed") &&
      a.slot_time &&
      new Date(a.slot_time).getTime() > nowMsForPackages
    ) {
      scheduledCountByPurchase.set(
        a.package_purchase_id,
        (scheduledCountByPurchase.get(a.package_purchase_id) ?? 0) + 1
      );
    }
  }

  const hasOwnedPackages = !!ownedPackages && ownedPackages.length > 0;
  const hasAvailablePackages =
    adminSettings.sessionPackagesVisible && !!availablePackages && availablePackages.length > 0;

  const visitDetailById = new Map((visitDetailRows ?? []).map((r) => [r.id, r]));
  const onlineAppointments = appointments.filter(
    (a) => visitDetailById.get(a.id)?.visit_mode !== "home_visit"
  );
  const homeVisitAppointments = appointments.filter(
    (a) => visitDetailById.get(a.id)?.visit_mode === "home_visit"
  );

  // Same completed/scheduled derivation as completedCountByPurchase above,
  // keyed by home_visit_purchase_id instead -- that column lives on
  // visitDetailRows (isolated, migration-dependent), not the main
  // appointments select, so this loop has to wait until visitDetailById
  // exists.
  const completedCountByHomeVisitPurchase = new Map<string, number>();
  const scheduledCountByHomeVisitPurchase = new Map<string, number>();
  for (const a of homeVisitAppointments) {
    const purchaseId = visitDetailById.get(a.id)?.home_visit_purchase_id;
    if (!purchaseId) continue;
    if (a.status === "completed") {
      completedCountByHomeVisitPurchase.set(
        purchaseId,
        (completedCountByHomeVisitPurchase.get(purchaseId) ?? 0) + 1
      );
    } else if (
      (a.status === "requested" || a.status === "confirmed") &&
      a.slot_time &&
      new Date(a.slot_time).getTime() > nowMsForPackages
    ) {
      scheduledCountByHomeVisitPurchase.set(
        purchaseId,
        (scheduledCountByHomeVisitPurchase.get(purchaseId) ?? 0) + 1
      );
    }
  }

  const hasOwnedHomeVisitPackages =
    !!ownedHomeVisitPackages && ownedHomeVisitPackages.length > 0;

  // The reminder banner counts what's actually filled in -- an
  // autosaved draft included -- rather than only saying "not done":
  // "3 of 7 answered" is what makes someone who abandoned the pop-up
  // half-way come back and finish it, and INTAKE_QUESTIONS is the code
  // default here on purpose (the banner is a nudge, not the form, so it
  // doesn't need the admin's per-question wording overrides).
  const intakeAnswers = ((conditionProfile?.draft_data ?? conditionProfile?.data ?? {}) as Record<
    string,
    string
  >) ?? {};
  const intakeAnswered = countAnswered(INTAKE_QUESTIONS, intakeAnswers);

  // ---- Overview -----------------------------------------------------
  // Everything the shared DashboardOverview needs, derived here so the
  // component stays a pure display (same split as the Health Profile's
  // healthProfileSummary).
  const nowMs = nowMsForPackages;
  const upcoming = appointments
    .filter(
      (a) =>
        (a.status === "confirmed" || a.status === "requested") &&
        a.slot_time &&
        new Date(a.slot_time).getTime() > nowMs
    )
    .sort((a, b) => new Date(a.slot_time!).getTime() - new Date(b.slot_time!).getTime());
  const nextSession = upcoming[0] ?? null;
  const completedCount = appointments.filter((a) => a.status === "completed").length;
  const sessionsLeftInPackages = (ownedPackages ?? []).reduce(
    (sum, p) => sum + Math.max(0, (p.session_count ?? 0) - (p.sessions_used ?? 0)),
    0
  );
  const patientFeed = buildPatientFeed({
    appointments: appointments.map((a) => ({
      id: a.id,
      slot_time: a.slot_time,
      status: a.status,
      visit_mode: visitDetailById.get(a.id)?.visit_mode ?? null,
      payment_status: a.payment_status,
      created_at: a.slot_time,
      therapist_name: a.therapist_id ? therapistMap.get(a.therapist_id) ?? null : null,
    })),
    conditionRequests: (conditionRequests ?? []).map((r) => ({
      id: r.id,
      status: r.status,
      created_at: r.created_at,
      admin_notes: r.admin_notes,
    })),
  });

  const overviewCells: StatCell[] = [
    {
      label: "Next session",
      value: nextSession?.slot_time
        ? new Date(nextSession.slot_time).toLocaleDateString(undefined, { day: "numeric", month: "short" })
        : "—",
      note: nextSession?.slot_time
        ? `${new Date(nextSession.slot_time).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}${
            nextSession.therapist_id ? ` · ${therapistMap.get(nextSession.therapist_id) ?? "therapist"}` : ""
          }`
        : "Nothing booked yet",
      accent: "bg-teal-500",
      href: "/patient/dashboard/sessions",
    },
    {
      label: "Sessions done",
      value: String(completedCount),
      unit: completedCount === 1 ? "session" : "sessions",
      note: completedCount === 0 ? "Your history builds up here" : "Completed with your therapist",
      accent: "bg-emerald-500",
      href: "/patient/dashboard/sessions",
    },
    {
      label: "Package sessions left",
      value: String(sessionsLeftInPackages),
      unit: sessionsLeftInPackages === 1 ? "session" : "sessions",
      note: hasOwnedPackages ? "Across the packages you own" : "You don't own a package yet",
      accent: "bg-blue-500",
      href: "/patient/dashboard/packages",
    },
    {
      label: "Health profile",
      value: `${Math.round((intakeAnswered / INTAKE_QUESTIONS.length) * 100)}%`,
      note:
        intakeAnswered === INTAKE_QUESTIONS.length
          ? "Your therapist has your answers"
          : `${INTAKE_QUESTIONS.length - intakeAnswered} question${
              INTAKE_QUESTIONS.length - intakeAnswered === 1 ? "" : "s"
            } left`,
      accent: intakeAnswered === INTAKE_QUESTIONS.length ? "bg-emerald-500" : "bg-amber-500",
      href: "/patient/dashboard/health-profile",
    },
  ];  const navItems = buildPatientNavItems({
    hasOwnedPackages,
    hasAvailablePackages,
    hasOnlineSessions: onlineAppointments.length > 0,
    hasHomeVisits: homeVisitAppointments.length > 0,
    hasOwnedHomeVisitPackages,
  });

  // What the Book a Session hub offers. Both master switches are honoured
  // here rather than inside the hub, so that component stays a pure
  // display of whatever it is handed.
  const hubOnlinePackages = adminSettings.sessionPackagesVisible ? availablePackages ?? [] : [];
  const hubHomeVisitPackages = adminSettings.homeVisitEnabled ? homeVisitPackages ?? [] : [];
  const categoryPriceById = new Map((bookableCategories ?? []).map((c) => [c.id, c.price_paise]));

  return {
    user,
    profile,
    patientCodeRow,
    adminSettings,
    appointments,
    onlineAppointments,
    homeVisitAppointments,
    visitDetailById,
    allPackagePurchases,
    paymentFailures,
    availablePackages,
    ownedPackages,
    ownedHomeVisitPackages,
    homeVisitPackages,
    bookableCategories,
    onboardingRow,
    conditionProfile,
    categoryPriceMap,
    categoryTitleMap,
    therapistMap,
    activeCategoryMap,
    ownedPackageInfoMap,
    ownedHomeVisitPackageInfoMap,
    purchaseCodeById,
    completedCountByPurchase,
    scheduledCountByPurchase,
    completedCountByHomeVisitPurchase,
    scheduledCountByHomeVisitPurchase,
    categoryPriceMapForHub: categoryPriceById,
    hubOnlinePackages,
    hubHomeVisitPackages,
    hasOwnedPackages,
    hasAvailablePackages,
    hasOwnedHomeVisitPackages,
    navItems,
    intakeAnswered,
    nextSession,
    patientFeed,
    overviewCells,
    nowMs: nowMsForPackages,
  };
}

export type PatientDashboardData = Awaited<ReturnType<typeof loadPatientDashboard>>;
