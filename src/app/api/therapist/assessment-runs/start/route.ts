import { NextRequest, NextResponse } from "next/server";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { serverNowMs } from "@/lib/debugClock";
import { enforceRateLimit } from "@/lib/rateLimitServer";
import { recordUserActivity } from "@/lib/userActivityLog";
import { loadPatientProfileKind } from "@/lib/outcomeServer";
import { requireAssignedTherapist, requireSignedInUser, requireStartedSession } from "@/lib/therapistClinicalGate";
import { defaultProtocolFor, protocolsForProfileKind, redFlagStep } from "@/lib/sessionProtocols";
import { ASSESSMENT_RUN_SELECT, buildLiveDisplay, parseRunRow } from "@/lib/assessmentRun";
import { couldNotCheck, databaseNotReady, loadActiveRun, writeLiveDisplay } from "@/lib/assessmentRunServer";
import { serverError } from "@/lib/apiError";

// A therapist starts a guided video assessment for a patient (phase 7a,
// docs/rules/clinical.md "The guided video assessment").
//
// Gated like a measurement: signed in, an active approved therapist,
// assigned to the patient under the clinical-access rule, with a session
// that has started or been delivered on the debug bar's clock. The protocol
// is picked from the patient's profile kind, re-derived on the server from
// the recorded condition type and intake (profileKindFor), never sent by the
// client: `protocolKey` may only choose among that kind's own protocols
// (the orthopaedic knee protocol is the default). A linked session must be
// this patient's, this therapist's, a video session, and confirmed or
// completed. One run in progress per patient: a second start answers 409
// with the one already open, never a second run. Admin has no door here.
//
// Request:  { patientId: string, appointmentId?: string | null, protocolKey?: string }
// Response: 200 { success: true, run: AssessmentRun }
//           400 malformed / unknown protocol for this kind / a bad session,
//           403 not this therapist's patient or session,
//           409 { code: "run_in_progress", runId, protocolKey, startedAt, yours }
//               | { code: "session_not_started" | "no_condition_profile" },
//           429 rate limited, 503 a check that could not be run or a
//           database without the tables.
export async function POST(request: NextRequest) {
  const who = await requireSignedInUser();
  if (!who.ok) return who.response;

  const { data: body, error: parseError } = await parseJsonBody<{
    patientId?: unknown;
    appointmentId?: unknown;
    protocolKey?: unknown;
  }>(request);
  if (parseError) return parseError;
  const patientId = typeof body.patientId === "string" ? body.patientId.trim() : "";
  if (!patientId) return NextResponse.json({ error: "Missing patientId" }, { status: 400 });
  if (body.protocolKey !== undefined && body.protocolKey !== null && typeof body.protocolKey !== "string") {
    return NextResponse.json({ error: "protocolKey must be text." }, { status: 400 });
  }

  const limited = await enforceRateLimit(request, "assessmentRun", { identifier: who.userId });
  if (limited) return limited;

  const gate = await requireAssignedTherapist(
    who.userId,
    patientId,
    "You can only run an assessment for a patient you've been assigned to."
  );
  if (!gate.ok) return gate.response;
  const { admin, therapistId } = gate;
  const nowMs = serverNowMs(request);

  const notStarted = await requireStartedSession(
    admin,
    therapistId,
    patientId,
    nowMs,
    "A guided assessment runs inside a session you've started with this patient. Open it once your session begins."
  );
  if (notStarted) return notStarted;

  const kind = await loadPatientProfileKind(admin, patientId);
  if (kind.status === "unreadable") return couldNotCheck();
  if (kind.status === "no_profile") {
    return NextResponse.json(
      {
        error: "This patient's condition type has not been recorded yet, so there is no assessment to run. Record it on their Health Profile first.",
        code: "no_condition_profile",
      },
      { status: 409 }
    );
  }
  const offered = protocolsForProfileKind(kind.profileKind);
  const protocol =
    typeof body.protocolKey === "string" && body.protocolKey
      ? offered.find((p) => p.key === body.protocolKey) ?? null
      : defaultProtocolFor(kind.profileKind);
  if (!protocol) {
    return NextResponse.json({ error: "That assessment is not one offered for this patient's condition type.", code: "unknown_protocol" }, { status: 400 });
  }

  // The linked session: this patient's, this therapist's own, a video
  // session, confirmed or completed.
  let appointmentId: string | null = null;
  if (body.appointmentId !== undefined && body.appointmentId !== null && body.appointmentId !== "") {
    if (typeof body.appointmentId !== "string") return NextResponse.json({ error: "appointmentId must be a session id." }, { status: 400 });
    const { data: appt, error: apptError } = await admin
      .from("appointments")
      .select("id, patient_id, therapist_id, status, visit_mode")
      .eq("id", body.appointmentId)
      .maybeSingle();
    if (apptError && apptError.code !== "22P02") return couldNotCheck();
    if (!appt || appt.patient_id !== patientId) return NextResponse.json({ error: "No such session for this patient." }, { status: 400 });
    if (appt.therapist_id !== therapistId) {
      return NextResponse.json({ error: "An assessment can only be filed against your own session." }, { status: 403 });
    }
    if (appt.visit_mode === "home_visit") {
      return NextResponse.json({ error: "A guided video assessment belongs to a video session, not a home visit.", code: "not_video" }, { status: 400 });
    }
    if (appt.status !== "confirmed" && appt.status !== "completed") {
      return NextResponse.json({ error: "That session is not confirmed or completed." }, { status: 400 });
    }
    appointmentId = appt.id as string;
  }

  const inProgressResponse = async () => {
    const active = await loadActiveRun(admin, patientId);
    if (active.status === "not_migrated") return databaseNotReady();
    if (active.status !== "ok") return couldNotCheck();
    if (!active.run) return null;
    return NextResponse.json(
      {
        error:
          active.run.therapistId === therapistId
            ? "An assessment is already in progress for this patient. Carry on with it, or end it first."
            : "Another physiotherapist has an assessment in progress for this patient.",
        code: "run_in_progress",
        runId: active.run.therapistId === therapistId ? active.run.id : null,
        protocolKey: active.run.protocolKey,
        startedAt: active.run.startedAt,
        yours: active.run.therapistId === therapistId,
      },
      { status: 409 }
    );
  };
  const existing = await inProgressResponse();
  if (existing) return existing;

  const { data: inserted, error: insertError } = await admin
    .from("assessment_runs")
    .insert({
      patient_id: patientId,
      appointment_id: appointmentId,
      therapist_id: therapistId,
      protocol_key: protocol.key,
      protocol_version: protocol.version,
      profile_kind: kind.profileKind,
    })
    .select(ASSESSMENT_RUN_SELECT)
    .single();
  if (insertError) {
    // Two starts at once: the partial unique index lets one in and this
    // caller is answered with it.
    if (insertError.code === "23505") return (await inProgressResponse()) ?? couldNotCheck();
    if (insertError.code === "42P01" || insertError.code === "PGRST205") return databaseNotReady();
    return serverError("therapist/assessment-runs/start", insertError);
  }
  const run = parseRunRow(inserted);
  if (!run) return serverError("therapist/assessment-runs/start", new Error("inserted run did not parse"));

  // The companion opens on step 1, getting ready. A failure here costs the
  // patient's screen until the next step change, never the run.
  const first = buildLiveDisplay({ protocol, step: redFlagStep(protocol), phase: "ready", startClock: false });
  const display = first.ok ? await writeLiveDisplay(admin, run, first.write) : { ok: false as const };

  await recordUserActivity(admin, {
    action: "assessment_run.started",
    actor: { id: therapistId, role: "therapist" },
    patientId,
    therapistId,
    appointmentId,
    details: { runId: run.id, protocolKey: protocol.key },
  });

  return NextResponse.json({ success: true, run, displayWritten: display.ok });
}
