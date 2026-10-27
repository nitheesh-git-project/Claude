"use client";

import { useId, useRef, useState } from "react";
import OverlayPortal from "@/components/system/OverlayPortal";
import Spinner from "@/components/system/Spinner";
import type { RecordSetup } from "@/components/profile/progress/RecordTestButton";
import { preExerciseCheck, resolveOxygenStopLimit, CARDIO_DO_NOT_EXERCISE_SYMPTOMS } from "@/lib/cardioSafety";
import { debugNow, debugNowHeaders } from "@/lib/debugNow";
import { validateMeasurement } from "@/lib/outcomeMeasures";
import { NETWORK_ERROR_MESSAGE, progressErrorMessage, readProgressFailure } from "@/lib/progressErrors";
import { vitalsProblems, type WalkVitals } from "@/lib/testTimers";
import { restingReadings, unsavedBloodPressure } from "@/lib/walkMeasurements";
import { useDialogChrome } from "@/lib/useDialogChrome";
import { useRouter } from "@/lib/useRouter";
import { useToast } from "@/lib/toast";

const FIELD =
  "min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 text-base text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600";

type Texts = Record<"heartRate" | "systolic" | "diastolic" | "spo2" | "breathlessness", string>;
const EMPTY: Texts = { heartRate: "", systolic: "", diastolic: "", spo2: "", breathlessness: "" };

/**
 * The check before every heart and lung session (the handbook: "every
 * exercise session starts with a safety check"): the resting heart rate,
 * blood pressure and oxygen, and the three questions that are not readings.
 * The result is worked out live against THIS patient's own oxygen limit
 * (cardioSafety.preExerciseCheck): a flagged reading is "do not exercise or
 * test today, contact the patient's doctor", a reading not taken is "not
 * checked", never "clear". The readings are saved as the same readings the
 * six-minute walk saves (a flagged reading is a fact worth keeping), each
 * through the existing measurement route. The refusal is enforced on the
 * screens that start exercise (the guided walk), not at a route.
 */
