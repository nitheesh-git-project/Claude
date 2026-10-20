"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import NeuroExamDialog from "@/components/profile/neuro/NeuroExamDialog";
import { getDebugNowOffsetMs } from "@/lib/debugNow";
import { formatClinicTime } from "@/lib/formatDateTime";
import { neuroHeadline, parseNeuroAssessments, BERG_MAX, type NeuroAssessmentRow } from "@/lib/neuroExam";
import { sessionExamWindowStartMs } from "@/lib/sessionCompletion";

type Row = NeuroAssessmentRow & { submitted_by?: string | null };

/**
 * The neurological examination, inside the session note -- the
 * neurological counterpart of `SessionPainMapStep`, and held to the same
 * rule: complete-session refuses Done without an examination recorded by
 * this therapist since an hour before the slot (sessionExamWindowStartMs,
 * shifted by the debug clock exactly as the route shifts it), so doing it
 * here means it is not left for a trip to the chart that never happens.
 *
 * Read with the browser's own session: the assigned therapist reads this
 * patient's neuro_assessments under RLS, the same read the chart makes.
 */
export default function SessionNeuroExamStep({
  patientId,
  patientName,
  sessionStartIso,
  required,
  onRecordedChange,
}: {
  patientId: string;
  patientName?: string;
  sessionStartIso: string | null;
  required: boolean;
  onRecordedChange: (recorded: boolean) => void;
}) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [recording, setRecording] = useState(false);

  const load = useCallback(async () => {
    const supabase = createClient();
    const [{ data: session }, res] = await Promise.all([
      supabase.auth.getSession(),
      supabase
        .from("neuro_assessments")
        .select("id, created_at, submitted_by_role, schema_version, findings, submitted_by")
        .eq("patient_id", patientId)
        .order("created_at", { ascending: false })
        .limit(200),
    ]);
    if (res.error) {
      setFailed(true);
      return;
    }
    setFailed(false);
    setUserId(session.session?.user.id ?? null);
    setRows((res.data ?? []) as Row[]);
  }, [patientId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const sinceMs = sessionStartIso
    ? sessionExamWindowStartMs(new Date(sessionStartIso).getTime(), getDebugNowOffsetMs())
    : 0;
  const thisSession = (rows ?? []).filter(
    (r) => r.submitted_by === userId && new Date(r.created_at).getTime() >= sinceMs
  );
  const recorded = thisSession.length > 0;
  useEffect(() => {
    onRecordedChange(recorded);
  }, [recorded, onRecordedChange]);

  const parsed = useMemo(() => parseNeuroAssessments(rows ?? []), [rows]);
  const latest = parsed[0] ?? null;
  const headline = latest ? neuroHeadline(latest.findings) : null;

  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-800">
            Neurological examination {required && <span className="text-red-600">*</span>}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            {recorded
              ? `Recorded for this session at ${formatClinicTime(thisSession[0].created_at)}.`
              : required
                ? "Record this session's examination - tone, power, balance, gait, whatever you assessed - before finishing it."
                : "Record what you examined today."}
          </p>
          {headline && (headline.berg || headline.tug || headline.asymmetryCount > 0) && (
            <p className="mt-1 text-[11px] text-slate-600">
              {recorded ? "This session: " : "Last time: "}
              {[
                headline.berg ? `Berg ${headline.berg.total}/${BERG_MAX}` : null,
                headline.tug ? `TUG ${headline.tug.seconds} s` : null,
                headline.asymmetryCount > 0
                  ? `${headline.asymmetryCount} left-right ${headline.asymmetryCount === 1 ? "difference" : "differences"}`
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setRecording(true)}
          disabled={rows === null}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 disabled:opacity-60 ${
            recorded
              ? "border border-slate-200 bg-white text-slate-700 hover:border-teal-300"
              : "bg-teal-700 text-white hover:bg-teal-800"
          }`}
        >
          <i className="fa-solid fa-brain text-[11px]" aria-hidden="true" />
          {recorded ? "Record another examination" : "Record the examination"}
        </button>
      </div>
      {failed && (
        <p className="mt-2 text-xs text-red-600">
          The neurological examination couldn&apos;t be loaded.{" "}
          <button type="button" onClick={() => void load()} className="font-semibold underline">
            Try again
          </button>
        </p>
      )}
      {recording && rows && (
        <NeuroExamDialog
          endpoint="/api/therapist/neuro-assessments/submit"
          patientId={patientId}
          patientName={patientName}
          previous={latest}
          onClose={() => {
            setRecording(false);
            void load();
          }}
        />
      )}
    </div>
  );
}
