import { createAdminClient } from "@/lib/supabase/admin";
import { LICENSED_MEASURES } from "@/lib/licensedMeasures";
import { PROFILE_KIND_LABELS } from "@/lib/outcomeMeasures";
import { loadEnabledLicensedMeasures } from "@/lib/outcomeServer";
import LicensedMeasureToggles from "@/components/admin/LicensedMeasureToggles";

// Settings -> Clinical Questions: the licensed-scale switch, self-fetching
// like QuestionBankManager beside it so the dashboard's big Promise.all does
// not grow for one screen. Read through loadEnabledLicensedMeasures -- its
// own call, failing closed -- and rendered only on the Settings screen,
// which no scope but a Master Admin's is sent (visibleScreenKeys).
export default async function LicensedMeasureSettings() {
  const read = await loadEnabledLicensedMeasures(createAdminClient());
  const options = LICENSED_MEASURES.map((m) => ({
    key: m.key,
    label: m.label,
    plainName: m.plainName,
    usedOn: m.profileKinds.map((k) => PROFILE_KIND_LABELS[k].label).join(", "),
  }));
  return (
    <LicensedMeasureToggles
      options={options}
      enabled={read.status === "ok" ? read.keys : []}
      readable={read.status === "ok"}
    />
  );
}
