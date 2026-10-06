"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import PainMapView from "@/components/profile/PainMapView";
import PainExamDialog from "@/components/profile/PainExamDialog";
import type { PainAssessmentRow, QuestionOverrideRow } from "@/lib/painMap";

/**
 * The Pain Map, inside the session note. Updating it is part of finishing a
 * session (the complete-session route refuses Done without an exam recorded
 * by this therapist since an hour before the slot), and doing it here means
 * it is not left for a trip to the health profile that never happens.
 *
 * Read with the browser's own session: the assigned therapist may read this
 * patient's pain assessments under RLS, the same read the health profile
 * page makes. `onRecordedChange` tells the dialog whether this session has
 * an exam yet.
 */
export default function SessionPainMapStep({
  patientId,
  sessionStartIso,
  required,
  onRecordedChange,
}: {
  patientId: string;
  sessionStartIso: string | null;
  required: boolean;
  onRecordedChange: (recorded: boolean) => void;
}) {
  const [assessments, setAssessments] = useState<(PainAssessmentRow & { submitted_by?: string | null })[] | null>(null);
  const [overrides, setOverrides] = useState<Record<string, QuestionOverrideRow[]>>({});
  const [userId, setUserId] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [recording, setRecording] = useState(false);

  const load = useCallback(async () => {
    const supabase = createClient();
    const [{ data: session }, painRes, templateRes] = await Promise.all([
      supabase.auth.getSession(),
      supabase
        .from("pain_assessments")
        .select("region, side, pain_percent, created_at, submitted_by_role, submitted_by")
        .eq("patient_id", patientId),
      supabase.from("pain_map_question_templates").select("region, question_key, question_text"),
    ]);
    if (painRes.error) {
      setFailed(true);
      return;
    }
    setFailed(false);
    setUserId(session.session?.user.id ?? null);
    setAssessments((painRes.data ?? []) as (PainAssessmentRow & { submitted_by?: string | null })[]);
    const byRegion: Record<string, QuestionOverrideRow[]> = {};
    for (const row of (templateRes.data ?? []) as (QuestionOverrideRow & { region: string })[]) {
      (byRegion[row.region] ??= []).push(row);
    }
    setOverrides(byRegion);
  }, [patientId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const sinceMs = sessionStartIso ? new Date(sessionStartIso).getTime() - 60 * 60_000 : 0;
  const thisSession = (assessments ?? []).filter(
    (a) => a.submitted_by === userId && new Date(a.created_at).getTime() >= sinceMs
  );
  const recorded = thisSession.length > 0;
  useEffect(() => {
    onRecordedChange(recorded);
  }, [recorded, onRecordedChange]);

  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-slate-800">
            Pain Map {required && <span className="text-red-600">*</span>}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            {recorded
              ? `Updated for this session (${thisSession.length} ${thisSession.length === 1 ? "area" : "areas"}).`
              : required
                ? "Re-score at least one area for this session before finishing it."
                : "Re-score the areas you examined today."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setRecording(true)}
          disabled={assessments === null}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition disabled:opacity-60 ${
            recorded
              ? "border border-slate-200 bg-white text-slate-700 hover:border-teal-300"
              : "bg-teal-700 text-white hover:bg-teal-800"
          }`}
        >
          <i className="fa-solid fa-person-rays text-[11px]" aria-hidden="true" />
          {recorded ? "Record another area" : "Update the Pain Map"}
        </button>
      </div>
      {failed && (
        <p className="mt-2 text-xs text-red-600">
          The Pain Map couldn&apos;t be loaded.{" "}
          <button type="button" onClick={() => void load()} className="font-semibold underline">
            Try again
          </button>
        </p>
      )}
      {assessments && assessments.length > 0 && (
        <div className="mt-3">
          <PainMapView assessments={assessments} />
        </div>
      )}
      {recording && assessments && (
        <PainExamDialog
          endpoint="/api/therapist/pain-assessments/submit"
          patientId={patientId}
          assessments={assessments}
          overridesByRegion={overrides}
          onClose={() => {
            setRecording(false);
            void load();
          }}
        />
      )}
    </div>
  );
}
