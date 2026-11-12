import "server-only";
import { NextResponse } from "next/server";
import type { createAdminClient } from "@/lib/supabase/admin";
import { outcomeMeasure, validateMeasurement, type CleanMeasurement, type ProfileKind } from "@/lib/outcomeMeasures";
import { enabledLicensedSet } from "@/lib/licensedMeasures";
import { loadEnabledLicensedMeasures, loadPatientProfileKind } from "@/lib/outcomeServer";
import { OUTCOME_MEASUREMENT_SELECT, parseMeasurementRow, type MeasurementPoint } from "@/lib/outcomeSeries";
import { serverError } from "@/lib/apiError";

// The half of a measurement write that the therapist's and the admin's
// routes share: which kind of patient this is, whether a licensed scale is
// switched on, the registry's validation, the linked session, and the
// insert. Written once so neither door can store a value the other would
// refuse (the neurological exam's two routes share validateNeuroFindings
// for the same reason).

type AdminClient = ReturnType<typeof createAdminClient>;

const NO_PROFILE_MESSAGE =
  "This patient's condition type has not been recorded yet, so there is nothing to check a measurement against. Record it on their Health Profile first.";

/** Profile kind, licence and registry, in that order. */
export async function prepareMeasurement(
  admin: AdminClient,
  patientId: string,
  raw: unknown,
  nowMs: number
): Promise<{ ok: true; profileKind: ProfileKind; measurement: CleanMeasurement } | { ok: false; response: NextResponse }> {
  const kind = await loadPatientProfileKind(admin, patientId);
  if (kind.status === "unreadable") {
    return {
      ok: false,
      response: NextResponse.json({ error: "We couldn't read this patient's record just now. Please try again." }, { status: 503 }),
    };
  }
  if (kind.status === "no_profile") {
    return { ok: false, response: NextResponse.json({ error: NO_PROFILE_MESSAGE, code: "no_condition_profile" }, { status: 409 }) };
  }

  const licensed = await loadEnabledLicensedMeasures(admin);
  const key = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>).measureKey : undefined;
  const measure = typeof key === "string" ? outcomeMeasure(key) : null;
  // "We couldn't check" is not "it is switched off" -- but it switches
  // nothing on either way (fail closed).
  if (measure?.licence === "licensed" && licensed.status === "unreadable") {
    return {
      ok: false,
      response: NextResponse.json(
        { error: `We couldn't check whether ${measure.label} is switched on just now. Please try again.` },
        { status: 503 }
      ),
    };
  }

  const validated = validateMeasurement(raw, {
    profileKind: kind.profileKind,
    nowMs,
    enabledLicensed: enabledLicensedSet(licensed),
  });
  if (!validated.ok) return { ok: false, response: NextResponse.json({ error: validated.error }, { status: 400 }) };
  return { ok: true, profileKind: kind.profileKind, measurement: validated.measurement };
}

/**
 * The optional session a measurement is filed against. It must be this
 * patient's -- and, for a therapist, their own (the RLS policy
 * outcome_measurements_insert_assigned_therapist says the same). Null when
 * there is none or it checks out; otherwise the response to return.
 */
export async function checkLinkedAppointment(
  admin: AdminClient,
  rawAppointmentId: unknown,
  patientId: string,
  therapistId: string | null
): Promise<{ ok: true; appointmentId: string | null } | { ok: false; response: NextResponse }> {
  if (rawAppointmentId === undefined || rawAppointmentId === null || rawAppointmentId === "") {
    return { ok: true, appointmentId: null };
  }
  if (typeof rawAppointmentId !== "string") {
    return { ok: false, response: NextResponse.json({ error: "appointmentId must be a session id." }, { status: 400 }) };
  }
  const { data, error } = await admin
    .from("appointments")
    .select("id, patient_id, therapist_id")
    .eq("id", rawAppointmentId)
    .maybeSingle();
  if (error) {
    // A malformed uuid is the caller's mistake, not ours.
    if (error.code === "22P02") {
      return { ok: false, response: NextResponse.json({ error: "No such session for this patient." }, { status: 400 }) };
    }
    return {
      ok: false,
      response: NextResponse.json({ error: "We couldn't check that session just now. Please try again." }, { status: 503 }),
    };
  }
  if (!data || data.patient_id !== patientId) {
    return { ok: false, response: NextResponse.json({ error: "No such session for this patient." }, { status: 400 }) };
  }
  if (therapistId !== null && data.therapist_id !== therapistId) {
    return {
      ok: false,
      response: NextResponse.json({ error: "A measurement can only be filed against your own session." }, { status: 403 }),
    };
  }
  return { ok: true, appointmentId: data.id as string };
}

/** The insert, returning the stored row in the app's shape. */
export async function insertMeasurement(
  admin: AdminClient,
  context: string,
  input: {
    patientId: string;
    appointmentId: string | null;
    measurement: CleanMeasurement;
    recordedBy: string;
    recordedByRole: "therapist" | "admin";
  }
): Promise<{ ok: true; point: MeasurementPoint } | { ok: false; response: NextResponse }> {
  const m = input.measurement;
  const { data, error } = await admin
    .from("outcome_measurements")
    .insert({
      patient_id: input.patientId,
      appointment_id: input.appointmentId,
      measure_key: m.measureKey,
      variant: m.variant,
      side: m.side,
      value: m.value,
      items: m.items,
      conditions: m.conditions,
      recorded_by: input.recordedBy,
      recorded_by_role: input.recordedByRole,
      measured_at: m.measuredAt,
      schema_version: m.schemaVersion,
    })
    .select(OUTCOME_MEASUREMENT_SELECT)
    .single();
  if (error) {
    // The table's own CHECK (a test time ahead of the database's clock --
    // the debug bar's simulated clock can be ahead of it) is the caller's
    // to fix, so it is a 400 with a sentence, not a 500.
    if (error.code === "23514") {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "The record refused this measurement. Check that the test time is not in the future." },
          { status: 400 }
        ),
      };
    }
    return { ok: false, response: serverError(context, error) };
  }
  const point = parseMeasurementRow(data);
  if (!point) return { ok: false, response: serverError(context, new Error("inserted row did not parse")) };
  return { ok: true, point };
}
