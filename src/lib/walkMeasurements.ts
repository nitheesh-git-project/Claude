import type { MeasurementConditions, MeasurementInput } from "@/lib/outcomeMeasures";

// The readings a guided six-minute walk or a pre-session safety check leaves
// behind (Health Profile redesign, phase 6b): each vital becomes its own
// reading in the shared measurement layer through the existing
// /api/therapist/measurements/submit route, so the vitals strip, the oxygen
// bar and the graph read them back. Pure; the dialog checks each one with
// validateMeasurement before it is sent.
//
// Stored: resting blood pressure, oxygen and heart rate and the breathlessness
// rating before the walk; blood pressure, the lowest oxygen, the breathlessness
// rating and the talk test after it. The heart rate straight after a walk has
// no measure of its own in the registry and is not stored (it is shown while
// the guide is open and sits in the clinician's session note if wanted).

export type WalkVitalsInput = {
  heartRate?: number;
  systolic?: number;
  diastolic?: number;
  spo2?: number;
  breathlessness?: number;
};

export type WalkReading = {
  /** The plain name for an error line ("Blood pressure before the walk"). */
  label: string;
  measurement: MeasurementInput;
};

const has = (v: number | undefined): v is number => typeof v === "number" && Number.isFinite(v);

/** The resting readings taken before exercise (the safety check, or the
 *  start of a walk). */
export function restingReadings(v: WalkVitalsInput, base: { measuredAt: string; conditions: MeasurementConditions }): WalkReading[] {
  const out: WalkReading[] = [];
  const at = base.measuredAt;
  const conditions = base.conditions;
  if (has(v.systolic) && has(v.diastolic)) {
    out.push({
      label: "Blood pressure before the walk",
      measurement: { measureKey: "blood_pressure", value: v.systolic, items: { systolic: v.systolic, diastolic: v.diastolic }, variant: "rest", measuredAt: at, conditions },
    });
  }
  if (has(v.spo2)) out.push({ label: "Oxygen at rest", measurement: { measureKey: "resting_spo2", value: v.spo2, measuredAt: at, conditions } });
  if (has(v.heartRate)) out.push({ label: "Resting heart rate", measurement: { measureKey: "resting_heart_rate", value: v.heartRate, measuredAt: at, conditions } });
  if (has(v.breathlessness)) {
    out.push({ label: "Breathlessness before the walk", measurement: { measureKey: "breathlessness_nrs", value: v.breathlessness, variant: "rest", measuredAt: at, conditions } });
  }
  return out;
}

/** The readings straight after the walk. `spo2` is stored as the lowest
 *  oxygen on exercise (the lowest the oximeter showed during or after). */
export function afterWalkReadings(
  v: WalkVitalsInput,
  talkTest: 0 | 1 | 2 | null,
  base: { measuredAt: string; conditions: MeasurementConditions }
): WalkReading[] {
  const out: WalkReading[] = [];
  const at = base.measuredAt;
  const conditions = base.conditions;
  if (has(v.systolic) && has(v.diastolic)) {
    out.push({
      label: "Blood pressure after the walk",
      measurement: { measureKey: "blood_pressure", value: v.systolic, items: { systolic: v.systolic, diastolic: v.diastolic }, variant: "after_exercise", measuredAt: at, conditions },
    });
  }
  if (has(v.spo2)) out.push({ label: "Lowest oxygen on the walk", measurement: { measureKey: "lowest_spo2", value: v.spo2, measuredAt: at, conditions } });
  if (has(v.breathlessness)) {
    out.push({ label: "Breathlessness after the walk", measurement: { measureKey: "breathlessness_nrs", value: v.breathlessness, variant: "after_test", measuredAt: at, conditions } });
  }
  if (talkTest !== null) out.push({ label: "Talk test", measurement: { measureKey: "talk_test", value: talkTest, measuredAt: at, conditions } });
  return out;
}
