import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseAreaPain } from "@/lib/conditionIntake";
import { examSideDiffers, examSideMismatchMessage, reportedSides, type ExamSide } from "@/lib/examSide";

/**
 * The route half of the exam-side rule (examSide.ts): refuse an exam on a
 * side the patient did not report unless the request says the therapist
 * confirmed it. Returns the 409 body to send, or null to go ahead.
 *
 * The patient's intake could not be read -> null (go ahead): the form has
 * already applied the same rule whenever it had the answers, and refusing
 * every exam over a failed read would stop a clinician recording one at all.
 */
export async function examSideRefusal(
  admin: SupabaseClient,
  input: { patientId: string; region: string; side: string; confirmed: boolean }
): Promise<{ error: string; code: "exam_side_unconfirmed" } | null> {
  if (input.confirmed) return null;
  if (input.side !== "left" && input.side !== "right") return null;
  try {
    const { data, error } = await admin
      .from("patient_condition_profiles")
      .select("data")
      .eq("patient_id", input.patientId)
      .maybeSingle();
    if (error || !data) return null;
    const answers = ((data as { data?: unknown }).data ?? {}) as Record<string, unknown>;
    const areas = parseAreaPain(typeof answers.area_pain === "string" ? answers.area_pain : null);
    const side = input.side as ExamSide;
    if (!examSideDiffers(input.region, side, areas)) return null;
    return {
      error: examSideMismatchMessage(side, reportedSides(input.region, areas)),
      code: "exam_side_unconfirmed",
    };
  } catch {
    return null;
  }
}
