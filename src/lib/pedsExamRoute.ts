import "server-only";
import { NextResponse } from "next/server";
import type { createAdminClient } from "@/lib/supabase/admin";
import { loadPatientProfileKind } from "@/lib/outcomeServer";
import { PEDS_EXAM_VERSION, validatePedsFindings, type PedsFindings } from "@/lib/pedsExam";
import { pedsTodayIso } from "@/lib/pedsAge";
import { serverError } from "@/lib/apiError";

// The half of a paediatric examination write that the therapist's and the
// admin's routes share -- which kind of patient this is, the child's date of
// birth, the validation, and the insert -- written once so neither door can
// store a value the other would refuse (the neurological exam's two routes
// share validateNeuroFindings for the same reason; the measurement routes
// share outcomeMeasurementRoute.ts).

type AdminClient = ReturnType<typeof createAdminClient>;

export const NOT_PAEDIATRIC_MESSAGE =
  "The paediatric examination applies to paediatric profiles. This patient is recorded under a different condition type.";

const SCHEMA_NOT_READY_MESSAGE =
  "This database has not been updated yet, so a paediatric examination cannot be saved. Re-apply supabase/schema.sql, then try again.";

/**
 * Paediatric patients only, re-derived on the server: an exam posted
 * against an orthopaedic or neurological record (or one with no record yet)
 * would be written and shown nowhere -- a 400, the neurological route's
 * rule. "We couldn't check" is a 503, never a fall-back to the column's
 * default. The findings are validated against the clinic's today
 * (`nowMs`, the debug clock's when it is on) and the child's date of birth,
 * so a date first seen in the future or before birth is refused.
 */
export async function preparePedsExam(
  admin: AdminClient,
  patientId: string,
  raw: unknown,
  nowMs: number
): Promise<{ ok: true; findings: PedsFindings } | { ok: false; response: NextResponse }> {
  const kind = await loadPatientProfileKind(admin, patientId);
  if (kind.status === "unreadable") {
    return {
      ok: false,
      response: NextResponse.json({ error: "We couldn't read this patient's record just now. Please try again." }, { status: 503 }),
    };
  }
  if (kind.status === "no_profile" || kind.specialty !== "pediatrics") {
    return { ok: false, response: NextResponse.json({ error: NOT_PAEDIATRIC_MESSAGE, code: "not_paediatric" }, { status: 400 }) };
  }

  const { data: child, error: childError } = await admin.from("profiles").select("date_of_birth").eq("id", patientId).maybeSingle();
  if (childError) {
    return {
      ok: false,
      response: NextResponse.json({ error: "We couldn't check this patient just now. Please try again." }, { status: 503 }),
    };
  }
  const birthDate = typeof child?.date_of_birth === "string" ? child.date_of_birth : null;

  const validated = validatePedsFindings(raw, { todayIso: pedsTodayIso(nowMs), birthDate });
  if (!validated.ok) {
    return { ok: false, response: NextResponse.json({ error: validated.error }, { status: 400 }) };
  }
  return { ok: true, findings: validated.findings };
}

/** The insert, append-only. A database without the table is a 503 that
 *  says so, not a 500. */
export async function insertPedsExam(
  admin: AdminClient,
  row: { patientId: string; submittedBy: string; submittedByRole: "therapist" | "admin"; findings: PedsFindings },
  routeName: string
): Promise<NextResponse | null> {
  const { error } = await admin.from("peds_assessments").insert({
    patient_id: row.patientId,
    submitted_by: row.submittedBy,
    submitted_by_role: row.submittedByRole,
    schema_version: PEDS_EXAM_VERSION,
    findings: row.findings,
  });
  if (!error) return null;
  if (error.code === "42P01" || error.code === "PGRST205") {
    return NextResponse.json({ error: SCHEMA_NOT_READY_MESSAGE }, { status: 503 });
  }
  return serverError(routeName, error);
}

/** The free text the family reads, for the contact scanner. */
export function pedsExamScannedText(findings: PedsFindings): string[] {
  return [findings.notes, findings.equipment].filter((t): t is string => !!t);
}
