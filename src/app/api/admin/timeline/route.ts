import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { loadPersonTimeline, loadSessionTimeline } from "@/lib/activityTimelineServer";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The History of one session (Sessions scope) or the Activity log of one
// patient, therapist or hospital (People scope) -- see
// src/lib/activityTimeline.ts. A history that could not be read is a 503,
// never an empty list that reads as "nothing happened".
export async function POST(request: NextRequest) {
  const { data: body, error: parseError } = await parseJsonBody<{
    sessionId?: unknown;
    personId?: unknown;
  }>(request);
  if (parseError) return parseError;

  const sessionId = typeof body.sessionId === "string" && UUID_RE.test(body.sessionId) ? body.sessionId : null;
  const personId = typeof body.personId === "string" && UUID_RE.test(body.personId) ? body.personId : null;
  if (!sessionId === !personId) {
    return NextResponse.json({ error: "Give one sessionId or one personId." }, { status: 400 });
  }

  const adminUser = await requireAdminScope(sessionId ? "sessions" : "people");
  if (!adminUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const admin = createAdminClient();
  const events = sessionId ? await loadSessionTimeline(admin, sessionId) : await loadPersonTimeline(admin, personId!);
  if (events === null) {
    return NextResponse.json(
      { error: "We couldn't load this history just now. Please try again." },
      { status: 503 }
    );
  }
  return NextResponse.json({ events });
}
