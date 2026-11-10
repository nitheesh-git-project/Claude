import { NextRequest, NextResponse } from "next/server";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { enforceRateLimit } from "@/lib/rateLimitServer";
import { recordUserActivity } from "@/lib/userActivityLog";
import { ASSESSMENT_RUN_SELECT, endedLiveDisplay, parseRunRow, validateEndRequest } from "@/lib/assessmentRun";
import { assessmentSummaryDraft } from "@/lib/assessmentSummaryDraft";
import {
  loadRunMeasurements,
  refusalResponse,
  requireOpenRun,
  requireRunToAbandon,
  writeLiveDisplay,
  type AbandonGate,
} from "@/lib/assessmentRunServer";
import { serverError } from "@/lib/apiError";
import { loadTeachingEvents } from "@/lib/exercisePlanServer";

// The physiotherapist ends a guided video assessment (phase 7a): completed,
// or abandoned with one of the fixed reasons (END_REASONS; no free text).
// The end is a compare-and-set on status = 'in_progress', and the trigger
// sets the end time itself; a run that already ended is a 409. The
// patient's companion moves to its "All done" screen. The answer carries
// the "Where things stand" DRAFT built from what was saved in the run
// (assessmentSummaryDraft, in the patient's voice -- they are who a written
// summary is for) for the cockpit's writing box; it is saved, if at all,
// through the existing care-status `set_summary` action, never here. Since
// phase 7d the draft also says which home exercises were taught and how
// they went (exercise_teaching_events of this run); a database without that
// table drafts without it, and a read that fails gives no draft at all.
//
// The two outcomes have different gates. COMPLETED keeps every check the
// other run routes make (requireOpenRun: this therapist's run, assigned,
// a started session, the protocol version it started on). ABANDONED is the
// way out of a run that can no longer be finished, so it skips the
// protocol-version and started-session checks and may be done by the run's
// own physiotherapist or by one assigned to the patient now
// (requireRunToAbandon, checkRunAbandon) -- otherwise a run whose steps
// changed, or whose physiotherapist lost the patient, stays in progress for
// ever and every new start is a 409. A run whose steps changed gets no draft
// (it would be written from steps it never had).
//
// Request:  { runId: string, outcome: "completed" | "abandoned", reason?: EndReason }
// Response: 200 { success: true, run: AssessmentRun, summaryDraft: string | null }
//           400 malformed (abandoned with no reason, completed with one),
//           403 / 404 as the event route (an abandon: not the run's own
//           physiotherapist and not assigned to the patient), 409 { code:
//           "run_not_in_progress" } (completed: also "protocol_changed",
//           "session_not_started"),
//           429 rate limited, 503 a check that could not be run.
export async function POST(request: NextRequest) {
  const { data: body, error: parseError } = await parseJsonBody<Record<string, unknown>>(request);
  if (parseError) return parseError;
  const end = validateEndRequest(body);
  if (!end.ok) return refusalResponse(end.refusal);

  let gate: AbandonGate;
  if (end.outcome === "completed") {
    const opened = await requireOpenRun(request, body.runId);
    if (!opened.ok) return opened.response;
    const g = opened.gate;
    gate = { admin: g.admin, therapistId: g.therapistId, run: g.run, events: g.events, protocol: g.protocol, displayProtocol: g.protocol };
  } else {
    const opened = await requireRunToAbandon(body.runId);
    if (!opened.ok) return opened.response;
    gate = opened.gate;
  }
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
  if (gate.displayProtocol) await writeLiveDisplay(gate.admin, run, endedLiveDisplay(gate.displayProtocol), { ended: true });

  // No draft for a run whose steps changed: nothing to read, so nothing
  // "could not be checked" either.
  let summaryDraft: string | null = null;
  let draftReadable = true;
  const protocol = gate.protocol;
  if (protocol) {
    const [measurements, teaching] = await Promise.all([loadRunMeasurements(gate.admin, gate.events), loadTeachingEvents(gate.admin, run.id)]);
    draftReadable = measurements.status === "ok" && teaching.status !== "unreadable";
    summaryDraft =
      measurements.status === "ok" && draftReadable
        ? assessmentSummaryDraft({
            run,
            protocol,
            events: gate.events,
            measurements: measurements.measurements,
            profileKind: run.profileKind,
            voice: "patient",
            teaching: teaching.status === "ok" ? teaching.events : [],
          })
        : null;
  }

  await recordUserActivity(gate.admin, {
    action: "assessment_run.ended",
    actor: { id: gate.therapistId, role: "therapist" },
    patientId: run.patientId,
    // The run's own physiotherapist; the actor may be a colleague assigned
    // to the patient who closed a run left open.
    therapistId: run.therapistId,
    appointmentId: run.appointmentId,
    details: { runId: run.id, outcome: end.outcome, reason: end.reason },
  });

  return NextResponse.json({ success: true, run, summaryDraft, summaryDraftReadable: draftReadable });
}
