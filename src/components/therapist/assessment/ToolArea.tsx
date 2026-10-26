"use client";

import type { ReactNode } from "react";
import type { EmbeddedHandle, EmbeddedStatus } from "@/components/profile/progress/RecordTestDialog";
import { outcomeMeasure, READ_FROM_LABELS, type ProfileKind } from "@/lib/outcomeMeasures";
import type { MeasureSeries } from "@/lib/outcomeSeries";
import { toolMode, toolSlots } from "@/lib/cockpit";
import type { ProtocolStep } from "@/lib/sessionProtocols";
import LayerTool from "@/components/therapist/assessment/LayerTool";
import RedFlagsTool from "@/components/therapist/assessment/RedFlagsTool";
import SlotRecorder from "@/components/therapist/assessment/SlotRecorder";

// What the physiotherapist is told before the tool, by the kind of tool.
const TOOL_HINT: Partial<Record<ProtocolStep["tool"], string>> = {
  scale_0_10: "Tap the number the patient says.",
  angle: "Camera side-on to the joint, whole limb in view. The photo stays on this device.",
  counter_30s: "Arms crossed on the chest. If the patient uses their arms, tick it after: that stand scores 0.",
  counter_60s: "Count every full stand. Stop the patient at once if they feel unwell.",
  timed_trials: "Time each trial from your own screen. Press Go on the patient screen when you say Go.",
  balance_holds: "Hold each position for ten seconds. Stay ready to help.",
};

/**
 * The step's own tool, in the same card: the safety questions, a reading
 * (the existing recorder, inline: scale, score sheet, angle, timers, vitals),
 * the exam a layer step opens, or the summary check. It owns no state of its
 * own beyond what its tool needs; the cockpit holds the answers and the
 * readiness so Save and next can act on them.
 */
export default function ToolArea({
  step,
  locked,
  resetKey,
  redFlags,
  measure,
  layer,
  summaryLine,
}: {
  step: ProtocolStep;
  /** The clinical order keeps this step shut: nothing can be entered. */
  locked: boolean;
  /** Bumped by Stop test: the tool starts again from nothing. */
  resetKey: number;
  redFlags: { answers: Readonly<Record<string, boolean>>; onAnswer: (id: string, yes: boolean) => void };
  measure: {
    runId: string;
    helperPresent: boolean;
    patientId: string;
    patientName: string;
    profileKind: ProfileKind;
    series: MeasureSeries[];
    enabledLicensed: readonly string[];
    licenceUnreadable: boolean;
    appointmentId: string | null;
    onRegister: (slotKey: string, handle: EmbeddedHandle | null) => void;
    onStatus: (slotKey: string, status: EmbeddedStatus) => void;
    onTimerStart: () => void;
  };
  layer: { patientId: string; patientName: string; runStartedAt: string; onRecord: (recordId: string | null, missing: string | null) => void };
  summaryLine: string;
}): ReactNode {
  const mode = toolMode(step);

  if (locked) {
    return <p className="text-sm text-slate-700">Nothing to enter on this step today.</p>;
  }

  if (mode === "red_flags") {
    return <RedFlagsTool questions={step.redFlags ?? []} answers={redFlags.answers} onAnswer={redFlags.onAnswer} disabled={false} />;
  }

  if (mode === "layer" && step.layer) {
    return (
      <LayerTool
        key={resetKey}
        layer={step.layer}
        patientId={layer.patientId}
        patientName={layer.patientName}
        runStartedAt={layer.runStartedAt}
        disabled={false}
        onRecord={layer.onRecord}
      />
    );
  }

  if (mode === "summary") {
    return (
      <div className="space-y-1.5" data-testid="summary-tool">
        <p className="text-base font-semibold text-slate-900">Check today{"'"}s results before you finish.</p>
        <p className="text-sm text-slate-700">{summaryLine}</p>
        <p className="text-sm text-slate-700">
          Save and finish ends the assessment and gives you a draft of {"“"}Where things stand{"”"} to put into your own words.
        </p>
      </div>
    );
  }

  const slots = toolSlots(step);
  const hint = TOOL_HINT[step.tool];
  return (
    <div className="space-y-5" data-testid={`tool-${step.tool}`}>
      {hint && <p className="text-sm text-slate-700">{hint}</p>}
      {step.tool === "vitals" && (
        <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-800" data-testid="vitals-label">
          Read each number off the patient{"'"}s own device on camera. It is marked on the record as: {READ_FROM_LABELS.patient_device_on_video}.
        </p>
      )}
      {slots.map((slot) => {
        const m = outcomeMeasure(slot.measureKey);
        return (
          <div key={`${slot.key}:${resetKey}`} className="space-y-2" data-testid={`slot-${slot.measureKey}`}>
            {slots.length > 1 && <h3 className="font-display text-base font-bold text-slate-900">{m?.label ?? slot.measureKey}</h3>}
            <SlotRecorder
              slotKey={slot.key}
              measureKey={slot.measureKey}
              variants={slot.variants}
              runId={measure.runId}
              stepId={step.id}
              helperPresent={measure.helperPresent}
              patientId={measure.patientId}
              patientName={measure.patientName}
              profileKind={measure.profileKind}
              series={measure.series}
              enabledLicensed={measure.enabledLicensed}
              licenceUnreadable={measure.licenceUnreadable}
              appointmentId={measure.appointmentId}
              onRegister={measure.onRegister}
              onStatus={measure.onStatus}
              onTimerStart={measure.onTimerStart}
            />
          </div>
        );
      })}
    </div>
  );
}
