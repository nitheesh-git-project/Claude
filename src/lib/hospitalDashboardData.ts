import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseAdminSettings, SITE_SETTINGS_SELECT } from "@/lib/adminSettings";
import { mergeSessionCodes } from "@/lib/sessionCode";
import { readAllRows, readAllRowsAsData, readAllRowsByIds } from "@/lib/supabase/readAllRows";
import { hospitalSessionLine } from "@/lib/hospitalEarnings";
import { buildHospitalFeed } from "@/lib/dashboardFeed";
import { HOSPITAL_NAV_ITEMS } from "@/lib/dashboardNavItems";
import type { StatCell } from "@/components/dashboard/StatStrip";
import {
  isReferralAccepted,
  isReferralWithClinic,
} from "@/lib/referralStatus";

// Everything the hospital (B2B) dashboard's screens read, loaded once per
// request -- same split as the patient and therapist loaders, for the same
// reason: Refer, Your Referrals and Revenue are separate routes now, not
// anchors on one scroll.
//
// Server-only: it holds admin-client reads (the referred patients'
// sessions, which RLS would not otherwise show a hospital).

/** Which screen is asking -- see PatientScreen for the reasoning. */
export type HospitalScreen = "overview" | "refer" | "referrals" | "revenue";

export async function loadHospitalDashboard(screen: HospitalScreen = "overview") {
  // Only Revenue (and the Overview's money figures) needs the referred
  // patients' sessions, which is the expensive part of this page: three
  // admin-client reads across every patient this hospital ever sent.
  const needSessions = screen === "revenue" || screen === "overview";
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
  // service-role client - but strictly scoped to rows referencing this
  // hospital's own id, never anything broader.
  const admin = createAdminClient();

  // All of these are independent of each other -- run in parallel instead
  // of one at a time, since router.refresh() re-runs this whole page on
  // every referral submit/withdraw. See admin/dashboard/page.tsx's
  // identical Promise.all for the reasoning. rawReferredSessions/
  // the session reads further below stay sequential -- they
  // genuinely need referredPatientIds to resolve first.
  const [
    { data: profile, error: profileError },
    { data: settingsRow },
    { data: hospitalCodeRow },
    referralsResult,
    { data: capacityNoteRows, error: capacityNoteError },
    { data: declineReasonRows, error: declineReasonError },
    referredPatientsResult,
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

    readAllRows<ReferralRow>(() =>
      supabase
        .from("patient_referrals")
        .select("id, patient_name, medical_issue, status, assigned_slot_time, created_at, visit_mode, pincode")
        .eq("hospital_id", user.id)
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
    ),

    // capacity_note is new/migration-dependent -- kept isolated (same
    // convention used throughout this codebase) so a missing migration only
    // blanks this one note, not the whole referrals list.
    // Paged like the referral list it annotates: a plain select stops at
    // 1,000 rows, and a note past that was silently dropped.
    readAllRowsAsData<{ id: string; capacity_note: string | null }>(() =>
      supabase
        .from("patient_referrals")
        .select("id, capacity_note")
        .eq("hospital_id", user.id)
        .order("id", { ascending: true })
    ),

    // decline_reason is newer still, so it gets its own isolated read for
    // the same reason -- folded into the select above, a database without
    // the migration would lose the capacity note as well as this. The
    // reason is the one thing that makes a declined referral actionable for
    // the partner who sent it, so it must not be able to take the note
    // down with it.
    readAllRowsAsData<{ id: string; decline_reason: string | null }>(() =>
      supabase
        .from("patient_referrals")
        .select("id, decline_reason")
        .eq("hospital_id", user.id)
        .order("id", { ascending: true })
    ),

    readAllRows<{ id: string; full_name: string | null; email: string | null }>(() =>
      admin
        .from("profiles")
        .select("id, full_name, email")
        .eq("referred_by_hospital_id", user.id)
        .order("id", { ascending: true })
    ),
  ]);

  // A read that failed renders as a banner, never as a zero. "No referrals"
  // and "₹0 earned" are statements a partner acts on, and they must not be
  // what a database blip looks like. See AdminDataLoadBanner.
  const missing: string[] = [];
  const truncated: string[] = [];
  if (profileError) missing.push("your organisation's profile");
  if (referralsResult.error) missing.push("your referrals");
  // The note says what the clinic needs before it can act on a referral,
  // and the reason says why one was declined. Losing either used to look
  // exactly like the clinic having said nothing.
  if (capacityNoteError) missing.push("the clinic's notes on your referrals");
  if (declineReasonError) missing.push("the reasons referrals were declined");
  if (referralsResult.truncated) truncated.push("referrals");
  if (referredPatientsResult.error) missing.push("the patients you referred");

  const referrals = referralsResult.rows;
  const referredPatients = referredPatientsResult.rows;

  const adminSettings = parseAdminSettings(settingsRow);
  const capacityNoteMap = new Map(
    (capacityNoteRows ?? []).map((r) => [r.id, r.capacity_note])
  );
  const declineReasonMap = new Map(
    (declineReasonRows ?? []).map((r) => [r.id, r.decline_reason])
  );
  const referredPatientIds = referredPatients.map((p) => p.id);

  // Completed sessions only, read server-side and only ever that. This
  // screen tracks what was delivered -- a partner has no business seeing a
  // referred patient's upcoming or cancelled appointments, and never the
  // session's Meet link: that is a private consultation, and the link used
  // to be fetched here and rendered as a live "Join Session" button.
  let sessionRows: HospitalSessionRow[] = [];
  if (referredPatientIds.length > 0 && needSessions) {
    const [base, codes, terms] = await Promise.all([
      readAllRowsByIds(referredPatientIds, (chunk) =>
        admin
          .from("appointments")
          .select(
            "id, slot_time, timezone, status, payment_status, amount_paid_paise, patient_id, refund_status, refund_amount_paise"
          )
          .in("patient_id", chunk)
          .eq("status", "completed")
          .order("slot_time", { ascending: false })
          .order("id", { ascending: true })
      ),
      // session_code is new/migration-dependent -- isolated so an
      // unknown-column error costs the codes alone.
      readAllRowsByIds(referredPatientIds, (chunk) =>
        admin
          .from("appointments")
          .select("id, session_code")
          .in("patient_id", chunk)
          .eq("status", "completed")
          .order("id", { ascending: true })
      ),
      // The commission inputs: pay-later terms and the rate frozen at
      // completion. Isolated for the same reason. Without the frozen rate a
      // renegotiated percentage rewrote every commission already earned.
      readAllRowsByIds(referredPatientIds, (chunk) =>
        admin
          .from("appointments")
          .select(
            "id, payment_terms, amount_due_paise, hospital_share_percent_at_completion, hospital_id_at_completion"
          )
          .in("patient_id", chunk)
          .eq("status", "completed")
          .order("id", { ascending: true })
      ),
    ]);
    if (base.error) missing.push("your referred patients' sessions");
    if (base.truncated) truncated.push("sessions");
    if (terms.error) missing.push("the commission rates on those sessions");
    const termsById = new Map(
      (terms.rows as CommissionTermsRow[]).map((r) => [r.id, r])
    );
    sessionRows = mergeSessionCodes(
      base.rows as HospitalSessionBaseRow[],
      codes.error ? null : (codes.rows as { id: string; session_code: string | null }[])
    ).map((row) => ({ ...row, ...(termsById.get(row.id) ?? {}) }));
  }

  const patientMap = new Map(referredPatients.map((p) => [p.id, p]));
  const sharePercent = profile?.revenue_share_percent ?? 0;

  // Delivered, earned and attributed to *this* partner -- through
  // partnerCutFor, the same arithmetic the admin Money screens use, so the
  // partner and the clinic can never quote two numbers for one referral.
  // A session whose completion snapshot names no partner, or another one,
  // was not this partner's on the day it was delivered and earns nothing
  // here (a referral recorded later is not retrospective).
  const deliveredSessions = sessionRows.flatMap((s) => {
    const line = hospitalSessionLine(s, user.id, sharePercent);
    return line ? [line] : [];
  });
  const totalRevenuePaise = deliveredSessions.reduce((sum, s) => sum + s.netPaise, 0);
  const hospitalCutPaise = deliveredSessions.reduce((sum, s) => sum + s.partnerCutPaise, 0);
  const totalRevenue = totalRevenuePaise / 100;
  const hospitalCut = hospitalCutPaise / 100;
  const companyCut = (totalRevenuePaise - hospitalCutPaise) / 100;

  // ---- Overview -----------------------------------------------------
  const referralRows = referrals ?? [];
  // Through the shared vocabulary rather than string comparisons. These two
  // filtered for "pending" and "accepted", neither of which
  // patient_referrals.status can ever hold -- it is CHECKed to
  // pending_review / therapist_assigned / invite_sent / converted /
  // declined. So both counts read **0 for every partner, permanently**, on
  // the one screen a partner opens to see what became of the patients they
  // sent. It read as a clinic that actioned nothing.
  const pendingReferrals = referralRows.filter((r) => isReferralWithClinic(r.status)).length;
  const acceptedReferrals = referralRows.filter((r) => isReferralAccepted(r.status)).length;
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
      href: "/hospital/dashboard/referrals",
    },
    {
      label: "Accepted",
      value: String(acceptedReferrals),
      note: referralRows.length === 0 ? "Send your first referral" : "Patients the clinic took on",
      accent: "bg-emerald-500",
      href: "/hospital/dashboard/referrals",
    },
    {
      label: "Sessions delivered",
      value: String(deliveredSessions.length),
      note: "Completed sessions for patients you referred",
      accent: "bg-blue-500",
      href: "/hospital/dashboard/revenue",
    },
    {
      label: "Your share",
      value: `₹${hospitalCut.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`,
      note: `${sharePercent}% of ₹${totalRevenue.toLocaleString("en-IN", { maximumFractionDigits: 0 })} kept after refunds`,
      accent: "bg-emerald-500",
      href: "/hospital/dashboard/revenue",
    },
  ];

  // Real pages, not anchors -- see buildPatientNavItems for why.
  const navItems = HOSPITAL_NAV_ITEMS;

  return {
    user,
    profile,
    hospitalCodeRow,
    adminSettings,
    referrals: referralRows,
    capacityNoteMap,
    declineReasonMap,
    patientMap,
    // Renamed from `paidSessions`: these are the sessions actually
    // delivered, which is what a partner's commission is earned on.
    deliveredSessions,
    totalRevenue,
    hospitalCut,
    companyCut,
    sharePercent,
    pendingReferrals,
    acceptedReferrals,
    hospitalFeed,
    overviewCells,
    navItems,
    loadIssues: { missing, truncated },
  };
}

type ReferralRow = {
  id: string;
  patient_name: string;
  medical_issue: string | null;
  status: string;
  assigned_slot_time: string | null;
  created_at: string;
  visit_mode: string | null;
  pincode: string | null;
};

type HospitalSessionBaseRow = {
  id: string;
  slot_time: string | null;
  timezone: string | null;
  status: string;
  payment_status: string;
  amount_paid_paise: number | null;
  patient_id: string;
  refund_status: string | null;
  refund_amount_paise: number | null;
};

type CommissionTermsRow = {
  id: string;
  payment_terms?: string | null;
  amount_due_paise?: number | null;
  hospital_share_percent_at_completion?: number | null;
  hospital_id_at_completion?: string | null;
};

type HospitalSessionRow = HospitalSessionBaseRow &
  Omit<CommissionTermsRow, "id"> & { session_code?: string | null };

export type HospitalDashboardData = Awaited<ReturnType<typeof loadHospitalDashboard>>;
