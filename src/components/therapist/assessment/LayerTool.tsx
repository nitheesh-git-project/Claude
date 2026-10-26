"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import PainExamDialog from "@/components/profile/PainExamDialog";
import PainMapView from "@/components/profile/PainMapView";
import NeuroExamDialog from "@/components/profile/neuro/NeuroExamDialog";
import PedsExamDialog from "@/components/profile/peds/PedsExamDialog";
import { formatClinicTime } from "@/lib/formatDateTime";
import { parseNeuroAssessments, type NeuroAssessmentRow } from "@/lib/neuroExam";
import { parsePedsAssessments, PEDS_ASSESSMENT_SELECT, type PedsAssessmentRow } from "@/lib/pedsExam";
import type { PainAssessmentRow, QuestionOverrideRow } from "@/lib/painMap";
import type { RecordLayer } from "@/lib/sessionProtocols";

type Mine = { id: string; created_at: string; submitted_by?: string | null };

const COPY: Record<RecordLayer, { icon: string; open: string; again: string; saved: string; missing: string; what: string }> = {
  pain_map: {
    icon: "fa-person-rays",
    open: "Update the Pain Map",
    again: "Record another area",
    saved: "Pain Map updated for this assessment",
    missing: "Update the Pain Map first.",
    what: "Re-score the areas the patient points to on camera.",
  },
  neuro_exam: {
    icon: "fa-brain",
    open: "Record the examination",
    again: "Record another examination",
    saved: "Examination recorded for this assessment",
    missing: "Record the examination first.",
    what: "Tone, power, balance, gait: whatever you assessed over video.",
  },
  peds_exam: {
    icon: "fa-child-reaching",
    open: "Record the milestones",
    again: "Record another examination",
    saved: "Examination recorded for this assessment",
    missing: "Record the examination first.",
    what: "The milestones you looked for, with a parent beside the child.",
  },
};

const ENDPOINT: Record<RecordLayer, string> = {
  pain_map: "/api/therapist/pain-assessments/submit",
  neuro_exam: "/api/therapist/neuro-assessments/submit",
  peds_exam: "/api/therapist/peds-assessments/submit",
};

/**
 * A step whose result is the Pain Map, the neurological exam or the
 * paediatric exam: it opens that layer's own dialog (the same one the chart
 * uses, saved through its own route) and, once a record by this
 * physiotherapist exists from after the run began, reports its id so Save
 * and next can name it in the run's "saved" event. The read is the browser's
 * own, under the same row-level rules as the chart; a read that fails says it
 * could not check and never counts as "recorded".
 */
