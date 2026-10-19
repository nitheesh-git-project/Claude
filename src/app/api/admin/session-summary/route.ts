import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { SESSION_SUMMARY_SELECT, summaryTextOf, type SessionSummaryRow } from "@/lib/sessionSummary";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The patient's summary of one session, for the admin session drawer.
//
// Sessions at `manage` -- the desks that work sessions and their clinical
// record (Master Admin, Operations, Clinical). Finance reads Sessions to
// reconcile money and is not shown what a therapist told a patient; the
// drawer does not render the panel for it, and this answers it 403.
//
// A read that failed is a 503, never `summary: null`: "no summary was
// written" is a claim about the session this route could not check.
export async function POST(request: NextRequest) {
  // Who is asking before what they asked: a caller who is not an admin is
  // refused whatever the body says.
  const adminUser = await requireAdminScope("sessions");
  if (!adminUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: body, error: parseError } = await parseJsonBody<{ appointmentId?: unknown }>(request);
  if (parseError) return parseError;

  const appointmentId =
    typeof body.appointmentId === "string" && UUID_RE.test(body.appointmentId) ? body.appointmentId : null;
  if (!appointmentId) {
    return NextResponse.json({ error: "Give one appointmentId." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("session_summaries")
    .select(SESSION_SUMMARY_SELECT)
    .eq("appointment_id", appointmentId)
    .maybeSingle();
  if (error) {
    console.error("admin/session-summary: read failed", error);
    return NextResponse.json(
      { error: "We couldn't load the patient's summary just now. Please try again." },
      { status: 503 }
    );
  }
  if (!data) return NextResponse.json({ summary: null });

  const row = data as SessionSummaryRow;
  const { data: author } = await admin.from("profiles").select("full_name").eq("id", row.therapist_id).maybeSingle();
  return NextResponse.json({
    summary: {
      ...summaryTextOf(row),
      writtenBy: author?.full_name ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    },
  });
}
