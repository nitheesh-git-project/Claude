import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";
import { chartReadFrom, type ChartRead } from "@/lib/exerciseChart";
import { loadExercisePlanHistory, loadPatientTeachingEvents } from "@/lib/exercisePlanServer";

// The Home exercises chart read, shared by the therapist's chart and the
// admin's patient detail: every version and every mark (admin client, after the
// caller's own access check), the names of who taught, and the chart's one
// answer -- ok / not set up / could not read. Never "none yet" for a failed read.
export async function loadHomeExercisesChartRead(admin: ReturnType<typeof createAdminClient>, patientId: string): Promise<ChartRead> {
  const [history, marks] = await Promise.all([loadExercisePlanHistory(admin, patientId), loadPatientTeachingEvents(admin, patientId)]);
  const names = new Map<string, string>();
  if (history.status === "ok" && marks.status === "ok") {
    const ids = [...new Set([...history.plans.map((p) => p.authoredBy), ...marks.events.map((e) => e.actor)])];
    if (ids.length > 0) {
      const { data, error } = await admin.from("profiles").select("id, full_name").in("id", ids);
      if (!error) for (const p of data ?? []) names.set(p.id as string, p.full_name as string);
    }
  }
  return chartReadFrom(history, marks, names);
}
