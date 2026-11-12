import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { loadLiveDisplay } from "@/lib/assessmentRunServer";
import CompanionScreen from "@/components/patient/session/CompanionScreen";

export const metadata: Metadata = {
  title: "Your guided check | MoveRestore",
};

// The patient's companion screen (Health Profile redesign, phase 7b):
// display only, dark, large. It shows the step the physiotherapist is on
// during a guided video assessment, and a calm waiting screen otherwise. The
// first paint is the patient's own display row, read with their own
// row-level-scoped client (`assessment_live_display_select_own` is the gate);
// after that the screen follows it live and falls back to polling. A row that
// fails the patient-safe whitelist is not drawn at all.
function nowIso() {
  return new Date().toISOString();
}

export default async function PatientSessionPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const read = await loadLiveDisplay(supabase, user.id);
  const initial =
    read.status === "ok"
      ? { display: read.display, serverNow: read.serverNow, unreadable: false }
      : { display: null, serverNow: nowIso(), unreadable: true };

  return <CompanionScreen patientId={user.id} initial={initial} />;
}
