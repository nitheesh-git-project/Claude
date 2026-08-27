import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  mergeIntakeQuestionOverrides,
  questionsForSpecialty,
  type IntakeQuestion,
  type IntakeQuestionOverrideRow,
} from "@/lib/conditionIntake";
import {
  DEFAULT_CONDITION_SPECIALTY,
  parseConditionSpecialty,
  type ConditionSpecialty,
} from "@/lib/conditionSpecialty";

// Server-side helpers every condition-profile route and page needs, in one
// place so seven call sites cannot grow seven slightly different copies of
// "which question set is this patient's, and what has the admin reworded".

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyClient = SupabaseClient<any, any, any>;

export type ConditionProfileCore = {
  exists: boolean;
  specialty: ConditionSpecialty;
  /** True once a specialty has actually been chosen by a therapist, as
   *  opposed to the column's ortho default on a row that predates the
   *  choice or was created by an autosave. */
  specialtyChosen: boolean;
  data: Record<string, string>;
  draftData: Record<string, string> | null;
  status: string;
  /** The version token for the compare-and-set in /onboard. */
  updatedAt: string | null;
};

/** Reads the profile plus its specialty. `specialty` and `triage_data` are
 *  new columns, so they go in their own call and are merged in -- a live
 *  database may not have them yet, and one unknown-column error must not
 *  blank the answers, the status and the draft along with them (the rule
 *  sessionCode.ts documents). */
export async function loadConditionProfileCore(
  admin: AnyClient,
  patientId: string
): Promise<ConditionProfileCore> {
  const [{ data: base }, { data: specialtyRow }] = await Promise.all([
    admin
      .from("patient_condition_profiles")
      .select("data, draft_data, status, updated_at")
      .eq("patient_id", patientId)
      .maybeSingle(),
    admin
      .from("patient_condition_profiles")
      .select("specialty")
      .eq("patient_id", patientId)
      .maybeSingle(),
  ]);

  const data = (base?.data as Record<string, string> | null) ?? {};
  // "A therapist has chosen this" is "there is a record on file", not "the
  // column is non-null" -- the column defaults to ortho, and an autosaved
  // draft creates the row before anyone has decided anything.
  const hasRecord = Object.values(data).some((v) => typeof v === "string" && v.trim());

  return {
    exists: !!base,
    specialty: parseConditionSpecialty(specialtyRow?.specialty),
    specialtyChosen: hasRecord,
    data,
    draftData: (base?.draft_data as Record<string, string> | null) ?? null,
    status: (base?.status as string | null) ?? "not_started",
    updatedAt: (base?.updated_at as string | null) ?? null,
  };
}

/** The specialty's question list with the admin's wording and
 *  required-ness overrides applied. */
export async function loadMergedIntakeQuestions(
  admin: AnyClient,
  specialty: ConditionSpecialty = DEFAULT_CONDITION_SPECIALTY
): Promise<IntakeQuestion[]> {
  const { data: rows } = await admin
    .from("intake_question_templates")
    .select("question_key, question_text, required, specialty");
  return mergeIntakeQuestionOverrides(
    questionsForSpecialty(specialty),
    (rows ?? []) as IntakeQuestionOverrideRow[],
    specialty
  );
}

/** Which specialties triage may offer. Read on its own for the usual
 *  migration-tolerance reason, and failing OPEN rather than closed: a
 *  missing column must not make every specialty unavailable and leave a
 *  clinician unable to onboard anyone. */
export async function readEnabledSpecialties(admin: AnyClient): Promise<ConditionSpecialty[]> {
  const { data } = await admin
    .from("site_settings")
    .select("enabled_intake_specialties")
    .eq("id", true)
    .maybeSingle();
  const raw = data?.enabled_intake_specialties;
  if (!Array.isArray(raw)) return ["ortho", "neuro", "pediatrics"];
  const parsed = raw.filter((v): v is ConditionSpecialty =>
    v === "ortho" || v === "neuro" || v === "pediatrics"
  );
  // Never empty, and ortho is always available: an admin cannot switch off
  // every specialty and leave triage with nothing to pick.
  return parsed.length > 0 ? Array.from(new Set(["ortho" as const, ...parsed])) : ["ortho", "neuro", "pediatrics"];
}
