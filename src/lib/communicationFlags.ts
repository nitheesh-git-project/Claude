import type { createAdminClient } from "@/lib/supabase/admin";
import {
  scanForContactLeaks,
  hasBlockingLeak,
  blockingLeakMessage,
  type LeakFinding,
} from "@/lib/contactLeakScan";
import { isContactScanMode, type ContactScanMode } from "@/lib/adminSettings";

/**
 * Where a piece of cross-role text was written. Matches the CHECK on
 * communication_flags.surface -- a value that is not in that list is a
 * write that fails, which is deliberate: a new free-text field between two
 * roles should not be able to skip the scanner by inventing a name.
 */
export type CommunicationSurface =
  | "session_suggestion_note"
  | "care_plan_rationale"
  | "care_plan_instructions"
  | "pain_assessment_answer"
  | "appointment_notes"
  | "condition_answer";

/** Longest fragment of the original text kept as evidence. */
const MAX_EVIDENCE_CHARS = 2000;

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * The scanner's mode, read on its own.
 *
 * Isolated from SITE_SETTINGS_SELECT on purpose, per the
 * migration-dependent-column rule: a database that has not run the latest
 * schema.sql should fall back to the default rather than fail the write it
 * is guarding. Failing *open* here is the right direction — refusing every
 * therapist's note because a settings column is missing would be a far
 * worse outage than a day of unscanned text.
 */
export async function readContactScanMode(admin: AdminClient): Promise<ContactScanMode> {
  try {
    const { data } = await admin
      .from("site_settings")
      .select("contact_scan_mode")
      .maybeSingle();
    return isContactScanMode(data?.contact_scan_mode)
      ? data.contact_scan_mode
      : "flag_and_block";
  } catch {
    return "flag_and_block";
  }
}

export type ScanSubject = {
  surface: CommunicationSurface;
  text: string | null | undefined;
};

export type ScanOutcome = {
  /** Set when the write must be refused, already worded for the writer. */
  blockedMessage: string | null;
  /**
   * One entry per offending subject, carrying the text it was found in.
   *
   * The text travels with the finding rather than being looked up by
   * surface afterwards, because several subjects legitimately share one
   * surface -- a Pain Map exam posts a dozen answers, all
   * `pain_assessment_answer` -- and a lookup by surface would file every
   * one of them under the last answer's words.
   */
  findings: { surface: CommunicationSurface; text: string; findings: LeakFinding[] }[];
};

/**
 * Scans every string a write is about to persist, in one pass.
 *
 * Takes the whole set rather than one string at a time so a submission with
 * a rationale and an instruction produces one decision and one row per
 * offending field, instead of two round trips and a half-written record.
 */
export function scanCommunication(
  subjects: ScanSubject[],
  mode: ContactScanMode
): ScanOutcome {
  if (mode === "off") return { blockedMessage: null, findings: [] };

  const findings = subjects
    .map((s) => ({
      surface: s.surface,
      text: s.text ?? "",
      findings: scanForContactLeaks(s.text),
    }))
    .filter((f) => f.findings.length > 0);

  const all = findings.flatMap((f) => f.findings);
  const blockedMessage =
    mode === "flag_and_block" && hasBlockingLeak(all) ? blockingLeakMessage(all) : null;

  return { blockedMessage, findings };
}

/**
 * Writes the evidence.
 *
 * Best-effort and never throws, the same posture recordAdminActivity takes:
 * a failure to record a suspicion must not fail the clinical write it was
 * observing. A blocked write still records — that row is the more
 * interesting of the two, since it is the only trace a refused message
 * leaves anywhere.
 */
export async function recordCommunicationFlags(
  admin: AdminClient,
  outcome: ScanOutcome,
  context: {
    authorId: string;
    authorRole: "patient" | "therapist" | "hospital" | "admin";
    patientId?: string | null;
    blocked: boolean;
  }
): Promise<void> {
  if (outcome.findings.length === 0) return;
  try {
    const rows = outcome.findings.map((f) => ({
      surface: f.surface,
      author_id: context.authorId,
      author_role: context.authorRole,
      patient_id: context.patientId ?? null,
      tier: f.findings.some((x) => x.tier === "block") ? "block" : "flag",
      findings: f.findings,
      blocked: context.blocked,
      content: f.text.slice(0, MAX_EVIDENCE_CHARS) || null,
    }));
    await admin.from("communication_flags").insert(rows);
  } catch (error) {
    console.error("Could not record communication flags", error);
  }
}

/**
 * The whole control in one call, for the common case: scan, record, and
 * say whether to refuse.
 *
 * Routes use this rather than the three pieces so the recording cannot be
 * forgotten on the blocking path — which is exactly the path where the
 * evidence matters most.
 */
export async function guardCommunication(
  admin: AdminClient,
  subjects: ScanSubject[],
  context: {
    authorId: string;
    authorRole: "patient" | "therapist" | "hospital" | "admin";
    patientId?: string | null;
    /**
     * "record_only" scans and files the evidence but never refuses the
     * write. It exists for the patient's own booking notes: a patient
     * asking to be called on a number before a home visit is doing a
     * normal thing, and refusing them at the last step of checkout would
     * cost a real booking to catch a leak the clinic is not the victim of.
     * The therapist→patient direction is the one worth blocking.
     */
    enforcement?: "block" | "record_only";
  }
): Promise<{ blockedMessage: string | null }> {
  const mode = await readContactScanMode(admin);
  const outcome = scanCommunication(subjects, mode);
  if (outcome.findings.length === 0) return { blockedMessage: null };

  const blockedMessage =
    context.enforcement === "record_only" ? null : outcome.blockedMessage;

  await recordCommunicationFlags(admin, outcome, {
    ...context,
    blocked: blockedMessage !== null,
  });

  return { blockedMessage };
}
