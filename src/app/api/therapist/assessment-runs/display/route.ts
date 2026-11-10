import { NextRequest, NextResponse } from "next/server";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { enforceRateLimit } from "@/lib/rateLimitServer";
import { sessionProtocol } from "@/lib/sessionProtocols";
import { buildLiveDisplay, checkStepAction, parseLiveDisplayRow, validateDisplayRequest } from "@/lib/assessmentRun";
import { preExerciseFor, refusalResponse, requireOpenRun, writeLiveDisplay } from "@/lib/assessmentRunServer";
import { serverError } from "@/lib/apiError";

// What the patient's companion screen shows during a guided video
// assessment (phase 7a). The cockpit sends a step, a phase (ready, go, done,
// rest, paused) and whether the clock starts -- NEVER text. The server picks
// the words from the protocol (the step's patient-safe title and line, the
// fixed phase lines, the step counter, the clock label), so no result, score
// or note can reach the patient's screen through this route, and the stored
// row passes validateLiveDisplay() and the table's key CHECK as well.
//
// The clock is a start time (the server's real time) and, for a countdown,
// its length; the companion counts from it, so this is called on a step or
// phase change, never once a second. Rate limited (`assessmentDisplay`,
// keyed on the therapist). "Go" on an exertion step of the heart and lung
// protocol needs the clear pre-exercise check, and "go" on any test needs
// the red flags answered with none present -- the patient is never told to
// start what the server would refuse to save.
//
// Request:  { runId: string, stepId: string, phase: LivePhase, startClock?: boolean }
// Response: 200 { success: true, display: LiveDisplayView, serverNow: string }
//           400 malformed (any text, an unknown step or phase, a clock on a
//               step without one), 403 / 404 / 409 as the event route,
//           429 rate limited, 503 a check that could not be run.
export async function POST(request: NextRequest) {
  const { data: body, error: parseError } = await parseJsonBody<Record<string, unknown>>(request);
  if (parseError) return parseError;

  const opened = await requireOpenRun(request, body.runId);
  if (!opened.ok) return opened.response;
  const { gate } = opened;
  const limited = await enforceRateLimit(request, "assessmentDisplay", { identifier: gate.therapistId });
  if (limited) return limited;

  const req = validateDisplayRequest(gate.protocol, body);
  if (!req.ok) return refusalResponse(req.refusal);

  if (req.phase === "go") {
    const pre = await preExerciseFor(gate.admin, gate, req.step);
    if (!pre.ok) return pre.response;
    const refused = checkStepAction({ protocol: gate.protocol, step: req.step, state: gate.state, action: "go", preExercise: pre.check });
    if (refused) return refusalResponse(refused);
  }

  const built = buildLiveDisplay({ protocol: gate.protocol, step: req.step, phase: req.phase, startClock: req.startClock });
  if (!built.ok) return refusalResponse(built.refusal);

  const written = await writeLiveDisplay(gate.admin, gate.run, built.write);
  if (!written.ok) return serverError("therapist/assessment-runs/display", new Error("display write failed"));
  const view = parseLiveDisplayRow(written.row, sessionProtocol);
  return NextResponse.json({ success: true, display: view, serverNow: new Date().toISOString() });
}
