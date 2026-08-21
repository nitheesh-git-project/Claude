import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseAdminSettings, SITE_SETTINGS_SELECT } from "@/lib/adminSettings";
import { mergeSessionCodes } from "@/lib/sessionCode";
import { mergeMeetLinks } from "@/lib/meetLink";
import { buildHospitalFeed } from "@/lib/dashboardFeed";
import { SESSION_FEE_PAISE } from "@/lib/pricing";
import type { ShellNavItem } from "@/components/dashboard/DashboardShell";
import type { StatCell } from "@/components/dashboard/StatStrip";

// Everything the hospital (B2B) dashboard's screens read, loaded once per
// request -- same split as the patient and therapist loaders, for the same
// reason: Refer, Your Referrals and Revenue are separate routes now, not
// anchors on one scroll.
//
// Server-only: it holds admin-client reads (the referred patients'
// sessions, which RLS would not otherwise show a hospital).

export async function loadHospitalDashboard() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("No signed-in hospital");
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
      .select("id, patient_name, medical_issue, status, assigned_slot_time, created_at, visit_mode, pincode")
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

  // ---- Overview -----------------------------------------------------
  const referralRows = referrals ?? [];
  const pendingReferrals = referralRows.filter((r) => r.status === "pending").length;
  const acceptedReferrals = referralRows.filter((r) => r.status === "accepted").length;
  const hospitalFeed = buildHospitalFeed({
    referrals: referralRows.map((r) => ({
      id: r.id,
      status: r.status,
      created_at: r.created_at,
      patient_name: r.patient_name,
    })),
  });

  const overviewCells: StatCell[] = [
    {
      label: "Referrals sent",
      value: String(referralRows.length),
      note: pendingReferrals > 0 ? `${pendingReferrals} still with the clinic` : "All of them have been actioned",
      accent: "bg-teal-500",
      href: "#referrals",
    },
    {
      label: "Accepted",
      value: String(acceptedReferrals),
      note: referralRows.length === 0 ? "Send your first referral" : "Patients the clinic took on",
      accent: "bg-emerald-500",
      href: "#referrals",
    },
    {
      label: "Sessions delivered",
      value: String(paidSessions.length),
      note: "Paid sessions by patients you referred",
      accent: "bg-blue-500",
      href: "#revenue",
    },
    {
      label: "Your share",
      value: `₹${hospitalCut.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`,
      note: `${sharePercent}% of ₹${totalRevenue.toLocaleString("en-IN", { maximumFractionDigits: 0 })} collected`,
      accent: "bg-emerald-500",
      href: "#revenue",
    },
  ];

  // Real pages, not anchors -- see buildPatientNavItems for why.
  const navItems: ShellNavItem[] = [
    { id: "overview", label: "Overview", icon: "fa-gauge-high", href: "/hospital/dashboard" },
    { id: "refer", label: "Refer a Patient", icon: "fa-user-plus", href: "/hospital/dashboard/refer" },
    {
      id: "referrals",
      label: "Your Referrals",
      icon: "fa-list-check",
      href: "/hospital/dashboard/referrals",
    },
    {
      id: "revenue",
      label: "Revenue & Payouts",
      icon: "fa-chart-line",
      href: "/hospital/dashboard/revenue",
    },
    { id: "profile", label: "Account Security", icon: "fa-lock", href: "/hospital/dashboard/profile" },
  ];

  return {
    user,
    profile,
    hospitalCodeRow,
    adminSettings,
    referrals: referralRows,
    capacityNoteMap,
    referredSessions,
    patientMap,
    paidSessions,
    totalRevenue,
    hospitalCut,
    companyCut,
    sharePercent,
    pendingReferrals,
    acceptedReferrals,
    hospitalFeed,
    overviewCells,
    navItems,
  };
}

export type HospitalDashboardData = Awaited<ReturnType<typeof loadHospitalDashboard>>;