export default function LayerTool({
  layer,
  patientId,
  patientName,
  runStartedAt,
  disabled,
  onRecord,
}: {
  layer: RecordLayer;
  patientId: string;
  patientName: string;
  runStartedAt: string;
  disabled: boolean;
  onRecord: (recordId: string | null, missing: string | null) => void;
}) {
  const [rows, setRows] = useState<(Mine & Record<string, unknown>)[] | null>(null);
  const [overrides, setOverrides] = useState<Record<string, QuestionOverrideRow[]>>({});
  const [userId, setUserId] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [recording, setRecording] = useState(false);
  const copy = COPY[layer];

  const load = useCallback(async () => {
    const supabase = createClient();
    try {
      const { data: session } = await supabase.auth.getSession();
      setUserId(session.session?.user.id ?? null);
      if (layer === "pain_map") {
        const [painRes, templateRes] = await Promise.all([
          supabase.from("pain_assessments").select("id, region, side, pain_percent, created_at, submitted_by_role, submitted_by").eq("patient_id", patientId),
          supabase.from("pain_map_question_templates").select("region, question_key, question_text"),
        ]);
        if (painRes.error) throw painRes.error;
        const byRegion: Record<string, QuestionOverrideRow[]> = {};
        for (const row of (templateRes.data ?? []) as (QuestionOverrideRow & { region: string })[]) (byRegion[row.region] ??= []).push(row);
        setOverrides(byRegion);
        setRows((painRes.data ?? []) as unknown as (Mine & Record<string, unknown>)[]);
      } else if (layer === "neuro_exam") {
        const res = await supabase
          .from("neuro_assessments")
          .select("id, created_at, submitted_by_role, schema_version, findings, submitted_by")
          .eq("patient_id", patientId)
          .order("created_at", { ascending: false })
          .limit(200);
        if (res.error) throw res.error;
        setRows((res.data ?? []) as unknown as (Mine & Record<string, unknown>)[]);
      } else {
        const res = await supabase
          .from("peds_assessments")
          .select(PEDS_ASSESSMENT_SELECT)
          .eq("patient_id", patientId)
          .order("created_at", { ascending: false })
          .limit(200);
        if (res.error) throw res.error;
        setRows((res.data ?? []) as unknown as (Mine & Record<string, unknown>)[]);
      }
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [layer, patientId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the first read of the record
    void load();
  }, [load]);

  const mine = useMemo(() => {
    const since = Date.parse(runStartedAt);
    return (rows ?? [])
      .filter((r) => r.submitted_by === userId && Date.parse(r.created_at) >= since)
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  }, [rows, userId, runStartedAt]);
  const recordId = !failed && mine.length > 0 ? mine[0].id : null;

  useEffect(() => {
    onRecord(recordId, failed ? "We couldn't check whether it was saved. Try again." : copy.missing);
  }, [recordId, failed, copy.missing, onRecord]);

  const neuroPrevious = useMemo(() => (layer === "neuro_exam" ? parseNeuroAssessments((rows ?? []) as unknown as NeuroAssessmentRow[])[0] ?? null : null), [layer, rows]);
  const pedsPrevious = useMemo(() => (layer === "peds_exam" ? parsePedsAssessments((rows ?? []) as unknown as PedsAssessmentRow[])[0] ?? null : null), [layer, rows]);

  return (
    <div data-testid={`layer-${layer}`} className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-3">
        <div className="min-w-0">
          <p className="text-base font-semibold text-slate-900">{recordId ? copy.saved : copy.what}</p>
          {recordId && mine[0] && <p className="text-sm text-slate-700">Recorded at {formatClinicTime(mine[0].created_at)}.</p>}
        </div>
        <button
          type="button"
          data-testid="layer-open"
          disabled={disabled || (rows === null && !failed)}
          onClick={() => setRecording(true)}
          className={`inline-flex min-h-[52px] items-center gap-2 rounded-xl px-5 text-base font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 disabled:opacity-60 ${
            recordId ? "border border-slate-300 bg-white text-slate-900 hover:border-teal-500" : "bg-teal-700 text-white hover:bg-teal-800"
          }`}
        >
          <i aria-hidden="true" className={`fa-solid ${copy.icon}`} />
          {recordId ? copy.again : copy.open}
        </button>
      </div>
      {failed && (
        <p role="alert" className="text-sm font-semibold text-red-800">
          We couldn{"'"}t load the record, so it is not counted as saved.{" "}
          <button type="button" onClick={() => void load()} className="min-h-[44px] underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600">
            Try again
          </button>
        </p>
      )}
      {layer === "pain_map" && rows && rows.length > 0 && (
        <div className="max-h-72 overflow-auto rounded-xl border border-slate-200 p-2">
          <PainMapView assessments={rows as unknown as PainAssessmentRow[]} />
        </div>
      )}
      {recording && layer === "pain_map" && rows && (
        <PainExamDialog
          endpoint={ENDPOINT.pain_map}
          patientId={patientId}
          assessments={rows as unknown as PainAssessmentRow[]}
          overridesByRegion={overrides}
          onClose={() => {
            setRecording(false);
            void load();
          }}
        />
      )}
      {recording && layer === "neuro_exam" && (
        <NeuroExamDialog
          endpoint={ENDPOINT.neuro_exam}
          patientId={patientId}
          patientName={patientName}
          previous={neuroPrevious}
          onClose={() => {
            setRecording(false);
            void load();
          }}
        />
      )}
      {recording && layer === "peds_exam" && (
        <PedsExamDialog
          endpoint={ENDPOINT.peds_exam}
          patientId={patientId}
          patientName={patientName}
          previous={pedsPrevious}
          onClose={() => {
            setRecording(false);
            void load();
          }}
        />
      )}
    </div>
  );
}
