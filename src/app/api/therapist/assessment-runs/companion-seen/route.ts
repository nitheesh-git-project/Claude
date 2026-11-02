import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/rateLimitServer";
import { loadCompanionSeen } from "@/lib/assessmentRunServer";

// Whether the patient's companion screen is open (E12): the last time it
// fetched its display during this run (`assessment_companion_seen`, written
// by the patient's display route). Read with the therapist's OWN client: the
// table's select policy is the run's own therapist (or an admin), so another
// run's heartbeat reads as nothing. A failed read or a database without the
// table answers `known: false`, which the cockpit says as "couldn't check",
// never "not open". Rate limited (`assessmentCompanionSeen`).
//
// Request:  GET ?runId=<uuid>
// Response: 200 { known: true, seenAt: string | null, serverNow: string } | { known: false }
//           400 no runId, 403 not signed in, 429 rate limited.
export async function GET(request: NextRequest) {
  const runId = request.nextUrl.searchParams.get("runId")?.trim() ?? "";
  if (!runId) return NextResponse.json({ error: "Missing runId" }, { status: 400 });
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const limited = await enforceRateLimit(request, "assessmentCompanionSeen", { identifier: user.id });
  if (limited) return limited;
  const read = await loadCompanionSeen(supabase, runId);
  return NextResponse.json(read.status === "ok" ? { known: true, seenAt: read.seenAt, serverNow: read.serverNow } : { known: false }, {
    headers: { "Cache-Control": "no-store" },
  });
}
