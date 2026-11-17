import { createAdminClient } from "@/lib/supabase/admin";
import { PROFILE_KIND_LABELS } from "@/lib/outcomeMeasures";
import { PROFILE_WIDGET_KIND_ORDER, resolveProfileWidgets, widgetRows } from "@/lib/profileWidgets";
import { loadKindChoices } from "@/lib/profileWidgetsServer";
import { ProfileWidgetKindEditor } from "@/components/admin/ProfileWidgetSettingsToggles";
import PatientLayoutFinder, { type CustomisedPatient } from "@/components/admin/PatientLayoutFinder";

// Settings -> Health Profile layout: which sections every patient of a
// condition kind sees. Self-fetching like LicensedMeasureSettings, so the
// dashboard's big Promise.all does not grow for one screen; rendered only on
// the Settings screen, which no scope but a Master Admin's is sent, and the
// route behind it is requireAdminScope("settings"). One read for all six
// kinds; unreadable says "we couldn't check" on every kind rather than
// drawing switches that would read as a fact.
export default async function ProfileWidgetSettings({ canManagePeople = false }: { canManagePeople?: boolean } = {}) {
  const admin = createAdminClient();
  const [read, customised] = await Promise.all([loadKindChoices(admin), canManagePeople ? loadCustomisedPatients(admin) : null]);
  const kinds = PROFILE_WIDGET_KIND_ORDER.map((kind) => {
    const layout = resolveProfileWidgets({
      kind,
      kindChoices:
        read.status === "ok"
          ? { status: "ok", choices: read.rows.filter((r) => r.profileKind === kind).map((r) => ({ widgetKey: r.widgetKey, visible: r.visible })) }
          : { status: "unreadable" },
    });
    return {
      kind,
      label: PROFILE_KIND_LABELS[kind].label,
      patientLabel: PROFILE_KIND_LABELS[kind].patientLabel,
      readable: read.status === "ok",
      // On this screen "inherited" is the code's default.
      rows: widgetRows(layout).map((r) => ({ ...r, inherited: r.locked ? true : (layout.widgets.find((w) => w.widget.key === r.key)?.widget.defaultVisible ?? true) })),
    };
  });
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-6">
      <h2 className="font-display font-bold text-lg text-slate-800 mb-1">Health Profile layout</h2>
      <p className="text-sm text-slate-600 mb-4">
        Choose which sections a patient sees on their own Health Profile, for each condition type. Sections that keep a patient safe are always
        shown and carry a lock. Nothing recorded is deleted by hiding a section - it only stops being drawn on the patient&apos;s page and in
        their download.
      </p>
      <ProfileWidgetKindEditor kinds={kinds} />
      {/* One patient's own layout: the same panel and route as their record,
          found by name or ID. Only for a scope whose route accepts it. */}
      {customised && (
        <PatientLayoutFinder
          customised={customised.status === "ok" ? customised.patients : []}
          customisedUnreadable={customised.status === "unreadable"}
        />
      )}
    </div>
  );
}

/** The patients whose own layout differs from their condition type's: one row
 *  per patient with how many sections were changed, newest change first. An
 *  unreadable read says so rather than "none". */
async function loadCustomisedPatients(
  admin: ReturnType<typeof createAdminClient>
): Promise<{ status: "ok"; patients: CustomisedPatient[] } | { status: "unreadable" }> {
  try {
    const { data, error } = await admin
      .from("patient_profile_widget_overrides")
      .select("patient_id, set_at")
      .order("set_at", { ascending: false })
      .limit(1000);
    if (error?.code === "42P01" || error?.code === "PGRST205") return { status: "ok", patients: [] };
    if (error) return { status: "unreadable" };
    const changed = new Map<string, number>();
    for (const row of data ?? []) changed.set(String(row.patient_id), (changed.get(String(row.patient_id)) ?? 0) + 1);
    if (changed.size === 0) return { status: "ok", patients: [] };
    const ids = [...changed.keys()].slice(0, 100);
    const withCode = await admin.from("profiles").select("id, full_name, patient_code").in("id", ids);
    const people = withCode.error?.code === "42703" ? await admin.from("profiles").select("id, full_name").in("id", ids) : withCode;
    if (people.error) return { status: "unreadable" };
    const byId = new Map(
      (people.data ?? []).map((p: { id: string; full_name: string | null; patient_code?: string | null }) => [p.id, p])
    );
    return {
      status: "ok",
      patients: ids.map((id) => ({
        id,
        name: byId.get(id)?.full_name ?? "Unnamed patient",
        code: byId.get(id)?.patient_code ?? null,
        changed: changed.get(id) ?? 0,
      })),
    };
  } catch {
    return { status: "unreadable" };
  }
}
