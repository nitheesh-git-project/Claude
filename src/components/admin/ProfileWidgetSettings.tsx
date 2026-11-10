import { createAdminClient } from "@/lib/supabase/admin";
import { PROFILE_KIND_LABELS } from "@/lib/outcomeMeasures";
import { PROFILE_WIDGET_KIND_ORDER, resolveProfileWidgets, widgetRows } from "@/lib/profileWidgets";
import { loadKindChoices } from "@/lib/profileWidgetsServer";
import { ProfileWidgetKindEditor } from "@/components/admin/ProfileWidgetSettingsToggles";

// Settings -> Health Profile layout: which sections every patient of a
// condition kind sees. Self-fetching like LicensedMeasureSettings, so the
// dashboard's big Promise.all does not grow for one screen; rendered only on
// the Settings screen, which no scope but a Master Admin's is sent, and the
// route behind it is requireAdminScope("settings"). One read for all six
// kinds; unreadable says "we couldn't check" on every kind rather than
// drawing switches that would read as a fact.
export default async function ProfileWidgetSettings() {
  const read = await loadKindChoices(createAdminClient());
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
    </div>
  );
}
