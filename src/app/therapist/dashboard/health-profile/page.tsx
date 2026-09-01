import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import DashboardShell from "@/components/dashboard/DashboardShell";
import { buildTherapistNavItems } from "@/lib/dashboardNavItems";
import { parseAdminSettings, SITE_SETTINGS_SELECT } from "@/lib/adminSettings";
import { EmptyState } from "@/components/dashboard/SurfaceCard";
import { prepSummary, type SessionNoteRow } from "@/lib/sessionNotes";
import TherapistPatientsView from "@/components/therapist/TherapistPatientsView";
import { isDebugNavVisible } from "@/lib/debugNavVisible";
import { applyLedgerSessionBalances, readLedgerAuthoritative } from "@/lib/ledgerBalances";

// Same module-level helper the other dashboards use rather than a bare
// Date.now() in the component body -- a Server Component's render stays
// pure.
function nowTimestamp() {
  return Date.now();
}

export const metadata: Metadata = {
  title: "Health Profiles | Dr. Pooja's Physio",
};

const GRANT_LABEL: Record<string, string> = {
  requested: "Access requested",
  approved: "Access approved",
  declined: "Access declined",
  revoked: "Access revoked",
};
const GRANT_STYLE: Record<string, string> = {
  requested: "bg-amber-100 text-amber-700",
  approved: "bg-emerald-100 text-emerald-700",
  declined: "bg-slate-100 text-slate-500",
  revoked: "bg-slate-100 text-slate-500",
};

