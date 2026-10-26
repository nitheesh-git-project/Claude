import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isPatientProfile, isProfileActive, profileCheckUnavailable } from "@/lib/supabase/requireActiveProfile";
import { enforceRateLimit } from "@/lib/rateLimitServer";
import { loadLiveDisplay } from "@/lib/assessmentRunServer";

// The patient's companion screen asking for what to show (Health Profile
// redesign, phase 7b): the fallback the screen polls every three seconds when
// the realtime socket is not reaching it. It is the same read the page makes
// on load (`loadLiveDisplay`), with the patient's OWN row-level-scoped client:
// `assessment_live_display_select_own` is the gate, so this can only ever
// answer with the signed-in patient's own display row, and that row passed the
// patient-safe whitelist (`validateLiveDisplay`) on the way out. No run, no
// event and no result is reachable from here. A row that fails the whitelist
// is "unreadable" (503), never a partial screen.
//
// Response: 200 { display: LiveDisplayView | null, serverNow: string }
//           403 not a signed-in, active patient,
//           429 rate limited (the screen keeps what it has and tries again),
//           503 a check that could not be run (the screen says nothing new).
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const active = await isProfileActive(user.id);
  if (active === null) return profileCheckUnavailable();
  if (!active) return NextResponse.json({ error: "Your account is not active." }, { status: 403 });
  const isPatient = await isPatientProfile(user.id);
  if (isPatient === null) return profileCheckUnavailable();
  if (!isPatient) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const limited = await enforceRateLimit(request, "assessmentDisplayRead", { identifier: user.id });
  if (limited) return limited;

  const read = await loadLiveDisplay(supabase, user.id);
  if (read.status !== "ok") {
    return NextResponse.json({ error: "We couldn't check the screen just now." }, { status: 503 });
  }
  return NextResponse.json({ display: read.display, serverNow: read.serverNow }, { headers: { "Cache-Control": "no-store" } });
}
