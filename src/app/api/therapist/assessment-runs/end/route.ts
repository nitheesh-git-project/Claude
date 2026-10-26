import { NextRequest, NextResponse } from "next/server";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { enforceRateLimit } from "@/lib/rateLimitServer";
import { recordUserActivity } from "@/lib/userActivityLog";
import { ASSESSMENT_RUN_SELECT, endedLiveDisplay, parseRunRow, validateEndRequest } from "@/lib/assessmentRun";
import { assessmentSummaryDraft } from "@/lib/assessmentSummaryDraft";
import { loadRunMeasurements, refusalResponse, requireOpenRun, writeLiveDisplay } from "@/lib/assessmentRunServer";
import { serverError } from "@/lib/apiError";

// The physiotherapist ends a guided video assessment (phase 7a): completed,
// or abandoned with one of the fixed reasons (END_REASONS; no free text).
// The end is a compare-and-set on status = 'in_progress', and the trigger
// sets the end time itself; a run that already ended is a 409. The
// patient's companion moves to its "All done" screen. The answer carries
// the "Where things stand" DRAFT built from what was saved in the run
// (assessmentSummaryDraft, in the patient's voice -- they are who a written
// summary is for) for the cockpit's writing box; it is saved, if at all,
// through the existing care-status `set_summary` action, never here.
//
// Request:  { runId: string, outcome: "completed" | "abandoned", reason?: EndReason }
// Response: 200 { success: true, run: AssessmentRun, summaryDraft: string | null }
//           400 malformed (abandoned with no reason, completed with one),
//           403 / 404 as the event route, 409 { code: "run_not_in_progress" },
//           429 rate limited, 503 a check that could not be run.
export async function POST(request: NextRequest) {
  const { data: body, error: parseError } = await parseJsonBody<Record<string, unknown>>(request);
  if (parseError) return parseError;
  const end = validateEndRequest(body);
  if (!end.ok) return refusalResponse(end.refusal);

  const opened = await requireOpenRun(request, body.runId);
  if (!opened.ok) return opened.response;
  const { gate } = opened;
  const limited = await enforceRateLimit(request, "assessmentRun", { identifier: gate.therapistId });
  if (limited) return limited;

  const { data, error } = await gate.admin
    .from("assessment_runs")
    .update({ status: end.outcome, ended_reason: end.reason, ended_at: new Date().toISOString() })
    .eq("id", gate.run.id)
    .eq("status", "in_progress")
    .select(ASSESSMENT_RUN_SELECT);
  if (error) return serverError("therapist/assessment-runs/end", error);
  const run = data && data.length === 1 ? parseRunRow(data[0]) : null;
  if (!run) return NextResponse.json({ error: "This assessment has already ended.", code: "run_not_in_progress" }, { status: 409 });

  // Costs the patient's "All done" screen if it fails, never the end.
  await writeLiveDisplay(gate.admin, run, endedLiveDisplay(gate.protocol), { ended: true });

  const measurements = await loadRunMeasurements(gate.admin, gate.events);
  const summaryDraft =
    measurements.status === "ok"
      ? assessmentSummaryDraft({
          run,
          protocol: gate.protocol,
          events: gate.events,
          measurements: measurements.measurements,
          profileKind: run.profileKind,
          voice: "patient",
        })
      : null;

  await recordUserActivity(gate.admin, {
    action: "assessment_run.ended",
    actor: { id: gate.therapistId, role: "therapist" },
    patientId: run.patientId,
    therapistId: gate.therapistId,
    appointmentId: run.appointmentId,
    details: { runId: run.id, outcome: end.outcome, reason: end.reason },
  });

  return NextResponse.json({ success: true, run, summaryDraft, summaryDraftReadable: measurements.status === "ok" });
}
