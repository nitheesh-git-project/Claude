import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import DashboardShell from "@/components/dashboard/DashboardShell";
import { THERAPIST_NAV_ITEMS } from "@/lib/dashboardNavItems";
import { parseAdminSettings, SITE_SETTINGS_SELECT } from "@/lib/adminSettings";

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
      supabase.from("site_settings").select(SITE_SETTINGS_SELECT).maybeSingle(),
    ]);

  const patientIds = [
    ...new Set([...(appointmentPatients ?? []), ...(packagePatients ?? [])].map((r) => r.patient_id)),
  ];

  const [{ data: patients }, { data: grants }] =
    patientIds.length > 0
      ? await Promise.all([
          supabase.from("profiles").select("id, full_name, email").in("id", patientIds),
          supabase
            .from("condition_access_grants")
            .select("patient_id, status")
            .eq("therapist_id", user.id)
            .in("patient_id", patientIds),
        ])
      : [{ data: [] as { id: string; full_name: string; email: string }[] }, { data: [] as { patient_id: string; status: string }[] }];

  const grantByPatientId = new Map((grants ?? []).map((g) => [g.patient_id, g.status]));
  // A patient with no grant row at all -- never requested, so this
  // therapist has likely never looked at their Health Profile. Surfaced
  // as a "New" tag and sorted to the top instead of requiring the
  // therapist to think to go check every new assignment themselves.
  const sortedPatients = [...(patients ?? [])].sort((a, b) => {
    const aNew = !grantByPatientId.has(a.id);
    const bNew = !grantByPatientId.has(b.id);
    if (aNew === bNew) return a.full_name.localeCompare(b.full_name);
    return aNew ? -1 : 1;
  });
  const newPatientCount = sortedPatients.filter((p) => !grantByPatientId.has(p.id)).length;
  const adminSettings = parseAdminSettings(settingsRow);

  const showDebugNav =
    process.env.NEXT_PUBLIC_SHOW_DEBUG_NAV === "true" ||
    (process.env.NEXT_PUBLIC_SHOW_DEBUG_NAV !== "false" && process.env.NODE_ENV !== "production");

  return (
    <DashboardShell
      brandLabel="Therapist Panel"
      brandIcon="fa-user-doctor"
      basePath="/therapist/dashboard"
      navItems={THERAPIST_NAV_ITEMS}
      userName={profile?.full_name ?? "Therapist"}
      userEmail={user.email ?? ""}
      userAvatarUrl={profile?.avatar_url ?? null}
      userCode={therapistCodeRow?.therapist_code ?? null}
      offsetTop={showDebugNav}
      sessionTimeoutMinutes={adminSettings.sessionTimeoutMinutes}
      realtimeTables={["condition_access_grants", "patient_condition_profiles"]}
      headerTitle="Health Profiles"
      headerSubtitle="View your patients' condition history, and request access to fill it in on their behalf."
    >
      <div className="max-w-2xl mx-auto bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        {newPatientCount > 0 && (
          <p className="mb-4 rounded-lg bg-teal-50 border border-teal-200 px-3 py-2 text-xs font-semibold text-teal-800">
            {newPatientCount} new patient{newPatientCount > 1 ? "s" : ""} — you haven&apos;t looked at their Health
            Profile yet.
          </p>
        )}
        {sortedPatients.length === 0 ? (
          <p className="text-xs text-slate-500 py-4 text-center">
            You don&apos;t have any assigned patients yet.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {sortedPatients.map((p) => {
              const grantStatus = grantByPatientId.get(p.id);
              return (
                <li key={p.id}>
                  <Link
                    href={`/therapist/dashboard/health-profile/${p.id}`}
                    className="flex items-center justify-between gap-3 py-3 hover:bg-slate-50 -mx-2 px-2 rounded-lg transition"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">{p.full_name}</p>
                      <p className="text-xs text-slate-400 truncate">{p.email}</p>
                    </div>
                    {grantStatus ? (
                      <span
                        className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${GRANT_STYLE[grantStatus] ?? GRANT_STYLE.requested}`}
                      >
                        {GRANT_LABEL[grantStatus] ?? grantStatus}
                      </span>
                    ) : (
                      <span className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold bg-teal-100 text-teal-700">
                        New
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </DashboardShell>
  );
}
