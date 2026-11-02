"use client";

import type { ReactNode } from "react";
import type { EmbeddedHandle, EmbeddedStatus } from "@/components/profile/progress/RecordTestDialog";
import { outcomeMeasure, READ_FROM_LABELS, type ProfileKind } from "@/lib/outcomeMeasures";
import type { MeasureSeries } from "@/lib/outcomeSeries";
import type { TimerClockEvent } from "@/lib/timerClock";
import { toolMode, toolSlots, type CarriedFacts, type SummaryRow } from "@/lib/cockpit";
import SummaryTool from "@/components/therapist/assessment/SummaryTool";
import RestTimer from "@/components/therapist/assessment/RestTimer";
import type { ProtocolStep } from "@/lib/sessionProtocols";
import LayerTool, { type QuickPainSave } from "@/components/therapist/assessment/LayerTool";
import type { AreaPainEntry } from "@/lib/conditionIntake";
import RedFlagsTool from "@/components/therapist/assessment/RedFlagsTool";
import SlotRecorder from "@/components/therapist/assessment/SlotRecorder";
import TeachTool from "@/components/therapist/assessment/teach/TeachTool";
import type { ComponentProps } from "react";

// What the physiotherapist is told before the tool, by the kind of tool.
const TOOL_HINT: Partial<Record<ProtocolStep["tool"], string>> = {
  scale_0_10: "Tap the number the patient says.",
  angle: "Camera side-on to the joint, whole limb in view. The photo stays on this device.",
  counter_30s: "Arms crossed on the chest. If the patient uses their arms, tick it after: that stand scores 0.",
  counter_60s: "Count every full stand. Stop the patient at once if they feel unwell.",
  timed_trials: "Start each trial when you say Go: the patient's clock starts with it and stops when you stop.",
  balance_holds: "Hold each position for ten seconds. The patient's ten-second clock starts with each hold. Stay ready to help.",
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
  teach,
  summaryLine,
  summary,
  resting,
}: {
  step: ProtocolStep;
  /** The clinical order keeps this step shut: nothing can be entered. */
  locked: boolean;
  /** Bumped by Stop test: the tool starts again from nothing. */
  resetKey: number;
  redFlags: {
    answers: Readonly<Record<string, boolean>>;
    onAnswer: (id: string, yes: boolean) => void;
    onEnd: () => void;
    onWatch: (line: string) => void;
    watched: readonly string[];
  };
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
    onTimerEvent: (event: TimerClockEvent) => void;
    /** Why the step's timer cannot start yet; null when it can. */
    startBlocked: string | null;
    /** ON/OFF and the last dose, the side, active or passive, from earlier steps. */
    carry: CarriedFacts;
    onCarry: (facts: CarriedFacts) => void;
  };
  layer: {
    patientId: string;
    patientName: string;
    runStartedAt: string;
    onRecord: (recordId: string | null, missing: string | null) => void;
    onQuick: (save: QuickPainSave | null) => void;
    intakeAreas: AreaPainEntry[];
    fallbackRegion: string | null;
  };
  /** The Home exercises step's tool: everything the cockpit holds for it. */
  teach: ComponentProps<typeof TeachTool>;
  summaryLine: string;
  /** The summary step's first / last / now rows and their milestones (B8). */
  summary: { patientId: string; rows: SummaryRow[]; milestonesUnreadable: boolean };
  /** The heart and lung resting check (E14): one row of three readings, the
   *  five-minute rest and a preview of the check the server makes on save. */
  resting?: { preview: { status: "stop" | "clear" | "incomplete"; text: string }; onRestStart: () => void; onRestDone: () => void } | null;
}): ReactNode {
  const mode = toolMode(step);

  if (locked) {
    return <p className="text-sm text-slate-700">Nothing to enter on this step today.</p>;
  }

  if (mode === "red_flags") {
    return (
      <RedFlagsTool
        questions={step.redFlags ?? []}
        answers={redFlags.answers}
        onAnswer={redFlags.onAnswer}
        disabled={false}
        onEnd={redFlags.onEnd}
        onWatch={redFlags.onWatch}
        watched={redFlags.watched}
      />
    );
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
        onQuick={step.layer === "pain_map" ? layer.onQuick : undefined}
        intakeAreas={layer.intakeAreas}
        fallbackRegion={layer.fallbackRegion}
      />
    );
  }

  if (mode === "teach") return <TeachTool {...teach} />;

  if (mode === "summary") {
    return <SummaryTool patientId={summary.patientId} rows={summary.rows} summaryLine={summaryLine} milestonesUnreadable={summary.milestonesUnreadable} />;
  }

  const slots = toolSlots(step);
  const hint = TOOL_HINT[step.tool];
  const recorder = (slot: (typeof slots)[number], compact: boolean) => (
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
      onTimerEvent={measure.onTimerEvent}
      startBlocked={measure.startBlocked}
      carry={measure.carry}
      onCarry={measure.onCarry}
      compact={compact}
    />
  );

  if (resting) {
    const tone =
      resting.preview.status === "stop"
        ? "border-red-600 bg-red-50 text-red-950"
        : resting.preview.status === "clear"
          ? "border-emerald-300 bg-emerald-50 text-emerald-950"
          : "border-slate-200 bg-slate-50 text-slate-800";
    return (
      <div className="space-y-3" data-testid="tool-resting-check">
        <RestTimer onStart={resting.onRestStart} onDone={resting.onRestDone} />
        <p className="text-sm text-slate-700">
          Read each number off the patient{"'"}s own device on camera. The record says so.
        </p>
        <div className="grid gap-3 sm:grid-cols-[1fr_1.5fr_1fr]">
          {slots.map((slot) => (
            <div key={`${slot.key}:${resetKey}`} className="rounded-xl border border-slate-200 p-2.5" data-testid={`slot-${slot.measureKey}`}>
              {recorder(slot, true)}
            </div>
          ))}
        </div>
        <p role="status" data-testid="resting-preview" className={`rounded-xl border-2 px-3 py-2 text-[15px] font-semibold ${tone}`}>
          {resting.preview.text} <span className="font-normal">Preview only: the server checks on save.</span>
        </p>
      </div>
    );
  }

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
            {recorder(slot, false)}
          </div>
        );
      })}
    </div>
  );
}
