import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { IntakeTrendRow } from "@/lib/healthProfileSummary";

// Reads two or more Health Profile loaders share (phase 6a: the geriatric and
// cardiopulmonary loaders). Each is its own call and answers ok or
// unreadable -- an unreadable read is never "none yet".

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyClient = SupabaseClient<any, any, any>;

export type IntakeHistoryRead = { status: "ok"; rows: IntakeTrendRow[] } | { status: "unreadable" };

/** The approved intake submissions, oldest first, through `client` (RLS is
 *  the authorisation): when an answer was first given, and an answer over
 *  time. */
export async function loadIntakeHistory(client: AnyClient, patientId: string): Promise<IntakeHistoryRead> {
  try {
    const { data, error } = await client
      .from("condition_change_requests")
      .select("proposed_data, submitted_by_role, reviewed_at, created_at, status")
      .eq("patient_id", patientId)
      .eq("status", "approved")
      .order("created_at", { ascending: true });
    if (error) return { status: "unreadable" };
    return { status: "ok", rows: (data ?? []) as IntakeTrendRow[] };
  } catch {
    return { status: "unreadable" };
  }
}

export type PersonFactsRead =
  | { status: "ok"; birthDate: string | null; gender: string | null }
  | { status: "unreadable" };

/**
 * The patient's date of birth and gender (`profiles`), for the age-and-sex
 * norms (the chair stand) and the predicted walk. Read with the admin client
 * because a therapist's session cannot read a patient's profile row; the
 * caller has already authorised the page. Only the shapers see the date --
 * the views carry the age.
 */
export async function loadPersonFacts(admin: AnyClient, patientId: string): Promise<PersonFactsRead> {
  try {
    const { data, error } = await admin.from("profiles").select("date_of_birth, gender").eq("id", patientId).maybeSingle();
    if (error) return { status: "unreadable" };
    return {
      status: "ok",
      birthDate: typeof data?.date_of_birth === "string" ? data.date_of_birth : null,
      gender: typeof data?.gender === "string" ? data.gender : null,
    };
  } catch {
    return { status: "unreadable" };
  }
}
