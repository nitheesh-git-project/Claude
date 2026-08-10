import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import SubmitReferralForm from "@/components/hospital/SubmitReferralForm";
import WithdrawReferralButton from "@/components/hospital/WithdrawReferralButton";
import DashboardShell, { type ShellNavItem } from "@/components/dashboard/DashboardShell";
import { formatSlotTime } from "@/lib/formatSlotTime";
import { formatReferralStatus } from "@/lib/referralStatus";
import { SESSION_FEE_PAISE } from "@/lib/pricing";
import { mergeSessionCodes } from "@/lib/sessionCode";
import { mergeMeetLinks } from "@/lib/meetLink";
import JoinSessionButton from "@/components/JoinSessionButton";
import { parseAdminSettings, SITE_SETTINGS_SELECT } from "@/lib/adminSettings";
import { JoinWindowProvider } from "@/lib/joinWindowContext";

export const metadata: Metadata = {
  title: "Partner Dashboard | Dr. Pooja's Physio",
};

const STATUS_STYLES: Record<string, string> = {
  requested: "text-amber-700 bg-amber-50",
  confirmed: "text-purple-700 bg-purple-50",
  completed: "text-teal-700 bg-teal-50",
  cancelled: "text-red-700 bg-red-50",
};

export default async function HospitalDashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  // Revenue transparency: which sessions (across both referral channels)
  // are attributed to this hospital and paid. RLS wouldn't normally let a
  // hospital see other people's appointments, so this uses the
  // service-role client — but strictly scoped to rows referencing this
  // hospital's own id, never anything broader.
  const admin = createAdminClient();

  // All of these are independent of each other -- run in parallel instead
  // of one at a time, since router.refresh() re-runs this whole page on
  // every referral submit/withdraw. See admin/dashboard/page.tsx's
  // identical Promise.all for the reasoning. rawReferredSessions/
  // sessionCodeLinks/meetLinkRows further below stay sequential -- they
  // genuinely need referredPatientIds to resolve first.
  const [
    { data: profile },
    { data: settingsRow },
    { data: hospitalCodeRow },
    { data: referrals },
    { data: capacityNoteRows },
    { data: referredPatients },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, organization_name, referral_code, revenue_share_percent, avatar_url")
      .eq("id", user.id)
      .single(),

    // These site_settings columns are new/migration-dependent -- isolated
    // so a missing migration only disables Feature Control's effects, not
    // the whole page.
    supabase
      .from("site_settings")
      .select(SITE_SETTINGS_SELECT)
      .maybeSingle(),

    // hospital_code is new/migration-dependent -- kept isolated (see
    // sessionCode.ts's comment / this codebase's established convention) so
    // an unknown-column error here only degrades this one badge, not the
    // whole dashboard.
    supabase.from("profiles").select("hospital_code").eq("id", user.id).maybeSingle(),

    supabase
      .from("patient_referrals")
      .select("id, patient_name, medical_issue, status, assigned_slot_time, created_at")
      .eq("hospital_id", user.id)
      .order("created_at", { ascending: false }),

    // capacity_note is new/migration-dependent -- kept isolated (same
    // convention used throughout this codebase) so a missing migration only
    // blanks this one note, not the whole referrals list.
    supabase.from("patient_referrals").select("id, capacity_note").eq("hospital_id", user.id),

    admin.from("profiles").select("id, full_name, email").eq("referred_by_hospital_id", user.id),
  ]);

  const adminSettings = parseAdminSettings(settingsRow);
  const capacityNoteMap = new Map(
    (capacityNoteRows ?? []).map((r) => [r.id, r.capacity_note])
  );
  const referredPatientIds = (referredPatients ?? []).map((p) => p.id);

  const [{ data: rawReferredSessions }, { data: sessionCodeLinks }, { data: meetLinkRows }] =
    referredPatientIds.length > 0
      ? await Promise.all([
          admin
            .from("appointments")
            .select(
              "id, concern, slot_time, timezone, status, payment_status, amount_paid_paise, patient_id, therapist_id, created_at"
            )
            .in("patient_id", referredPatientIds)
            .order("created_at", { ascending: false }),
          // session_code is also new/migration-dependent -- same isolation
          // reasoning as hospitalCodeRow above.
          admin.from("appointments").select("id, session_code").in("patient_id", referredPatientIds),
          // meet_link is also new/migration-dependent -- same isolation
          // reasoning as sessionCodeLinks above.
          admin.from("appointments").select("id, meet_link").in("patient_id", referredPatientIds),
        ])
      : [
          { data: [] as never[] },
          { data: [] as { id: string; session_code: string | null }[] },
          { data: [] as { id: string; meet_link: string | null }[] },
        ];

  const referredSessions = mergeMeetLinks(
    mergeSessionCodes(rawReferredSessions ?? [], sessionCodeLinks),
    meetLinkRows
  );

  const patientMap = new Map((referredPatients ?? []).map((p) => [p.id, p]));
  const paidSessions = (referredSessions ?? []).filter(
    (s) => s.payment_status === "paid"
  );
  // Sums what was actually charged per session rather than recalculating
  // against the current session fee, so this stays correct even if pricing
  // changes later.
  const totalRevenue = paidSessions.reduce(
    (sum, s) => sum + (s.amount_paid_paise ?? SESSION_FEE_PAISE) / 100,
    0
  );
  const sharePercent = profile?.revenue_share_percent ?? 0;
  const hospitalCut = (totalRevenue * sharePercent) / 100;
  const companyCut = totalRevenue - hospitalCut;

  const navItems: ShellNavItem[] = [
    { id: "refer", label: "Refer a Patient", icon: "fa-user-plus" },
    { id: "referrals", label: "Your Referrals", icon: "fa-list-check" },
    { id: "revenue", label: "Revenue & Payouts", icon: "fa-chart-line" },
    { id: "profile", label: "Account Security", icon: "fa-lock", href: "/hospital/dashboard/profile" },
  ];

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
      brandLabel="Partner Panel"
      brandIcon="fa-hospital"
      basePath="/hospital/dashboard"
      navItems={navItems}
      userName={profile?.full_name ?? "Partner"}
      userEmail={user.email ?? ""}
      userAvatarUrl={profile?.avatar_url ?? null}
      userCode={hospitalCodeRow?.hospital_code ?? null}
      offsetTop={showDebugNav}
      sessionTimeoutMinutes={adminSettings.sessionTimeoutMinutes}
      realtimeTables={["patient_referrals"]}
      headerTitle={`${profile?.organization_name ?? "Partner"} Dashboard`}
      headerSubtitle={`Welcome, ${profile?.full_name}`}
    >
      <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 mb-8 text-xs text-blue-900 flex items-center justify-between flex-wrap gap-2">
        <span>
          Your referral code — share it with patients who book directly:
        </span>
        <span className="font-mono font-bold text-sm bg-white border border-blue-200 px-3 py-1 rounded-lg">
          {profile?.referral_code}
        </span>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div id="refer" className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <h2 className="font-bold text-lg text-slate-800 mb-4">
            Refer a Patient
          </h2>
          <SubmitReferralForm hospitalId={user.id} />
        </div>

        <div id="referrals" className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <h2 className="font-bold text-lg text-slate-800 mb-4">
            Your Referrals
          </h2>
          {!referrals || referrals.length === 0 ? (
            <p className="text-xs text-slate-500 py-4 text-center">
              You haven&apos;t submitted any referrals yet.
            </p>
          ) : (
            <ul className="space-y-3">
              {referrals.map((r) => (
                <li
                  key={r.id}
                  className="p-4 rounded-xl border border-slate-200 text-xs space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <p className="font-bold text-slate-900">
                      {r.patient_name}
                    </p>
                    <span className="font-semibold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-full">
                      {formatReferralStatus(r.status)}
                    </span>
                  </div>
                  <p className="text-slate-500">{r.medical_issue}</p>
                  {r.assigned_slot_time && (
                    <p className="text-slate-500">
                      Slot: {formatSlotTime(r.assigned_slot_time, "Asia/Kolkata")}
                    </p>
                  )}
                  {r.status === "pending_review" && capacityNoteMap.get(r.id) && (
                    <p className="text-amber-700 bg-amber-50 rounded-lg px-2.5 py-1.5">
                      {capacityNoteMap.get(r.id)}
                    </p>
                  )}
                  {(r.status === "pending_review" || r.status === "therapist_assigned") && (
                    <div className="pt-1">
                      <WithdrawReferralButton referralId={r.id} />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div id="revenue" className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mt-6">
        <h2 className="font-bold text-lg text-slate-800 mb-4">
          Revenue & Payouts
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <div className="bg-slate-50 rounded-xl p-3 text-center">
            <p className="text-[11px] text-slate-500">Revenue Share</p>
            <p className="text-lg font-bold text-slate-900">{sharePercent}%</p>
          </div>
          <div className="bg-slate-50 rounded-xl p-3 text-center">
            <p className="text-[11px] text-slate-500">Paid Sessions</p>
            <p className="text-lg font-bold text-slate-900">
              {paidSessions.length}
            </p>
          </div>
          <div className="bg-teal-50 rounded-xl p-3 text-center">
            <p className="text-[11px] text-slate-500">Your Cut</p>
            <p className="text-lg font-bold text-teal-700">
              ₹{hospitalCut.toFixed(2)}
            </p>
          </div>
          <div className="bg-slate-50 rounded-xl p-3 text-center">
            <p className="text-[11px] text-slate-500">Company&apos;s Cut</p>
            <p className="text-lg font-bold text-slate-900">
              ₹{companyCut.toFixed(2)}
            </p>
          </div>
        </div>

        {!referredSessions || referredSessions.length === 0 ? (
          <p className="text-xs text-slate-500 py-4 text-center">
            No sessions from your referred patients yet.
          </p>
        ) : (
          <ul className="space-y-2 text-xs">
            {referredSessions.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between flex-wrap gap-2 p-3 rounded-xl border border-slate-200"
              >
                <div>
                  <p className="font-bold text-slate-900">
                    {patientMap.get(s.patient_id)?.full_name ?? "Patient"}
                  </p>
                  <p className="text-slate-500">
                    {s.concern} — {formatSlotTime(s.slot_time, s.timezone)}
                    {s.session_code && (
                      <span className="ml-2 font-mono text-slate-400">{s.session_code}</span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`capitalize font-semibold px-3 py-1 rounded-full ${
                      STATUS_STYLES[s.status] ?? "text-slate-600 bg-slate-100"
                    }`}
                  >
                    {s.status}
                  </span>
                  <span
                    className={`font-semibold px-3 py-1 rounded-full ${
                      s.payment_status === "paid"
                        ? "text-green-700 bg-green-50"
                        : "text-slate-500 bg-slate-100"
                    }`}
                  >
                    {s.payment_status}
                  </span>
                  <JoinSessionButton
                    meetLink={s.meet_link}
                    slotTime={s.slot_time}
                    status={s.status}
                    durationMinutes={null}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </DashboardShell>
    </JoinWindowProvider>
  );
}
