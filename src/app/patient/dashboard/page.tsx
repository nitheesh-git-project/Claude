import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import PayNowButton from "@/components/PayNowButton";
import CancelSessionButton from "@/components/CancelSessionButton";
import SessionFeedbackForm from "@/components/SessionFeedbackForm";
import BuyPackageButton from "@/components/BuyPackageButton";
import BookWithPackageForm from "@/components/BookWithPackageForm";
import ReceiptsSection from "@/components/ReceiptsSection";
import DashboardShell from "@/components/dashboard/DashboardShell";
import SessionCalendarTab from "@/components/dashboard/SessionCalendarTab";
import { formatSlotTime } from "@/lib/formatSlotTime";
import { SESSION_FEE_PAISE, CANCELLATION_FULL_REFUND_HOURS } from "@/lib/pricing";
import { buildPatientReceipts } from "@/lib/receipts";
import { buildPatientNavItems } from "@/lib/dashboardNavItems";
import { mergeSessionCodes } from "@/lib/sessionCode";
import { mergeMeetLinks } from "@/lib/meetLink";
import JoinSessionButton from "@/components/JoinSessionButton";
import { BOOKING_FROM_DASHBOARD } from "@/components/BookingBackToSessions";
import { parseAdminSettings } from "@/lib/adminSettings";
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

export default async function PatientDashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

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
  ] = await Promise.all([
    supabase.from("profiles").select("full_name, email, avatar_url").eq("id", user.id).single(),

    // These site_settings columns are new/migration-dependent -- isolated
    // so a missing migration only disables Feature Control's effects, not
    // the whole page.
    supabase
      .from("site_settings")
      .select("session_packages_visible, session_timeout_minutes, google_meet_enabled, join_window_minutes, join_window_after_minutes")
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
      .select("id, category_id, title, session_count, price_paise")
      .eq("active", true)
      .order("display_order", { ascending: true }),

    supabase
      .from("patient_package_purchases")
      .select("id, category_id, session_count, sessions_used")
      .eq("patient_id", user.id)
      .eq("payment_status", "paid")
      .order("created_at", { ascending: false }),
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
    ...new Set((appointments ?? []).map((a) => a.therapist_id).filter(Boolean)),
  ];
  const admin = createAdminClient();
  const [{ data: categoryPrices }, { data: therapists }] = await Promise.all([
    categoryIds.length > 0
      ? admin.from("treatment_categories").select("id, price_paise, title").in("id", categoryIds as string[])
      : Promise.resolve({ data: [] as { id: string; price_paise: number; title: string }[] }),
    therapistIds.length > 0
      ? admin.from("profiles").select("id, full_name").in("id", therapistIds as string[])
      : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
  ]);
  const categoryPriceMap = new Map(
    (categoryPrices ?? []).map((c) => [c.id, c.price_paise])
  );
  const categoryTitleMap = new Map((categoryPrices ?? []).map((c) => [c.id, c.title]));
  const therapistMap = new Map((therapists ?? []).map((t) => [t.id, t.full_name]));
  const activeCategoryMap = new Map((activeCategories ?? []).map((c) => [c.id, c.title]));

  const hasOwnedPackages = !!ownedPackages && ownedPackages.length > 0;
  const hasAvailablePackages =
    adminSettings.sessionPackagesVisible && !!availablePackages && availablePackages.length > 0;

  const navItems = buildPatientNavItems({ hasOwnedPackages, hasAvailablePackages });

  // Shared between "Your Sessions" and the Calendar tab's tap-a-date detail
  // list, so both ever show one true card style for a session rather than
  // two copies that can quietly drift apart.
  function renderAppointmentCard(a: (typeof appointments)[number]) {
    return (
      <div className="p-4 rounded-xl border border-slate-200 text-xs space-y-3">
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
              <p className="text-teal-700 mt-1">Paid via package</p>
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
        <div className="flex items-center gap-2 flex-wrap">
          <JoinSessionButton
            meetLink={a.meet_link}
            slotTime={a.slot_time}
            status={a.status}
            durationMinutes={a.duration_minutes}
          />
          {(a.status === "requested" || a.status === "confirmed") && (
            <CancelSessionButton
              appointmentId={a.id}
              paid={a.payment_status === "paid"}
              slotTime={a.slot_time}
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
      realtimeTables={["appointments", "profile_change_requests"]}
      headerTitle={`Welcome back, ${profile?.full_name ?? "there"}`}
      headerSubtitle="Your virtual physical therapy dashboard"
    >
      <div id="sessions" className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
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

        {!appointments || appointments.length === 0 ? (
          <p className="text-xs text-slate-500 py-8 text-center">
            You don&apos;t have any sessions yet. Book your first consultation
            to get started.
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
          showMotivation
        />
      </div>

      {ownedPackages && ownedPackages.length > 0 && (
        <div id="your-packages" className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mt-8">
          <h2 className="font-bold text-lg text-slate-800 mb-4">Your Packages</h2>
          <ul className="space-y-3">
            {ownedPackages.map((p) => {
              const remaining = p.session_count - p.sessions_used;
              return (
                <li
                  key={p.id}
                  className="p-4 rounded-xl border border-slate-200 text-xs"
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div>
                      <p className="font-bold text-slate-900">
                        {activeCategoryMap.get(p.category_id) ?? "General Consultation"}
                      </p>
                      <p className="text-slate-500 mt-1">
                        {remaining} of {p.session_count} sessions remaining
                      </p>
                    </div>
                    {remaining > 0 && <BookWithPackageForm packagePurchaseId={p.id} />}
                  </div>
                </li>
              );
            })}
          </ul>
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
            {availablePackages.map((pkg) => (
              <li
                key={pkg.id}
                className="p-4 rounded-xl border border-slate-200 text-xs flex items-center justify-between gap-2 flex-wrap"
              >
                <div>
                  <p className="font-bold text-slate-900">{pkg.title}</p>
                  <p className="text-slate-500 mt-1">
                    {activeCategoryMap.get(pkg.category_id) ?? "General Consultation"} •{" "}
                    {pkg.session_count} sessions • ₹
                    {(pkg.price_paise / pkg.session_count / 100).toFixed(0)}/session
                  </p>
                </div>
                <BuyPackageButton
                  packageId={pkg.id}
                  name={profile?.full_name ?? ""}
                  email={profile?.email ?? ""}
                  description={pkg.title}
                  priceInPaise={pkg.price_paise}
                />
              </li>
            ))}
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
