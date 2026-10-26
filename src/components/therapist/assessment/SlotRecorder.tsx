"use client";

import { useCallback } from "react";
import RecordTestDialog, { type EmbeddedHandle, type EmbeddedStatus } from "@/components/profile/progress/RecordTestDialog";
import type { ProfileKind } from "@/lib/outcomeMeasures";
import type { MeasureSeries } from "@/lib/outcomeSeries";

/**
 * One reading a measurement step takes, as the existing "Record a test"
 * recorder sitting inline: the same timers, score sheet, angle tool and
 * "last time" beside the number, with the test chosen by the step. The
 * cockpit's Save and next calls the handle this registers; the recorder has
 * no Save button of its own here.
 */
export default function SlotRecorder({
  slotKey,
  measureKey,
  variants,
  runId,
  stepId,
  helperPresent,
  patientId,
  patientName,
  profileKind,
  series,
  enabledLicensed,
  licenceUnreadable,
  appointmentId,
  onRegister,
  onStatus,
  onTimerStart,
}: {
  slotKey: string;
  measureKey: string;
  variants?: readonly string[];
  runId: string;
  stepId: string;
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
}) {
  const register = useCallback((handle: EmbeddedHandle | null) => onRegister(slotKey, handle), [onRegister, slotKey]);
  const status = useCallback((s: EmbeddedStatus) => onStatus(slotKey, s), [onStatus, slotKey]);
  return (
    <RecordTestDialog
      patientId={patientId}
      patientName={patientName}
      profileKind={profileKind}
      series={series}
      enabledLicensed={enabledLicensed}
      licenceUnreadable={licenceUnreadable}
      appointmentId={appointmentId}
      initialMeasureKey={measureKey}
      lockedMeasure
      onClose={() => undefined}
      embedded={{
        run: { runId, stepId },
        variants,
        helperPresent,
        register,
        onStatus: status,
        onTimerStart,
      }}
    />
  );
}
