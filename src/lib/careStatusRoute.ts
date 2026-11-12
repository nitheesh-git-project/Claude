import "server-only";
import { NextResponse } from "next/server";
import type { createAdminClient } from "@/lib/supabase/admin";
import { guardCommunication } from "@/lib/communicationFlags";
import { serverError } from "@/lib/apiError";
import { loadCareStatus, loadPatientProfileKind } from "@/lib/outcomeServer";
import {
  CARE_STATUS_EVENT_SELECT,
  changeIsNoOp,
  clearHasNothingToEnd,
  parseCareStatusEventRow,
  shapeCareStatus,
  validateCareStatusChange,
  type CareStatusEvent,
  type CareStatusState,
  type CleanCareStatusChange,
} from "@/lib/careStatus";
import type { ProfileKind } from "@/lib/outcomeMeasures";

// The half of a phase / status-override write that the therapist's and the
// admin's routes share (/api/therapist/care-status/set,
// /api/admin/care-status/set), written once so neither door stores what the
// other refuses -- the outcomeMeasurementRoute.ts pattern.
//
// In order: the patient's profile kind, re-derived on the server (409 with
// no condition profile, 503 when it cannot be read); the change, validated
// against that kind (validateCareStatusChange -> validateStatusOverride);
// what is in force now (503 when it cannot be read -- "we couldn't check" is
// not "there is no override"); a no-op answered without a row; a clear with
// nothing to end answered 409; the reason scanned (care_status_reason); and
// the append-only insert.

type AdminClient = ReturnType<typeof createAdminClient>;

export type CareStatusApplied = {
  ok: true;
  change: CleanCareStatusChange;
  profileKind: ProfileKind;
  /** What was in force before this change. */
  previous: CareStatusState;
  /** What is in force after it. `override.stale` is false here: the route
   *  does not read the reviews; the page's loader works it out. */
  state: CareStatusState;
  /** The row written, or null when the change altered nothing. */
  event: CareStatusEvent | null;
  unchanged: boolean;
};

const NO_PROFILE_MESSAGE =
  "This patient's condition type has not been recorded yet, so there are no phases to choose from. Record it on their Health Profile first.";

export async function applyCareStatusChange(
  admin: AdminClient,
  context: string,
  input: { patientId: string; body: unknown; actorId: string; actorRole: "therapist" | "admin" }
): Promise<CareStatusApplied | { ok: false; response: NextResponse }> {
  const kind = await loadPatientProfileKind(admin, input.patientId);
  if (kind.status === "unreadable") {
    return {
      ok: false,
      response: NextResponse.json({ error: "We couldn't read this patient's record just now. Please try again." }, { status: 503 }),
    };
  }
  if (kind.status === "no_profile") {
    return { ok: false, response: NextResponse.json({ error: NO_PROFILE_MESSAGE, code: "no_condition_profile" }, { status: 409 }) };
  }
  const profileKind = kind.profileKind;

  const validated = validateCareStatusChange(input.body, profileKind);
  if (!validated.ok) {
    return {
      ok: false,
      response: NextResponse.json(validated.code ? { error: validated.error, code: validated.code } : { error: validated.error }, { status: 400 }),
    };
  }
  const change = validated.change;

  const current = await loadCareStatus(admin, input.patientId, { profileKind });
  if (current.status === "unreadable") {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "We couldn't check this patient's current phase and status just now. Please try again." },
        { status: 503 }
      ),
    };
  }
  const previous: CareStatusState = { phase: current.phase, override: current.override, summary: current.summary };

  if (changeIsNoOp(change, previous)) {
    return { ok: true, change, profileKind, previous, state: previous, event: null, unchanged: true };
  }
  if (clearHasNothingToEnd(change, previous)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "There is no status override on this profile any more. Refresh to see what it says now.", code: "no_override" },
        { status: 409 }
      ),
    };
  }

  // The reason (or note) is shown to the patient beside the pill or the
  // phase, and the written summary is the patient's to read in full, so
  // both go through the contact scanner like a goal's text.
  const scanned =
    change.kind === "summary"
      ? [{ surface: "care_status_summary" as const, text: change.value }]
      : change.reason
        ? [{ surface: "care_status_reason" as const, text: change.reason }]
        : [];
  if (scanned.length > 0) {
    const leak = await guardCommunication(admin, scanned, {
      authorId: input.actorId,
      authorRole: input.actorRole,
      patientId: input.patientId,
    });
    if (leak.blockedMessage) return { ok: false, response: NextResponse.json({ error: leak.blockedMessage }, { status: 400 }) };
  }

  const { data, error } = await admin
    .from("care_status_events")
    .insert({
      patient_id: input.patientId,
      kind: change.kind,
      value: change.value,
      reason: change.reason,
      profile_kind: profileKind,
      set_by: input.actorId,
      set_by_role: input.actorRole,
    })
    .select(CARE_STATUS_EVENT_SELECT)
    .single();
  if (error) {
    // A database that has not run this phase's schema has no table to write
    // to; saying so beats a 500.
    if (error.code === "42P01" || error.code === "PGRST205") {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "This database has not been updated yet, so the phase, status and summary cannot be saved. Re-apply supabase/schema.sql, then try again." },
          { status: 503 }
        ),
      };
    }
    // The table's own shape CHECK: the caller's to fix -- or, for a summary,
    // a database still on phase 3a's kind list, which says "re-apply" below.
    if (error.code === "23514" && change.kind === "summary" && /kind_check/.test(error.message ?? "")) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "This database has not been updated yet, so a written summary cannot be saved. Re-apply supabase/schema.sql, then try again." },
          { status: 503 }
        ),
      };
    }
    if (error.code === "23514") {
      return { ok: false, response: NextResponse.json({ error: "The record refused this change." }, { status: 400 }) };
    }
    return { ok: false, response: serverError(context, error) };
  }
  const event = parseCareStatusEventRow(data);
  if (!event) return { ok: false, response: serverError(context, new Error("inserted care_status_events row did not parse")) };

  const state = shapeCareStatus([...current.events, event], { profileKind });
  return { ok: true, change, profileKind, previous, state, event, unchanged: false };
}

/** The audit entry's from / to, so it reads as a change months later. */
export function careStatusAuditDetails(applied: CareStatusApplied): Record<string, unknown> {
  const { change, previous, event } = applied;
  if (change.kind === "summary") {
    return { kind: "summary", eventId: event?.id ?? null, from: previous.summary?.text ?? null, to: change.value, note: null };
  }
  const from =
    change.kind === "phase"
      ? previous.phase?.phase ?? null
      : previous.override
        ? { status: previous.override.status, reason: previous.override.reason }
        : null;
  const to = change.kind === "phase" ? change.value : change.kind === "status_override" ? { status: change.value, reason: change.reason } : null;
  return { kind: change.kind, eventId: event?.id ?? null, from, to, note: change.kind === "status_override" ? null : change.reason };
}
