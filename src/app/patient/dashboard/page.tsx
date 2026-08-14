import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import PayNowButton from "@/components/PayNowButton";
import CancelSessionButton from "@/components/CancelSessionButton";
import SessionFeedbackForm from "@/components/SessionFeedbackForm";
import BuyPackageButton from "@/components/BuyPackageButton";
import PatientPackageWidget from "@/components/packages/PatientPackageWidget";
import HomeVisitPackageWidget from "@/components/patient/HomeVisitPackageWidget";
import PackageChip from "@/components/packages/PackageChip";
import ReceiptsSection from "@/components/ReceiptsSection";
import DashboardShell from "@/components/dashboard/DashboardShell";
import OnboardingTour from "@/components/patient/OnboardingTour";
import SessionCalendarTab from "@/components/dashboard/SessionCalendarTab";
import { formatSlotTime } from "@/lib/formatSlotTime";
import { SESSION_FEE_PAISE, CANCELLATION_FULL_REFUND_HOURS } from "@/lib/pricing";
import { buildPatientReceipts } from "@/lib/receipts";
import { buildPatientNavItems } from "@/lib/dashboardNavItems";
import { mergeSessionCodes } from "@/lib/sessionCode";
import { mergeMeetLinks } from "@/lib/meetLink";
import JoinSessionButton from "@/components/JoinSessionButton";
import { BOOKING_FROM_DASHBOARD } from "@/components/BookingBackToSessions";
import { parseAdminSettings, SITE_SETTINGS_SELECT } from "@/lib/adminSettings";
import { computePackageSavings } from "@/lib/packageProgress";
import PatientBookingHub from "@/components/patient/PatientBookingHub";
import {
  formatAddressBlock,
  mapsSearchUrl,
  visitAddressFromAppointment,
} from "@/lib/formatAddress";
import { expireDueHomeVisitPurchases } from "@/lib/expireHomeVisitPurchases";
import { expireDuePackagePurchases } from "@/lib/expirePackagePurchases";
import { JoinWindowProvider } from "@/lib/joinWindowContext";

export const metadata: Metadata = {
  title: "Patient Dashboard | Dr. Pooja's Physio",
};

const STATUS_STYLES: Record<string, string> = {
  requested: "text-amber-700 bg-amber-50",
  confirmed: "text-purple-700 bg-purple-50",
  completed: "text-teal-700 bg-teal-50",
  cancelled: "text-red-700 bg-red-50",
};

// A completed session with no_show=true previously rendered the exact same
// teal "Completed" pill as one that was actually held -- no_show was only
// ever consulted to hide the feedback form, never to change what the
// status badge itself says, so there was no way to tell the two apart from
// the dashboard.
const NO_SHOW_STYLE = "text-orange-700 bg-orange-50";

// A plain module-level helper, not a bare Date.now() inline in the
// component body -- same reasoning as admin/dashboard/page.tsx's
// nowTimestamp(): a Server Component's render must stay pure, so the one
// clock read this page needs (classifying package sessions as
// completed/scheduled) is isolated here instead.
function nowTimestamp() {
  return Date.now();
}

