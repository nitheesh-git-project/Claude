"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import SessionPainMapStep from "@/components/therapist/SessionPainMapStep";
import SessionNeuroExamStep from "@/components/therapist/SessionNeuroExamStep";
import { parseConditionSpecialty } from "@/lib/conditionSpecialty";
import { requiredSessionExam, type SessionExamKind } from "@/lib/sessionCompletion";

export type SessionExamState = {
  /** The exam this patient's condition type requires; null for none. */
  kind: SessionExamKind | null;
  /** Whether this session already has it. True when nothing is required. */
  recorded: boolean;
};

/**
 * The examination step of the session note, chosen by the patient's
 * condition type exactly as complete-session chooses it
 * (`requiredSessionExam`): the Pain Map for an orthopaedic patient, the
 * neurological examination for a neurological one, nothing for a
 * paediatric one. The condition type is read first and only that layer is
 * then read -- an orthopaedic note never queries neuro_assessments and a
 * neurological one never queries pain_assessments, the same two-phase rule
 * the health-profile pages follow.
 *
 * Until the condition type is known the step reports "not recorded", so
 * Finish cannot slip through on a read that has not landed; the route is
 * the copy that binds either way.
 */
export default function SessionExamStep({
  patientId,
  patientName,
  sessionStartIso,
  required,
  onStateChange,
}: {
  patientId: string;
  patientName?: string;
  sessionStartIso: string | null;
  required: boolean;
  onStateChange: (state: SessionExamState) => void;
}) {
  // undefined while reading; null when this condition type needs no exam.
  const [kind, setKind] = useState<SessionExamKind | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    void createClient()
      .from("patient_condition_profiles")
      .select("specialty")
      .eq("patient_id", patientId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setKind(requiredSessionExam(parseConditionSpecialty(data?.specialty)));
      });
    return () => {
      cancelled = true;
    };
  }, [patientId]);

  useEffect(() => {
    if (kind === null) onStateChange({ kind: null, recorded: true });
  }, [kind, onStateChange]);

  const onPain = useCallback((recorded: boolean) => onStateChange({ kind: "pain_map", recorded }), [onStateChange]);
  const onNeuro = useCallback((recorded: boolean) => onStateChange({ kind: "neuro_exam", recorded }), [onStateChange]);

  if (kind === "pain_map") {
    return (
      <SessionPainMapStep
        patientId={patientId}
        sessionStartIso={sessionStartIso}
        required={required}
        onRecordedChange={onPain}
      />
    );
  }
  if (kind === "neuro_exam") {
    return (
      <SessionNeuroExamStep
        patientId={patientId}
        patientName={patientName}
        sessionStartIso={sessionStartIso}
        required={required}
        onRecordedChange={onNeuro}
      />
    );
  }
  return null;
}
