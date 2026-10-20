import { createAdminClient } from "@/lib/supabase/admin";
import { loadSixMinuteWalkEquation } from "@/lib/outcomeServer";
import { sixMinuteWalkEquationOptions } from "@/lib/sixMinuteWalkEquation";
import SixMinuteWalkEquationPicker from "@/components/admin/SixMinuteWalkEquationPicker";

// Settings -> Clinical Questions: the six-minute walk's equation, self-fetching
// like LicensedMeasureSettings beside it. Read through
// loadSixMinuteWalkEquation -- its own call -- and rendered only on the
// Settings screen, which no scope but a Master Admin's is sent.
export default async function SixMinuteWalkEquationSettings() {
  const read = await loadSixMinuteWalkEquation(createAdminClient());
  return (
    <SixMinuteWalkEquationPicker
      options={sixMinuteWalkEquationOptions()}
      chosen={read.status === "ok" && read.chosen ? read.key : null}
      readable={read.status === "ok"}
    />
  );
}