export default async function PatientDashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
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
    supabase
      .from("patient_package_purchases")
      .select("id, category_id, session_count, payment_status, amount_paid_paise, paid_at, razorpay_payment_id")
      .eq("patient_id", user.id)
      .order("created_at", { ascending: false }),

    supabase
      .from("payment_failure_log")
      .select(
        "id, patient_id, appointment_id, package_purchase_id, amount_paise, error_code, error_reason, error_description, created_at"
      )
      .eq("patient_id", user.id)
      .order("created_at", { ascending: false }),

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
    supabase.from("patient_condition_profiles").select("status").eq("patient_id", user.id).maybeSingle(),

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
    supabase
      .from("home_visit_packages")
      .select(
        "id, title, subtitle, image_url, benefits, badge_label, highlight, visit_count, price_paise, compare_at_paise, visit_duration_minutes, validity_days, travel_fee_included, therapist_locked"
      )
      .eq("active", true)
      .eq("visible_in_dashboard", true)
      .order("display_order", { ascending: true }),

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
    supabase
      .from("treatment_categories")
      .select("id, title, description, price_paise, duration_minutes, cta_label")
      .eq("active", true)
      .order("display_order", { ascending: true })
      .order("id", { ascending: true }),
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
      therapistIds.length > 0
        ? admin.from("profiles").select("id, full_name").in("id", therapistIds as string[])
        : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
      ownedPackageIds.length > 0
        ? admin
            .from("treatment_category_packages")
            .select("id, title, image_url")
            .in("id", ownedPackageIds as string[])
        : Promise.resolve({ data: [] as { id: string; title: string; image_url: string | null }[] }),
      ownedHomeVisitPackageIds.length > 0
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

  const navItems = buildPatientNavItems({
    hasOwnedPackages,
    hasAvailablePackages,
    hasOnlineSessions: onlineAppointments.length > 0,
    hasHomeVisits: homeVisitAppointments.length > 0,
    hasOwnedHomeVisitPackages,
  });

  // What the Book a Session hub offers. Both master switches are honoured
  // here rather than inside the hub, so that component stays a pure display
  // of whatever it is handed -- same split as SessionPackages on the public
  // pages.
  const hubOnlinePackages = adminSettings.sessionPackagesVisible ? availablePackages ?? [] : [];
  const hubHomeVisitPackages = adminSettings.homeVisitEnabled ? homeVisitPackages ?? [] : [];
  const categoryPriceById = new Map(
    (bookableCategories ?? []).map((c) => [c.id, c.price_paise])
  );

  // Shared between "Your Sessions" and the Calendar tab's tap-a-date detail
  // list, so both ever show one true card style for a session rather than
  // two copies that can quietly drift apart.
  type VisitDetail = NonNullable<typeof visitDetailRows>[number];

  function renderAppointmentCard(
    a: (typeof appointments)[number],
    visit: VisitDetail | null = null
  ) {
    const visitAddress = visit ? visitAddressFromAppointment(visit) : null;
    const addressLines = visitAddress ? formatAddressBlock(visitAddress) : [];
    const mapsUrl = visitAddress ? mapsSearchUrl(visitAddress) : null;
    return (
      <div className="p-4 rounded-xl border border-slate-200 text-xs space-y-3">
        {visit?.visit_mode === "home_visit" && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-teal-700">
            <i className="fa-solid fa-house-medical" /> Home visit
          </span>
        )}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <p className="font-bold text-sm text-slate-900">
              {a.concern ?? "General Consultation"}
              {a.session_code && (
                <span className="ml-2 font-mono font-normal text-[11px] text-slate-400">
                  {a.session_code}
                </span>
              )}
            </p>
            <p className="text-sm text-slate-500 mt-1">
              {formatSlotTime(a.slot_time, a.timezone)}
              {a.duration_minutes && ` • ${a.duration_minutes} min`}
            </p>
            <p className="text-sm text-slate-500 mt-1">
              Therapist:{" "}
              <span className="text-slate-700">
                {a.therapist_id
                  ? therapistMap.get(a.therapist_id) ?? "Unknown"
                  : "Not yet assigned"}
              </span>
            </p>
            {a.package_purchase_id && (
              <PackageChip purchaseId={a.package_purchase_id} label={purchaseCodeById.get(a.package_purchase_id)} />
            )}
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`capitalize font-semibold px-3 py-1 rounded-full ${
                a.no_show ? NO_SHOW_STYLE : STATUS_STYLES[a.status] ?? "text-slate-600 bg-slate-100"
              }`}
            >
              {a.no_show ? "No-Show" : a.status}
            </span>
            {a.status === "cancelled" ? (
              a.refund_status === "processed" ? (
                <span className="font-semibold text-slate-600 bg-slate-100 px-3 py-1 rounded-full">
                  Refunded
                </span>
              ) : a.refund_status === "not_eligible" ? (
                <span
                  className="font-semibold text-slate-500 bg-slate-100 px-3 py-1 rounded-full"
                  title={
                    a.therapist_payout_paid_at
                      ? "No refund — this session's payout was already settled (cancelled as an admin correction, not a late cancellation)"
                      : `No refund — cancelled within ${CANCELLATION_FULL_REFUND_HOURS} hours of the slot`
                  }
                >
                  No Refund
                </span>
              ) : (
                // refund_status === "failed" -- the refund attempt itself errored out
                // (see cancelAppointment.ts) and money is still owed. This used to fall
                // through to nothing, leaving a stuck refund visually identical to a
                // cancellation that never needed one -- the only place it was ever
                // surfaced was a one-time toast at the moment of cancellation, gone on
                // the very next page load.
                a.refund_status === "failed" && (
                  <span className="font-semibold text-red-700 bg-red-50 px-3 py-1 rounded-full">
                    Refund Failed — Contact Us
                  </span>
                )
              )
            ) : a.payment_status === "unpaid" ? (
              <PayNowButton
                appointmentId={a.id}
                name={profile?.full_name ?? ""}
                email={profile?.email ?? ""}
                description={a.concern ?? "Virtual Physical Therapy Session"}
                amountPaise={
                  a.amount_paid_paise ??
                  (a.category_id ? categoryPriceMap.get(a.category_id) : undefined) ??
                  SESSION_FEE_PAISE
                }
              />
            ) : (
              <span className="font-semibold text-green-700 bg-green-50 px-3 py-1 rounded-full">
                Paid
              </span>
            )}
          </div>
        </div>

        {addressLines.length > 0 && (
          <div className="rounded-lg bg-slate-50 p-3 space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              Your therapist is coming to
            </p>
            {addressLines.map((line) => (
              <p key={line} className="text-slate-700">
                {line}
              </p>
            ))}
            {visit?.visit_access_notes && (
              <p className="pt-1 text-slate-600">
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
                <i className="fa-solid fa-location-dot" /> View on map
              </a>
            )}
            {visit?.travel_fee_paise !== null && (visit?.travel_fee_paise ?? 0) > 0 && (
              <p className="pt-1 text-[11px] text-slate-400">
                Includes ₹{((visit?.travel_fee_paise ?? 0) / 100).toLocaleString("en-IN")} travel
              </p>
            )}
          </div>
        )}

        <div className="flex items-center gap-2 flex-wrap">
          {/* A home visit has no Meet link to join -- the therapist is
              travelling to the address above. */}
          {visit?.visit_mode !== "home_visit" && (
            <JoinSessionButton
              meetLink={a.meet_link}
              slotTime={a.slot_time}
              status={a.status}
              durationMinutes={a.duration_minutes}
            />
          )}
          {(a.status === "requested" || a.status === "confirmed") && (
            <CancelSessionButton
              appointmentId={a.id}
              paid={a.payment_status === "paid"}
              slotTime={a.slot_time}
              refundWindowHours={
                visit?.visit_mode === "home_visit"
                  ? adminSettings.homeVisitCancellationRefundHours
                  : undefined
              }
            />
          )}
        </div>
        {a.status === "completed" && !a.no_show && (
          <SessionFeedbackForm
            appointmentId={a.id}
            role="patient"
            existingRating={a.patient_rating}
            existingFeedback={a.patient_feedback}
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
      brandLabel="Patient Panel"
      brandIcon="fa-user-injured"
      basePath="/patient/dashboard"
      navItems={navItems}
      userName={profile?.full_name ?? "Patient"}
      userEmail={profile?.email ?? user.email ?? ""}
      userAvatarUrl={profile?.avatar_url ?? null}
      userCode={patientCodeRow?.patient_code ?? null}
      offsetTop={showDebugNav}
      sessionTimeoutMinutes={adminSettings.sessionTimeoutMinutes}
      realtimeTables={[
        "appointments",
        "profile_change_requests",
        "profiles",
        "site_settings",
        "patient_package_purchases",
        "payment_failure_log",
        "treatment_categories",
        "treatment_category_packages",
        "patient_condition_profiles",
      ]}
      headerTitle={`Welcome back, ${profile?.full_name ?? "there"}`}
      headerSubtitle="Your virtual physical therapy dashboard"
    >
      {!onboardingRow?.onboarding_seen_at && <OnboardingTour />}

      {(!conditionProfile || conditionProfile.status === "not_started" || conditionProfile.status === "draft") && (
        <Link
          href="/patient/dashboard/health-profile"
          className="mb-6 flex items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 transition hover:bg-amber-100"
        >
          <span className="text-sm font-semibold text-amber-800">
            Complete your health profile so your therapist knows your condition before your first session.
          </span>
          <span className="shrink-0 text-xs font-bold text-amber-700">Fill it in →</span>
        </Link>
      )}

      {/* Always visible, unlike the history sections below. A patient who
          has only ever had video calls must still be able to find home
          visits -- hiding a product until someone has already used it is
          how they never discover it. */}
      <div id="book" className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h2 className="font-bold text-lg text-slate-800 mb-1">Book a Session</h2>
        <p className="text-xs text-slate-500 mb-5">
          Everything you can book, in one place.
        </p>
        <PatientBookingHub
          categories={bookableCategories ?? []}
          onlinePackages={hubOnlinePackages}
          homeVisitPackages={hubHomeVisitPackages}
          categoryPriceById={categoryPriceById}
        />
      </div>

      {onlineAppointments.length > 0 && (
        <div id="sessions" className="mt-8 bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-lg text-slate-800">Your Sessions</h2>
            {/* ?from=dashboard so Back off the booking page returns here, to
                Your Sessions -- see BookingBackToSessions. */}
            <Link
              href={BOOKING_FROM_DASHBOARD}
              className="bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold px-4 py-2 rounded-xl transition"
            >
              Book New Session
            </Link>
          </div>

          <ul className="space-y-3">
            {onlineAppointments.map((a) => (
              <li key={a.id}>{renderAppointmentCard(a)}</li>
            ))}
          </ul>
        </div>
      )}

      {homeVisitAppointments.length > 0 && (
        <div
          id="home-visits"
          className="mt-8 bg-white rounded-2xl border border-slate-200 shadow-sm p-6"
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-lg text-slate-800">Your Home Visits</h2>
            <Link
              href="/book-home-visit"
              className="bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold px-4 py-2 rounded-xl transition"
            >
              Book a Home Visit
            </Link>
          </div>

          <ul className="space-y-3">
            {homeVisitAppointments.map((a) => (
              <li key={a.id}>{renderAppointmentCard(a, visitDetailById.get(a.id) ?? null)}</li>
            ))}
          </ul>
        </div>
      )}

      <div id="calendar" className="mt-8">
        {/* Both kinds share one calendar -- a patient's week is one week,
            whether a slot is a call or someone coming round. */}
        <SessionCalendarTab
          sessions={appointments}
          cardsById={Object.fromEntries(
            appointments.map((a) => [
              a.id,
              renderAppointmentCard(a, visitDetailById.get(a.id) ?? null),
            ])
          )}
          showMotivation
        />
      </div>

      {ownedPackages && ownedPackages.length > 0 && (
        <div id="your-packages" className="mt-8">
          <PatientPackageWidget
            bulkScheduleMax={adminSettings.packageBulkScheduleMax}
            expiryReminderDays={adminSettings.packageExpiryReminderDays}
            purchases={ownedPackages.map((p) => ({
              id: p.id,
              purchaseCode: p.purchase_code,
              title: ownedPackageInfoMap.get(p.package_id)?.title ?? activeCategoryMap.get(p.category_id) ?? "Session Package",
              imageUrl: ownedPackageInfoMap.get(p.package_id)?.image_url ?? null,
              sessionCount: p.session_count,
              sessionsUsed: p.sessions_used,
              completedCount: completedCountByPurchase.get(p.id) ?? 0,
              scheduledCount: scheduledCountByPurchase.get(p.id) ?? 0,
              status: p.status,
              expiresAt: p.expires_at,
              therapistName: p.locked_therapist_id ? therapistMap.get(p.locked_therapist_id) ?? null : null,
            }))}
          />
        </div>
      )}

      {ownedHomeVisitPackages && ownedHomeVisitPackages.length > 0 && (
        <div id="your-home-visit-packages" className="mt-8">
          <HomeVisitPackageWidget
            bulkScheduleMax={adminSettings.homeVisitBulkScheduleMax}
            expiryReminderDays={adminSettings.packageExpiryReminderDays}
            leadTimeHours={adminSettings.homeVisitLeadTimeHours}
            purchases={ownedHomeVisitPackages.map((p) => ({
              id: p.id,
              purchaseCode: p.purchase_code,
              title: ownedHomeVisitPackageInfoMap.get(p.package_id)?.title ?? "Home Visit Package",
              imageUrl: ownedHomeVisitPackageInfoMap.get(p.package_id)?.image_url ?? null,
              visitCount: p.visit_count,
              visitsUsed: p.visits_used,
              completedCount: completedCountByHomeVisitPurchase.get(p.id) ?? 0,
              scheduledCount: scheduledCountByHomeVisitPurchase.get(p.id) ?? 0,
              status: p.status,
              expiresAt: p.expires_at,
              therapistName: p.locked_therapist_id ? therapistMap.get(p.locked_therapist_id) ?? null : null,
              paymentMode: p.payment_mode,
            }))}
          />
        </div>
      )}

      {adminSettings.sessionPackagesVisible && availablePackages && availablePackages.length > 0 && (
        <div id="session-packages" className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mt-8">
          <h2 className="font-bold text-lg text-slate-800 mb-1">Session Packages</h2>
          <p className="text-xs text-slate-500 mb-4">
            Buy a bundle of sessions upfront and use them one at a time,
            whenever you&apos;re ready to book.
          </p>
          <ul className="space-y-3">
            {availablePackages.map((pkg) => {
              const savings = computePackageSavings({
                sessionCount: pkg.session_count,
                pricePaise: pkg.price_paise,
                compareAtPaise: pkg.compare_at_paise,
                categoryPricePaise: categoryPriceMap.get(pkg.category_id) ?? null,
              });
              return (
                <li
                  key={pkg.id}
                  className="p-4 rounded-xl border border-slate-200 text-xs flex items-center justify-between gap-3 flex-wrap"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {pkg.image_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={pkg.image_url} alt="" className="h-12 w-12 rounded-lg object-cover shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="font-bold text-slate-900">{pkg.title}</p>
                      <p className="text-slate-500 mt-1">
                        {activeCategoryMap.get(pkg.category_id) ?? "General Consultation"} •{" "}
                        {pkg.session_count} sessions • ₹{(savings.perSessionPaise / 100).toFixed(0)}/session
                        {savings.savingsPercent !== null && (
                          <span className="text-teal-700 font-semibold"> · Save {savings.savingsPercent}%</span>
                        )}
                      </p>
                    </div>
                  </div>
                  <BuyPackageButton
                    packageId={pkg.id}
                    name={profile?.full_name ?? ""}
                    email={profile?.email ?? ""}
                    description={pkg.title}
                    priceInPaise={pkg.price_paise}
                  />
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div id="receipts">
        <ReceiptsSection
          receipts={buildPatientReceipts(
            appointments ?? [],
            allPackagePurchases ?? [],
            paymentFailures ?? [],
            categoryTitleMap
          )}
          sessionCodeByAppointmentId={Object.fromEntries(
            appointments.map((a) => [a.id, a.session_code])
          )}
        />
      </div>
    </DashboardShell>
    </JoinWindowProvider>
  );
}