export default async function TherapistHealthProfilesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return null;
  }

  const [{ data: profile }, { data: therapistCodeRow }, { data: appointmentPatients }, { data: packagePatients }, { data: settingsRow }] =
    await Promise.all([
      supabase.from("profiles").select("full_name, avatar_url").eq("id", user.id).single(),
      supabase.from("profiles").select("therapist_code").eq("id", user.id).maybeSingle(),
      supabase.from("appointments").select("patient_id").eq("therapist_id", user.id),
      supabase.from("patient_package_purchases").select("patient_id").eq("locked_therapist_id", user.id),
      supabase.from("site_settings").select(SITE_SETTINGS_SELECT).maybeSingle()
    ]);

  const patientIds = [
    ...new Set([...(appointmentPatients ?? []), ...(packagePatients ?? [])].map((r) => r.patient_id)),
  ];

  // profiles has no RLS policy letting a therapist read a *patient's* row
  // directly (only their own, or admin) -- same reason the main therapist
  // dashboard's appointment-patient lookup already goes through the admin
  // client (see src/app/therapist/dashboard/page.tsx). The therapist is
  // already established here (an authenticated session, reading only the
  // patient ids their own appointments/packages name), so this is scoped,
  // not a broad admin-client exposure.
  const admin = createAdminClient();
  const [{ data: patients }, { data: grants }] =
    patientIds.length > 0
      ? await Promise.all([
          admin.from("profiles").select("id, full_name, patient_code").in("id", patientIds),
          supabase
            .from("condition_access_grants")
            .select("patient_id, status")
            .eq("therapist_id", user.id)
            .in("patient_id", patientIds),
        ])
      : [{ data: [] as { id: string; full_name: string; patient_code: string | null }[] }, { data: [] as { patient_id: string; status: string }[] }];

  // Prep material: the next booked session per patient, and this
  // therapist's own notes. Both are what turn a directory of names into a
  // surface you can actually walk into a session from.
  const [{ data: upcomingRows }, { data: noteRows }] =
    patientIds.length > 0
      ? await Promise.all([
          supabase
            .from("appointments")
            .select("id, patient_id, slot_time, status")
            .eq("therapist_id", user.id)
            .in("status", ["confirmed", "requested"])
            .order("slot_time", { ascending: true }),
          // Own query: session_notes is new/migration-dependent, and an
          // unknown-table error should only cost the prep lines, not the
          // whole page.
          supabase
            .from("session_notes")
            .select("id, appointment_id, patient_id, therapist_id, data, free_text, created_at, updated_at")
            .in("patient_id", patientIds)
            .order("created_at", { ascending: false }),
        ])
      : [
          { data: [] as { id: string; patient_id: string; slot_time: string | null; status: string }[] },
          { data: [] as SessionNoteRow[] },
        ];

  // Programmes: the same people grouped by package purchase rather than by
  // name, shown as a view switch on this screen instead of its own sidebar
  // entry. Readable directly via package_purchases_select_locked_therapist,
  // so no admin client for the rows themselves.
  const [{ data: lockedPurchases }, { data: programmeAppointments }] = await Promise.all([
    supabase
      .from("patient_package_purchases")
      .select("id, purchase_code, patient_id, package_id, session_count, sessions_used, status")
      .eq("locked_therapist_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("appointments")
      .select("package_purchase_id, status, slot_time")
      .eq("therapist_id", user.id)
      .not("package_purchase_id", "is", null),
  ]);

  // Programme balances come from the ledger once it is authoritative --
  // including the "N sessions left" the Suggest control gates on, so a
  // therapist is never offered a suggestion the booking would refuse. Read
  // with the admin client because site_settings is not readable by a
  // therapist's own session; the rows themselves came back through RLS
  // above. A no-op while the flag is off.
  const programmePurchases = await applyLedgerSessionBalances(
    admin,
    lockedPurchases ?? [],
    { authoritative: await readLedgerAuthoritative(admin) }
  );

  // Pending suggestions, read in their own call so a database that hasn't
  // run the latest schema.sql loses the Suggest control rather than this
  // whole screen -- the same migration tolerance every newer column here
  // gets. At most one per purchase, enforced by a unique index.
  const [{ data: pendingSuggestionRows }, { data: suggestionsToggleRow }] = await Promise.all([
    supabase
      .from("session_suggestions")
      .select("id, purchase_id, slot_time, note")
      .eq("therapist_id", user.id)
      .eq("status", "pending"),
    supabase.from("site_settings").select("therapist_suggestions_enabled").maybeSingle(),
  ]);
  const pendingSuggestionByPurchase = new Map(
    (pendingSuggestionRows ?? []).map((r) => [
      r.purchase_id as string,
      { id: r.id as string, slotTime: r.slot_time as string, note: (r.note as string) ?? null },
    ])
  );
  const suggestionsEnabled = suggestionsToggleRow?.therapist_suggestions_enabled === true;

  const notes = (noteRows ?? []) as SessionNoteRow[];
  const nowMs = nowTimestamp();

  // Who still needs onboarding. Its own query, and deliberately keyed off
  // whether there is a record on file rather than off the specialty
  // column: `specialty` defaults to ortho, and an autosaved draft creates
  // the row before anyone has decided anything, so a null check would
  // read a half-filled draft as a finished chart. Isolated for the usual
  // migration-tolerance reason -- an unknown-column error here must cost
  // the chip, not the whole directory.
  const chartPatientIds = (patients ?? []).map((p) => p.id);
  const { data: conditionProfileRows } = chartPatientIds.length
    ? await supabase
        .from("patient_condition_profiles")
        .select("patient_id, data")
        .in("patient_id", chartPatientIds)
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
  const onboardingPatientIds = new Set(
    chartPatientIds.filter((id) => !onboardedPatientIds.has(id))
  );

  // Same in-memory derivation the therapist dashboard loader uses: every
  // session on a purchase locked to this therapist already carries their
  // own therapist_id, so counting them needs no extra round trip.
  const programmeCompleted = new Map<string, number>();
  const programmeScheduled = new Map<string, number>();
  for (const a of programmeAppointments ?? []) {
    const id = a.package_purchase_id as string | null;
    if (!id) continue;
    if (a.status === "completed") {
      programmeCompleted.set(id, (programmeCompleted.get(id) ?? 0) + 1);
    } else if (
      (a.status === "requested" || a.status === "confirmed") &&
      a.slot_time &&
      new Date(a.slot_time).getTime() > nowMs
    ) {
      programmeScheduled.set(id, (programmeScheduled.get(id) ?? 0) + 1);
    }
  }

  const programmePackageIds = [
    ...new Set(programmePurchases.map((p) => p.package_id).filter(Boolean)),
  ];
  const nextSessionByPatient = new Map<string, string>();
  for (const row of upcomingRows ?? []) {
    if (!row.slot_time || new Date(row.slot_time).getTime() < nowMs) continue;
    if (!nextSessionByPatient.has(row.patient_id)) nextSessionByPatient.set(row.patient_id, row.slot_time);
  }

  const { data: programmePackageInfo } =
    programmePackageIds.length > 0
      ? await admin
          .from("treatment_category_packages")
          .select("id, title")
          .in("id", programmePackageIds as string[])
      : { data: [] as { id: string; title: string }[] };
  const programmePackageTitleById = new Map(
    (programmePackageInfo ?? []).map((p) => [p.id, p.title])
  );
  const patientNameById = new Map((patients ?? []).map((p) => [p.id, p.full_name]));

  const grantByPatientId = new Map((grants ?? []).map((g) => [g.patient_id, g.status]));
  // "New" (sort-to-top + count banner) clears only once admin actually
  // approves the access request -- a merely-requested grant still means
  // this therapist can't edit anything yet, so it still needs admin
  // attention, not just the therapist's own. The per-row badge below
  // still shows "Access requested" etc. for any existing grant regardless
  // of this -- this only governs which patients count as still-new.
  const approvedPatientIds = new Set(
    (grants ?? []).filter((g) => g.status === "approved").map((g) => g.patient_id)
  );
  // Whoever you are seeing soonest comes first -- this page's job is
  // preparing for the next session, not browsing a directory. Patients
  // with nothing booked fall to the bottom, alphabetically.
  //
  // Ahead of all of that: anyone nobody has onboarded yet. Until a
  // therapist triages them and writes their first record, that patient's
  // own health profile is locked and there is nothing in their chart to
  // prepare from -- so it outranks "seeing them soonest".
  const sortedPatients = [...(patients ?? [])].sort((a, b) => {
    const aOnboard = onboardingPatientIds.has(a.id);
    const bOnboard = onboardingPatientIds.has(b.id);
    if (aOnboard !== bOnboard) return aOnboard ? -1 : 1;
    const aNext = nextSessionByPatient.get(a.id);
    const bNext = nextSessionByPatient.get(b.id);
    if (aNext && bNext) return new Date(aNext).getTime() - new Date(bNext).getTime();
    if (aNext) return -1;
    if (bNext) return 1;
    return a.full_name.localeCompare(b.full_name);
  });
  const onboardingCount = sortedPatients.filter((p) => onboardingPatientIds.has(p.id)).length;
  const newPatientCount = sortedPatients.filter(
    (p) => !approvedPatientIds.has(p.id) && !onboardingPatientIds.has(p.id)
  ).length;
  const adminSettings = parseAdminSettings(settingsRow);

  const showDebugNav = isDebugNavVisible();

  return (
    <DashboardShell
      brandLabel="Therapist Panel"
      brandIcon="fa-user-doctor"
      basePath="/therapist/dashboard"
      navItems={buildTherapistNavItems()}
      userName={profile?.full_name ?? "Therapist"}
      userEmail={user.email ?? ""}
      userAvatarUrl={profile?.avatar_url ?? null}
      userCode={therapistCodeRow?.therapist_code ?? null}
      offsetTop={showDebugNav}
      sessionTimeoutMinutes={adminSettings.sessionTimeoutMinutes}
      realtimeTables={["condition_access_grants", "patient_condition_profiles", "session_notes"]}
      headerTitle="My Patients"
      headerSubtitle="Everyone assigned to you, soonest session first — with what you recorded last time, so you can walk in prepared. Switch to Programmes for package patients by purchase."
    >
      <div className="max-w-2xl mx-auto bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <TherapistPatientsView
          patientCount={sortedPatients.length}
          suggestionsEnabled={suggestionsEnabled}
          leadTimeHours={adminSettings.onlineBookingLeadTimeHours}
          programmes={programmePurchases.map((p) => ({
            id: p.id,
            purchaseCode: p.purchase_code,
            patientName: patientNameById.get(p.patient_id) ?? "Unknown patient",
            patientCode: null,
            packageTitle: programmePackageTitleById.get(p.package_id) ?? "Session Package",
            sessionCount: p.session_count,
            sessionsUsed: p.sessions_used,
            completedCount: programmeCompleted.get(p.id) ?? 0,
            scheduledCount: programmeScheduled.get(p.id) ?? 0,
            status: p.status,
            pendingSuggestion: pendingSuggestionByPurchase.get(p.id) ?? null,
          }))}
        >
        {onboardingCount > 0 && (
          <p className="mb-4 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs font-semibold text-amber-800">
            {onboardingCount} patient{onboardingCount > 1 ? "s" : ""} need
            {onboardingCount > 1 ? "" : "s"} onboarding — four questions to set the condition type,
            then that type&apos;s own seven. Their Health Profile stays locked to them until it is
            done.
          </p>
        )}
        {newPatientCount > 0 && (
          <p className="mb-4 rounded-lg bg-teal-50 border border-teal-200 px-3 py-2 text-xs font-semibold text-teal-800">
            {newPatientCount} new patient{newPatientCount > 1 ? "s" : ""} — you haven&apos;t looked at their Health
            Profile yet.
          </p>
        )}
        {sortedPatients.length === 0 ? (
          <EmptyState
            icon="fa-user-injured"
            title="No patients assigned yet"
            body="Once the clinic assigns you a session, that patient's full chart appears here — history, pain map and your own session notes."
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {sortedPatients.map((p) => {
              const grantStatus = grantByPatientId.get(p.id);
              const nextSession = nextSessionByPatient.get(p.id) ?? null;
              const prep = prepSummary(p.id, notes);
              return (
                <li key={p.id}>
                  <Link
                    href={`/therapist/dashboard/health-profile/${p.id}`}
                    className="-mx-2 block rounded-xl px-3 py-3 transition hover:bg-slate-50"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-slate-800">{p.full_name}</p>
                        <p className="truncate text-xs text-slate-400">{p.patient_code ?? "—"}</p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        {nextSession ? (
                          <span className="rounded-full bg-teal-50 px-2.5 py-1 text-[11px] font-semibold text-teal-700">
                            Next{" "}
                            {new Date(nextSession).toLocaleString(undefined, {
                              day: "numeric",
                              month: "short",
                              hour: "numeric",
                              minute: "2-digit",
                            })}
                          </span>
                        ) : (
                          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-500">
                            Nothing booked
                          </span>
                        )}
                        {onboardingPatientIds.has(p.id) ? (
                          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-800">
                            Needs onboarding
                          </span>
                        ) : grantStatus ? (
                          <span
                            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${GRANT_STYLE[grantStatus] ?? GRANT_STYLE.requested}`}
                          >
                            {GRANT_LABEL[grantStatus] ?? grantStatus}
                          </span>
                        ) : (
                          <span className="rounded-full bg-teal-100 px-2.5 py-1 text-[11px] font-semibold text-teal-700">
                            New
                          </span>
                        )}
                      </div>
                    </div>

                    {/* The one line that makes this a prep surface rather
                        than a directory: what you left for yourself last
                        time, without opening the chart. */}
                    {prep.lastNote ? (
                      <div className="mt-2 space-y-1 rounded-xl bg-slate-50 px-3 py-2.5">
                        {prep.plan && (
                          <p className="text-xs text-slate-700">
                            <span className="font-semibold text-slate-500">Plan: </span>
                            {prep.plan}
                          </p>
                        )}
                        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
                          {prep.response && (
                            <span className="font-semibold text-slate-600">Last time: {prep.response}</span>
                          )}
                          <span>
                            {prep.notesCount} note{prep.notesCount === 1 ? "" : "s"} on file
                          </span>
                          {prep.redFlags && (
                            <span className="font-semibold text-red-600">Watch: {prep.redFlags}</span>
                          )}
                        </p>
                      </div>
                    ) : (
                      <p className="mt-2 text-[11px] text-slate-400">
                        No session notes yet — after their first session with you, what you record shows up
                        here.
                      </p>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        </TherapistPatientsView>
      </div>
    </DashboardShell>
  );
}
