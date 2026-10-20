import { NextRequest, NextResponse } from "next/server";
import { recordUserActivity } from "@/lib/userActivityLog";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { guardCommunication } from "@/lib/communicationFlags";
import { serverError } from "@/lib/apiError";
import { serverNowMs } from "@/lib/debugClock";
import { requireAssignedTherapist, requireSignedInUser, requireStartedSession } from "@/lib/therapistClinicalGate";
import { loadEnabledLicensedMeasures, loadPatientProfileKind } from "@/lib/outcomeServer";
import { enabledLicensedSet } from "@/lib/licensedMeasures";
import { measurementSource, outcomeMeasure } from "@/lib/outcomeMeasures";
import { OUTCOME_MEASUREMENT_SELECT, parseMeasurementRow } from "@/lib/outcomeSeries";
import {
  CARE_GOAL_SELECT,
  CARE_MILESTONE_SELECT,
  measurementProvesMilestone,
  milestoneFieldsToRow,
  parseCareGoalRow,
  parseCareMilestoneRow,
  validateMilestoneFields,
  type CareMilestone,
} from "@/lib/careGoals";

// The assigned therapist plans the steps towards the patient's goal and
// marks them reached (src/lib/milestones.ts, careGoals.ts).
//
// Three actions:
//   - "create": a milestone under the patient's ACTIVE goal, planned or
//     working (a starter template is copied by the screen and edited first;
//     its key travels as templateKey).
//   - "update": the plan of a milestone that is not reached -- the keys
//     sent, merged onto the stored row and re-validated as a whole. A
//     reached milestone is not edited here: "reached" is the one fact on it
//     (the care_milestones_guard trigger), and its wording is what was
//     reached. A mistaken one is reopened by the clinic, with a reason
//     (/api/admin/care-milestones/reopen).
//   - "mark_reached": the one way to "reached". A milestone with a
//     measurable target stored in outcome_measurements needs the proving
//     measurement's id: this patient's, exactly the linked measure, variant
//     and side, and a value that meets the target (measurementProvesMilestone
//     -- the maths deriveMilestone uses to offer the button). reached_at is
//     that measurement's measured_at. A milestone described in words, or
//     linked to a measure the Pain Map or the neurological exam holds, is
//     reached on the physiotherapist's judgement, with no measurement id,
//     at the time of the request. Both need a started or delivered session
//     (like recording a measurement): reaching is an observation.
//
// Gate: assigned under the clinical-access rule (the mirror of the
// care_milestones_* RLS policies); profile kind re-derived on the server;
// title and criterion scanned (care_milestone_text). Writes are
// compare-and-set: an update matches the row's updated_at when the screen
// sends expectedUpdatedAt, and every write matches reached_at is null.
//
// Request:  { patientId: string,
//             action: "create" | "update" | "mark_reached",
//             goalId?: string,           -- create
//             milestoneId?: string,      -- update, mark_reached
//             milestone?: MilestoneInput -- create, update (careGoals.ts)
//             measurementId?: string | null, -- mark_reached
//             expectedUpdatedAt?: string }   -- update
// Response: 200 { success: true, milestone: CareMilestone }
//           400 validation, 403 not assigned, 404 no such goal / milestone
//           / measurement, 409 { code: "goal_not_active" | "milestone_reached"
//           | "stale" | "session_not_started" | "no_condition_profile" },
//           503 a check that could not be run.
export async function POST(request: NextRequest) {
  const who = await requireSignedInUser();
  if (!who.ok) return who.response;

  const { data: body, error: parseError } = await parseJsonBody<{
    patientId?: unknown;
    action?: unknown;
    goalId?: unknown;
    milestoneId?: unknown;
    milestone?: unknown;
    measurementId?: unknown;
    expectedUpdatedAt?: unknown;
  }>(request);
  if (parseError) return parseError;
  const patientId = typeof body.patientId === "string" ? body.patientId.trim() : "";
  if (!patientId) return NextResponse.json({ error: "Missing patientId" }, { status: 400 });
  const action = body.action;
  if (action !== "create" && action !== "update" && action !== "mark_reached") {
    return NextResponse.json({ error: "action must be create, update or mark_reached." }, { status: 400 });
  }
  const idOf = (raw: unknown) => (typeof raw === "string" && raw.trim() ? raw.trim() : null);
  const requestedMilestoneId = idOf(body.milestoneId);

  const gate = await requireAssignedTherapist(
    who.userId,
    patientId,
    "You can only plan milestones for a patient you've been assigned to."
  );
  if (!gate.ok) return gate.response;
  const { admin, therapistId } = gate;

  const kind = await loadPatientProfileKind(admin, patientId);
  if (kind.status === "unreadable") {
    return NextResponse.json({ error: "We couldn't read this patient's record just now. Please try again." }, { status: 503 });
  }
  if (kind.status === "no_profile") {
    return NextResponse.json(
      {
        error: "This patient's condition type has not been recorded yet. Record it on their Health Profile first.",
        code: "no_condition_profile",
      },
      { status: 409 }
    );
  }
  const profileKind = kind.profileKind;
  const unreadable = (what: string) =>
    NextResponse.json({ error: `We couldn't read ${what} just now. Please try again.` }, { status: 503 });

  async function loadMilestone(): Promise<{ milestone: CareMilestone } | { response: NextResponse }> {
    const milestoneId = requestedMilestoneId;
    if (!milestoneId) return { response: NextResponse.json({ error: "Missing milestoneId" }, { status: 400 }) };
    const { data, error } = await admin
      .from("care_milestones")
      .select(CARE_MILESTONE_SELECT)
      .eq("id", milestoneId)
      .eq("patient_id", patientId)
      .maybeSingle();
    if (error && error.code !== "22P02") return { response: unreadable("this milestone") };
    const milestone = parseCareMilestoneRow(data);
    if (!milestone) return { response: NextResponse.json({ error: "No such milestone for this patient." }, { status: 404 }) };
    return { milestone };
  }

  const reachedRefusal = () =>
    NextResponse.json(
      {
        error: "This milestone is marked reached, so it stays as it was. If that was a mistake, ask the clinic to reopen it.",
        code: "milestone_reached",
      },
      { status: 409 }
    );

  // --- mark_reached ------------------------------------------------------------------
  if (action === "mark_reached") {
    const loaded = await loadMilestone();
    if ("response" in loaded) return loaded.response;
    const { milestone } = loaded;
    if (milestone.reachedAt !== null || milestone.status === "reached") return reachedRefusal();

    const notStarted = await requireStartedSession(
      admin,
      therapistId,
      patientId,
      serverNowMs(request),
      "A milestone is marked reached from a session you've started with this patient. Open this once your session with them begins."
    );
    if (notStarted) return notStarted;

    const measurementId = idOf(body.measurementId);
    const provable =
      milestone.linkedMeasureKey !== null &&
      milestone.targetValue !== null &&
      measurementSource(milestone.linkedMeasureKey, profileKind) === "outcome_measurements";

    let reachedAt: string;
    let reachedMeasurementId: string | null = null;
    if (provable) {
      if (!measurementId) {
        return NextResponse.json(
          { error: "Pick the measurement that shows this milestone was reached.", code: "proof_required" },
          { status: 400 }
        );
      }
      const { data, error } = await admin
        .from("outcome_measurements")
        .select(OUTCOME_MEASUREMENT_SELECT)
        .eq("id", measurementId)
        .eq("patient_id", patientId)
        .maybeSingle();
      if (error && error.code !== "22P02") return unreadable("that measurement");
      const point = parseMeasurementRow(data);
      if (!point) return NextResponse.json({ error: "No such measurement for this patient." }, { status: 404 });
      const proof = measurementProvesMilestone(milestone, point);
      if (!proof.ok) return NextResponse.json({ error: proof.error }, { status: 400 });
      reachedAt = point.measuredAt;
      reachedMeasurementId = point.id;
    } else {
      if (measurementId) {
        const linked = milestone.linkedMeasureKey ? outcomeMeasure(milestone.linkedMeasureKey) : null;
        return NextResponse.json(
          {
            error: linked
              ? `${linked.label} for this patient is not recorded as a measurement here, so this milestone is marked reached on your judgement, without one.`
              : "This milestone is described in words, so it is marked reached on your judgement, without a measurement.",
          },
          { status: 400 }
        );
      }
      reachedAt = new Date().toISOString();
    }

    const { data, error } = await admin
      .from("care_milestones")
      .update({ status: "reached", reached_at: reachedAt, reached_measurement_id: reachedMeasurementId })
      .eq("id", milestone.id)
      .eq("patient_id", patientId)
      .is("reached_at", null)
      .select(CARE_MILESTONE_SELECT)
      .maybeSingle();
    if (error) return serverError("therapist/care-milestones/save", error);
    if (!data) return reachedRefusal();

    await recordUserActivity(admin, {
      action: "care_milestone.reached",
      actor: { id: therapistId, role: "therapist" },
      patientId,
      therapistId,
      details: { milestoneId: milestone.id, measurementId: reachedMeasurementId },
    });
    return NextResponse.json({ success: true, milestone: parseCareMilestoneRow(data) });
  }

  // --- create / update ---------------------------------------------------------------
  let existing: CareMilestone | null = null;
  let goalIdForCreate: string | null = null;
  if (action === "update") {
    const loaded = await loadMilestone();
    if ("response" in loaded) return loaded.response;
    existing = loaded.milestone;
    if (existing.reachedAt !== null || existing.status === "reached") return reachedRefusal();
  } else {
    goalIdForCreate = idOf(body.goalId);
    if (!goalIdForCreate) return NextResponse.json({ error: "Missing goalId" }, { status: 400 });
    const { data, error } = await admin
      .from("care_goals")
      .select(CARE_GOAL_SELECT)
      .eq("id", goalIdForCreate)
      .eq("patient_id", patientId)
      .maybeSingle();
    if (error && error.code !== "22P02") return unreadable("this goal");
    const goal = parseCareGoalRow(data);
    if (!goal) return NextResponse.json({ error: "No such goal for this patient." }, { status: 404 });
    if (goal.status !== "active") {
      return NextResponse.json(
        { error: "Milestones are planned under the patient's active goal.", code: "goal_not_active" },
        { status: 409 }
      );
    }
  }

  // A licensed measure the request links to: "couldn't check" is not
  // "switched off", but it switches nothing on (fail closed).
  const licensed = await loadEnabledLicensedMeasures(admin);
  const rawFields = body.milestone && typeof body.milestone === "object" ? (body.milestone as Record<string, unknown>) : null;
  const requestedMeasure =
    typeof rawFields?.linkedMeasureKey === "string" ? outcomeMeasure(rawFields.linkedMeasureKey) : null;
  if (requestedMeasure?.licence === "licensed" && licensed.status === "unreadable") {
    return unreadable(`whether ${requestedMeasure.label} is switched on`);
  }

  const validated = validateMilestoneFields(body.milestone, {
    profileKind,
    existing,
    enabledLicensed: enabledLicensedSet(licensed),
  });
  if (!validated.ok) return NextResponse.json({ error: validated.error }, { status: 400 });
  const fields = validated.value;

  // The title and the criterion reach the patient, so they are scanned --
  // only when they are new text, so an untouched plan is not re-flagged.
  const subjects = [
    !existing || fields.title !== existing.title ? fields.title : null,
    !existing || fields.criterion !== existing.criterion ? fields.criterion : null,
  ]
    .filter((text): text is string => text !== null)
    .map((text) => ({ surface: "care_milestone_text" as const, text }));
  if (subjects.length > 0) {
    const leak = await guardCommunication(admin, subjects, { authorId: therapistId, authorRole: "therapist", patientId });
    if (leak.blockedMessage) return NextResponse.json({ error: leak.blockedMessage }, { status: 400 });
  }

  if (!existing) {
    const { data, error } = await admin
      .from("care_milestones")
      .insert({
        ...milestoneFieldsToRow(fields),
        goal_id: goalIdForCreate,
        patient_id: patientId,
        authored_by: therapistId,
      })
      .select(CARE_MILESTONE_SELECT)
      .single();
    if (error) return serverError("therapist/care-milestones/save", error);
    await recordUserActivity(admin, {
      action: "care_milestone.saved",
      actor: { id: therapistId, role: "therapist" },
      patientId,
      therapistId,
    });
    return NextResponse.json({ success: true, milestone: parseCareMilestoneRow(data) });
  }

  let update = admin
    .from("care_milestones")
    .update(milestoneFieldsToRow(fields))
    .eq("id", existing.id)
    .eq("patient_id", patientId)
    .is("reached_at", null);
  if (typeof body.expectedUpdatedAt === "string") update = update.eq("updated_at", body.expectedUpdatedAt);
  const { data, error } = await update.select(CARE_MILESTONE_SELECT).maybeSingle();
  if (error) return serverError("therapist/care-milestones/save", error);
  if (!data) {
    return NextResponse.json(
      { error: "Someone changed this milestone a moment ago. Refresh to see it before saving again.", code: "stale" },
      { status: 409 }
    );
  }
  await recordUserActivity(admin, {
    action: "care_milestone.saved",
    actor: { id: therapistId, role: "therapist" },
    patientId,
    therapistId,
  });
  return NextResponse.json({ success: true, milestone: parseCareMilestoneRow(data) });
}
