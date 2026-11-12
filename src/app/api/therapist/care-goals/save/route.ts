import { NextRequest, NextResponse } from "next/server";
import { recordUserActivity } from "@/lib/userActivityLog";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { guardCommunication } from "@/lib/communicationFlags";
import { serverError } from "@/lib/apiError";
import { requireAssignedTherapist, requireSignedInUser } from "@/lib/therapistClinicalGate";
import { loadPatientProfileKind } from "@/lib/outcomeServer";
import { CARE_GOAL_SELECT, parseCareGoalRow, validateGoalFields, type CareGoal } from "@/lib/careGoals";

// The assigned therapist writes the patient's goal -- in the patient's own
// words ("Play badminton with my friends on weekends again") -- or edits,
// achieves or closes it. One goal is active at a time (a partial unique
// index on care_goals); a second is refused with the id of the one in the
// way rather than silently closing it, so nothing the patient reads at the
// top of their profile changes without the therapist choosing it.
//
// Gate: assigned under the clinical-access rule, the mirror of
// care_goals_insert_assigned_therapist / _update_ -- planning needs no
// started session (recording a measurement does). The goal's profile kind
// is re-derived on the server (profileKindFor), never sent. The text
// reaches the patient, so it is scanned (care_goal_text). A goal is never
// deleted: closing it keeps its milestones as the record of what was
// planned and reached.
//
// Request:  { patientId: string, goalId?: string,
//             goal: { goalText?: string, targetDate?: "YYYY-MM-DD" | null,
//                     status?: "active" | "achieved" | "closed" },
//             expectedUpdatedAt?: string }
//           No goalId creates (goalText required, status active); a goalId
//           edits the keys sent. expectedUpdatedAt, when sent, is the
//           goal's updatedAt as the screen read it.
// Response: 200 { success: true, goal: CareGoal }
//           400 validation, 403 not assigned, 404 no such goal,
//           409 { code: "active_goal_exists", activeGoalId } |
//               { code: "stale" } | { code: "no_condition_profile" },
//           503 a check that could not be run.
export async function POST(request: NextRequest) {
  const who = await requireSignedInUser();
  if (!who.ok) return who.response;

  const { data: body, error: parseError } = await parseJsonBody<{
    patientId?: unknown;
    goalId?: unknown;
    goal?: unknown;
    expectedUpdatedAt?: unknown;
  }>(request);
  if (parseError) return parseError;
  const patientId = typeof body.patientId === "string" ? body.patientId.trim() : "";
  if (!patientId) return NextResponse.json({ error: "Missing patientId" }, { status: 400 });
  const goalId = typeof body.goalId === "string" && body.goalId.trim() ? body.goalId.trim() : null;
  if (body.goalId !== undefined && body.goalId !== null && !goalId) {
    return NextResponse.json({ error: "goalId must be a goal id." }, { status: 400 });
  }
  const expectedUpdatedAt = typeof body.expectedUpdatedAt === "string" ? body.expectedUpdatedAt : null;

  const gate = await requireAssignedTherapist(
    who.userId,
    patientId,
    "You can only set goals for a patient you've been assigned to."
  );
  if (!gate.ok) return gate.response;
  const { admin, therapistId } = gate;

  let existing: CareGoal | null = null;
  if (goalId) {
    const { data, error } = await admin
      .from("care_goals")
      .select(CARE_GOAL_SELECT)
      .eq("id", goalId)
      .eq("patient_id", patientId)
      .maybeSingle();
    if (error && error.code !== "22P02") {
      return NextResponse.json({ error: "We couldn't read this goal just now. Please try again." }, { status: 503 });
    }
    existing = parseCareGoalRow(data);
    if (!existing) return NextResponse.json({ error: "No such goal for this patient." }, { status: 404 });
  }

  const validated = validateGoalFields(body.goal, existing);
  if (!validated.ok) return NextResponse.json({ error: validated.error }, { status: 400 });
  const fields = validated.value;

  if (!existing || fields.goalText !== existing.goalText) {
    const leak = await guardCommunication(admin, [{ surface: "care_goal_text", text: fields.goalText }], {
      authorId: therapistId,
      authorRole: "therapist",
      patientId,
    });
    if (leak.blockedMessage) return NextResponse.json({ error: leak.blockedMessage }, { status: 400 });
  }

  const activeGoalConflict = async () => {
    const { data } = await admin
      .from("care_goals")
      .select("id")
      .eq("patient_id", patientId)
      .eq("status", "active")
      .maybeSingle();
    return NextResponse.json(
      {
        error: "This patient already has an active goal. Mark it achieved or closed before setting a new one.",
        code: "active_goal_exists",
        activeGoalId: (data?.id as string | undefined) ?? null,
      },
      { status: 409 }
    );
  };

  if (!existing) {
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
    const { data, error } = await admin
      .from("care_goals")
      .insert({
        patient_id: patientId,
        profile_kind: kind.profileKind,
        goal_text: fields.goalText,
        target_date: fields.targetDate,
        status: "active",
        authored_by: therapistId,
        authored_by_role: "therapist",
      })
      .select(CARE_GOAL_SELECT)
      .single();
    if (error) {
      if (error.code === "23505") return activeGoalConflict();
      return serverError("therapist/care-goals/save", error);
    }
    await recordUserActivity(admin, {
      action: "care_goal.saved",
      actor: { id: therapistId, role: "therapist" },
      patientId,
      therapistId,
    });
    return NextResponse.json({ success: true, goal: parseCareGoalRow(data) });
  }

  let update = admin
    .from("care_goals")
    .update({ goal_text: fields.goalText, target_date: fields.targetDate, status: fields.status })
    .eq("id", existing.id)
    .eq("patient_id", patientId);
  if (expectedUpdatedAt) update = update.eq("updated_at", expectedUpdatedAt);
  const { data, error } = await update.select(CARE_GOAL_SELECT).maybeSingle();
  if (error) {
    if (error.code === "23505") return activeGoalConflict();
    return serverError("therapist/care-goals/save", error);
  }
  if (!data) {
    return NextResponse.json(
      { error: "Someone changed this goal a moment ago. Refresh to see it before saving again.", code: "stale" },
      { status: 409 }
    );
  }
  await recordUserActivity(admin, {
    action: "care_goal.saved",
    actor: { id: therapistId, role: "therapist" },
    patientId,
    therapistId,
  });
  return NextResponse.json({ success: true, goal: parseCareGoalRow(data) });
}