export default function SafetyCheckDialog({ setup, onClose }: { setup: RecordSetup; onClose: () => void }) {
  const router = useRouter();
  const { show } = useToast();
  const titleId = useId();
  const baseId = useId();
  const [texts, setTexts] = useState<Texts>(EMPTY);
  const [symptoms, setSymptoms] = useState<ReadonlySet<number>>(new Set());
  const [video, setVideo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const savingRef = useRef(false);
  const limit = setup.oxygenLimit ?? resolveOxygenStopLimit({});
  const { panelRef, dialogProps } = useDialogChrome({ onClose, labelledBy: titleId });

  const vitals: WalkVitals = {};
  for (const k of Object.keys(texts) as (keyof Texts)[]) {
    const t = texts[k].trim();
    if (t !== "") vitals[k] = Number(t);
  }
  const problems = vitalsProblems(vitals);
  const check = preExerciseCheck({ restingHeartRate: vitals.heartRate, systolic: vitals.systolic, diastolic: vitals.diastolic, spo2Rest: vitals.spo2 }, limit);
  const symptomStop = symptoms.size > 0;
  const nothing = Object.keys(vitals).length === 0;

  function patch(k: keyof Texts, v: string) {
    setError(null);
    setSaved(false);
    setTexts((t) => ({ ...t, [k]: v }));
  }

  async function save() {
    if (savingRef.current || nothing || problems.length > 0) return;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    const nowMs = debugNow();
    const conditions = video ? { setting: "video" as const, homeMeasured: true } : { setting: "in_person" as const };
    const readings = restingReadings(vitals, { measuredAt: new Date(nowMs).toISOString(), conditions });
    const failed: string[] = unsavedBloodPressure(vitals, "Blood pressure before the walk");
    try {
      for (const r of readings) {
        const checked = validateMeasurement(r.measurement, { profileKind: setup.profileKind, nowMs, enabledLicensed: new Set(setup.enabledLicensed) });
        if (!checked.ok) {
          failed.push(`${r.label} (${checked.error})`);
          continue;
        }
        const res = await fetch(setup.asAdmin ? "/api/admin/measurements/submit" : "/api/therapist/measurements/submit", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...debugNowHeaders() },
          body: JSON.stringify({ patientId: setup.patientId, appointmentId: null, measurement: checked.measurement }),
        });
        if (!res.ok) failed.push(`${r.label} (${progressErrorMessage(await readProgressFailure(res), "measurement")})`);
      }
    } catch {
      failed.push(NETWORK_ERROR_MESSAGE);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
    router.refresh();
    if (failed.length > 0) {
      setError(`These readings were not saved: ${failed.join("; ")}.`);
      return;
    }
    setSaved(true);
    show(`Safety check saved for ${setup.patientName ?? "the patient"}.`);
  }

  const field = (k: keyof Texts, label: string, hint: string) => (
    <div key={k}>
      <label htmlFor={`${baseId}-${k}`} className="block text-xs font-semibold text-slate-800">
        {label}
      </label>
      <input id={`${baseId}-${k}`} type="number" inputMode="numeric" step={1} value={texts[k]} onChange={(e) => patch(k, e.target.value)} placeholder={hint} className={`mt-1 ${FIELD}`} />
    </div>
  );

  return (
    <OverlayPortal>
      <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-slate-900/40 backdrop-blur-sm sm:items-center sm:p-4">
        <div ref={panelRef} {...dialogProps} className="flex h-full w-full flex-col overflow-hidden bg-white shadow-xl sm:h-auto sm:max-h-[92vh] sm:max-w-xl sm:rounded-2xl">
          <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-4 py-3 sm:px-6 sm:py-4">
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wide text-teal-800">Before the session</p>
              <h2 id={titleId} className="font-display text-lg font-bold text-slate-900 [overflow-wrap:anywhere]">
                Safety check{setup.patientName ? ` for ${setup.patientName}` : ""}
              </h2>
              <p className="mt-0.5 text-xs text-slate-700">Oxygen stop limit: {limit.label}.</p>
            </div>
            <button type="button" onClick={onClose} aria-label="Close" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-600 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600">
              <i aria-hidden className="fa-solid fa-xmark text-lg" />
            </button>
          </div>

          <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4 sm:px-6">
            <fieldset>
              <legend className="text-sm font-semibold text-slate-900">Ask first: has the patient had any of these?</legend>
              <ul className="mt-2 space-y-1.5">
                {CARDIO_DO_NOT_EXERCISE_SYMPTOMS.map((s, i) => (
                  <li key={s}>
                    <label className="flex min-h-[44px] items-start gap-3 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-800">
                      <input
                        type="checkbox"
                        checked={symptoms.has(i)}
                        onChange={(e) =>
                          setSymptoms((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(i);
                            else next.delete(i);
                            return next;
                          })
                        }
                        className="mt-0.5 h-5 w-5 shrink-0 accent-teal-700"
                      />
                      <span>{s}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </fieldset>

            <fieldset>
              <legend className="text-sm font-semibold text-slate-900">Resting readings, seated</legend>
              <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {field("heartRate", "Heart rate (beats a minute)", "e.g. 78")}
                {field("systolic", "Blood pressure, top", "e.g. 128")}
                {field("diastolic", "Blood pressure, bottom", "e.g. 80")}
                {field("spo2", "Oxygen (%)", "e.g. 96")}
                {field("breathlessness", "Breathlessness, 0 to 10", "0 = none")}
              </div>
              <label className="mt-3 flex min-h-[44px] items-start gap-3 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-800">
                <input type="checkbox" checked={video} onChange={(e) => setVideo(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-teal-700" />
                <span>Over video: the patient measured these at home on their own device</span>
              </label>
            </fieldset>

            {problems.map((p) => (
              <p key={p} role="alert" className="text-sm text-red-800">
                {p}
              </p>
            ))}

            {(check.status === "stop" || symptomStop) && (
              <div role="alert" data-testid="safety-refusal" className="rounded-xl border border-red-300 bg-red-50 px-3 py-3 text-sm text-red-950">
                <p className="font-bold">{check.refusal?.clinician ?? "Do not exercise or test today. Contact the patient's doctor."}</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-5">
                  {check.flags.map((f) => (
                    <li key={f.code}>{f.clinicianText}</li>
                  ))}
                  {[...symptoms].map((i) => (
                    <li key={i}>{CARDIO_DO_NOT_EXERCISE_SYMPTOMS[i]}</li>
                  ))}
                </ul>
              </div>
            )}
            {check.status === "incomplete" && !symptomStop && !nothing && problems.length === 0 && (
              <p role="status" className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-950">
                Not checked: {check.notChecked.join(", ")}. A reading not taken is not a clear reading.
              </p>
            )}
            {check.status === "clear" && !symptomStop && problems.length === 0 && (
              <p role="status" className="rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-950" data-testid="safety-clear">
                The three readings are taken and none is flagged. Go on with the session.
              </p>
            )}
            {saved && <p role="status" className="text-sm font-semibold text-emerald-800">Saved. They appear in the patient&apos;s vitals.</p>}
          </div>

          <div className="space-y-2 border-t border-slate-100 px-4 py-3 sm:px-6">
            {error && (
              <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {error}
              </p>
            )}
            <div className="flex items-center justify-end gap-2">
              <button type="button" onClick={onClose} className="min-h-[44px] rounded-xl px-4 text-sm font-semibold text-slate-700 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600">
                {saved ? "Done" : "Cancel"}
              </button>
              <button
                type="button"
                onClick={() => void save()}
                disabled={saving || nothing || problems.length > 0}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-teal-700 px-5 text-sm font-semibold text-white hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 disabled:opacity-60"
              >
                {saving && <Spinner />}
                {saving ? "Saving…" : "Save readings"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </OverlayPortal>
  );
}
