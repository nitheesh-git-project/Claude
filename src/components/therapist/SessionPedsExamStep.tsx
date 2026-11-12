"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import PedsExamDialog from "@/components/profile/peds/PedsExamDialog";
import { getDebugNowOffsetMs } from "@/lib/debugNow";
import { formatClinicTime } from "@/lib/formatDateTime";
import {
  parsePedsAssessments,
  pedsExamTally,
  PEDS_ASSESSMENT_SELECT,
  type PedsAssessmentRow,
} from "@/lib/pedsExam";
import { sessionExamWindowStartMs } from "@/lib/sessionCompletion";

type Row = PedsAssessmentRow & { submitted_by?: string | null };

/**
 * The paediatric examination, inside the session note - the paediatric
 * counterpart of `SessionNeuroExamStep`, and held to the same rule:
 * complete-session refuses Done without an examination recorded by this
 * therapist since an hour before the slot (sessionExamWindowStartMs, shifted
 * by the debug clock exactly as the route shifts it), so doing it here means
 * it is not left for a trip to the chart that never happens.
 *
 * Read with the browser's own session: the assigned therapist reads this
 * child's peds_assessments under RLS, the same read the chart makes.
 *
 * A read that fails says so and never counts as "recorded": the button to
 * record stays pressable regardless (the route binds either way, and a
 * therapist must never face a gate with nothing to press), and "Try again"
 * re-reads.
 */
export default function SessionPedsExamStep({
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
    try {
      const [{ data: session }, res] = await Promise.all([
        supabase.auth.getSession(),
        supabase
          .from("peds_assessments")
          .select(`${PEDS_ASSESSMENT_SELECT}, submitted_by`)
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
      setRows((res.data ?? []) as unknown as Row[]);
    } catch {
      setFailed(true);
    }
  }, [patientId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const sinceMs = sessionStartIso
    ? sessionExamWindowStartMs(
        new Date(sessionStartIso).getTime(),
        getDebugNowOffsetMs(),
      )
    : 0;
  const thisSession = (rows ?? []).filter(
    (r) =>
      r.submitted_by === userId && new Date(r.created_at).getTime() >= sinceMs,
  );
  const recorded = !failed && thisSession.length > 0;
  useEffect(() => {
    onRecordedChange(recorded);
  }, [recorded, onRecordedChange]);

  const parsed = useMemo(() => parsePedsAssessments(rows ?? []), [rows]);
  const latest = parsed[0] ?? null;
  const tally = latest ? pedsExamTally(latest.findings) : null;

  return (
    <div
      className="rounded-xl border border-slate-200 p-4"
      data-testid="session-peds-exam-step"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-800">
            Paediatric examination{" "}
            {required && <span className="text-red-600">*</span>}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            {recorded
              ? `Recorded for this session at ${formatClinicTime(thisSession[0].created_at)}.`
              : required
                ? "Record this session's examination - the milestones you looked for, whatever you assessed - before finishing it."
                : "Record the milestones you looked for today."}
          </p>
          {tally && tally.notAssessed < 6 && (
            <p className="mt-1 text-[11px] text-slate-600">
              {recorded ? "This session: " : "Last time: "}
              {`${tally.achieved} achieved · ${tally.emerging} emerging · ${tally.notYet} not yet`}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setRecording(true)}
          className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 ${
            recorded
              ? "border border-slate-200 bg-white text-slate-700 hover:border-teal-300"
              : "bg-teal-700 text-white hover:bg-teal-800"
          }`}
        >
          <i
            className="fa-solid fa-child-reaching text-[11px]"
            aria-hidden="true"
          />
          {recorded
            ? "Record another examination"
            : "Record the paediatric exam"}
        </button>
      </div>
      {failed && (
        <p role="alert" className="mt-2 text-xs text-red-600">
          The paediatric examination couldn&apos;t be loaded, so it is not
          counted as recorded.{" "}
          <button
            type="button"
            onClick={() => void load()}
            className="min-h-[44px] font-semibold underline"
          >
            Try again
          </button>
        </p>
      )}
      {recording && (
        <PedsExamDialog
          endpoint="/api/therapist/peds-assessments/submit"
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
