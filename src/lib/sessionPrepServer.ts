import type { SupabaseClient } from "@supabase/supabase-js";
import { parseConditionSpecialty } from "@/lib/conditionSpecialty";
import { profileKindFor } from "@/lib/profileKind";
import { PREP_LEAD_MS, prepListFor, prepListForProtocol, prepWindowOpen, type PrepList, type Readiness } from "@/lib/sessionPrep";

// Reads for the guided check's get-ready list (phase 2, P1). The patient's
// side uses the patient's own client (RLS on appointments and
// patient_condition_profiles is the gate); the therapist's start screen uses
// the service role after the page's own assigned-therapist guard.
// `patient_ready_at` is migration-dependent, so it is read in its own call
// and a database without it shows the list with no "ready" state rather than
// nothing.

export type PatientPrep =
  | { status: "none" }
  | { status: "ok"; appointmentId: string; slotTime: string; list: PrepList; readyAt: string | null };

/** The patient's next video session whose get-ready list is open now, with
 *  the list for their condition type and whether they already said ready.
 *  Any failed read shows no card: the list is a help, never a claim. */
export async function loadPatientPrep(supabase: SupabaseClient, patientId: string, nowMs: number): Promise<PatientPrep> {
  try {
    const from = new Date(nowMs - 4 * 60 * 60 * 1000).toISOString();
    const to = new Date(nowMs + PREP_LEAD_MS).toISOString();
    const { data: rows, error } = await supabase
      .from("appointments")
      .select("id, slot_time, duration_minutes, visit_mode, status")
      .eq("patient_id", patientId)
      .eq("status", "confirmed")
      .gte("slot_time", from)
      .lte("slot_time", to)
      .order("slot_time", { ascending: true })
      .limit(10);
    if (error || !rows) return { status: "none" };
    const next = rows.find(
      (r) => (r.visit_mode ?? "online") === "online" && typeof r.slot_time === "string" && prepWindowOpen(r.slot_time, r.duration_minutes as number | null, nowMs)
    );
    if (!next) return { status: "none" };

    const [profileRead, readyRead] = await Promise.all([
      supabase.from("patient_condition_profiles").select("specialty, data").eq("patient_id", patientId).maybeSingle(),
      supabase.from("appointments").select("patient_ready_at").eq("id", next.id).maybeSingle(),
    ]);
    const list = profileRead.error
      ? null
      : profileRead.data
        ? prepListFor(profileKindFor(parseConditionSpecialty(profileRead.data.specialty), (profileRead.data.data ?? {}) as Record<string, unknown>))
        : prepListForProtocol("ortho_general");
    if (!list) return { status: "none" };
    const readyAt = !readyRead.error && typeof readyRead.data?.patient_ready_at === "string" ? readyRead.data.patient_ready_at : null;
    return { status: "ok", appointmentId: next.id as string, slotTime: next.slot_time as string, list, readyAt };
  } catch {
    return { status: "none" };
  }
}

/**
 * What the therapist's start screen says about the list: the named session
 * when the page was opened from one, else this therapist's session with the
 * patient that is on now or next today. "unknown" when a read failed or the
 * column is not there yet.
 */
export async function loadPatientReadiness(
  admin: SupabaseClient,
  input: { therapistId: string; patientId: string; appointmentId: string | null; nowMs: number }
): Promise<Readiness> {
  try {
    let id = input.appointmentId;
    if (!id) {
      const { data, error } = await admin
        .from("appointments")
        .select("id, visit_mode")
        .eq("patient_id", input.patientId)
        .eq("therapist_id", input.therapistId)
        .eq("status", "confirmed")
        .gte("slot_time", new Date(input.nowMs - 4 * 60 * 60 * 1000).toISOString())
        .lte("slot_time", new Date(input.nowMs + 12 * 60 * 60 * 1000).toISOString())
        .order("slot_time", { ascending: true })
        .limit(5);
      if (error) return { status: "unknown" };
      id = (data ?? []).find((r) => (r.visit_mode ?? "online") === "online")?.id ?? null;
      if (!id) return { status: "no_session" };
    }
    const { data, error } = await admin
      .from("appointments")
      .select("patient_ready_at")
      .eq("id", id)
      .eq("patient_id", input.patientId)
      .eq("therapist_id", input.therapistId)
      .maybeSingle();
    if (error) return { status: "unknown" };
    if (!data) return { status: "no_session" };
    return typeof data.patient_ready_at === "string" ? { status: "ready", at: data.patient_ready_at } : { status: "not_yet" };
  } catch {
    return { status: "unknown" };
  }
}
