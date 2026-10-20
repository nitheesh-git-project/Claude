import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadCareStatus, loadEnabledLicensedMeasures, loadGoalAndMilestones, loadMeasurements } from "@/lib/outcomeServer";
import type { OrthoReads } from "@/lib/orthoProfileView";
import type { LicensedMeasuresRead } from "@/lib/licensedMeasures";

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyClient = SupabaseClient<any, any, any>;

/**
 * The three reads behind the orthopaedic Health Profile's progress cards,
 * each its own call (a failed one degrades its own card - unreadable is never
 * "none yet") and run together. `client` is whoever is looking: the patient's
 * own session, the assigned therapist's, or the admin client - RLS (or the
 * admin's own gate) is the authorisation, as it is for the Pain Map.
 * Orthopaedic pages only: a neurological or paediatric page must not make
 * these calls, same as it never queries pain_assessments.
 */
export async function loadOrthoReads(client: AnyClient, patientId: string): Promise<Omit<OrthoReads, "assessments"> & { nowMs: number }> {
  const [measurements, goals, careStatus] = await Promise.all([
    loadMeasurements(client, patientId),
    loadGoalAndMilestones(client, patientId),
    loadCareStatus(client, patientId, { profileKind: "ortho" }),
  ]);
  return {
    // Read here, not in a page: "overdue" is judged on the clinic's calendar at the moment of the read.
    nowMs: Date.now(),
    measurements,
    goals,
    careStatus: careStatus.status === "ok" ? { status: "ok", events: careStatus.events } : { status: "unreadable" },
  };
}

/** The licence switch, for the viewers who can record a test (the dialog lists a licensed scale only as off). */
export async function loadLicenceForRecording(admin: AnyClient): Promise<{ keys: string[]; unreadable: boolean }> {
  const read: LicensedMeasuresRead = await loadEnabledLicensedMeasures(admin);
  return read.status === "ok" ? { keys: read.keys, unreadable: false } : { keys: [], unreadable: true };
}
