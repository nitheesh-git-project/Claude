"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import PainExamDialog from "@/components/profile/PainExamDialog";
import PainMapView from "@/components/profile/PainMapView";
import PainScaleButtons from "@/components/profile/PainScaleButtons";
import { debugNowHeaders } from "@/lib/debugNow";
import { OFFLINE_FAILURE, cockpitFailure, type CockpitFailure } from "@/lib/cockpit";
import { readProgressFailure } from "@/lib/progressErrors";
import type { AreaPainEntry } from "@/lib/conditionIntake";
import { painChangeWords, painPercentFromScore, painStepStartArea, type PainArea } from "@/lib/painScale";
import NeuroExamDialog from "@/components/profile/neuro/NeuroExamDialog";
import PedsExamDialog from "@/components/profile/peds/PedsExamDialog";
import { formatClinicTime } from "@/lib/formatDateTime";
import { parseNeuroAssessments, type NeuroAssessmentRow } from "@/lib/neuroExam";
import { parsePedsAssessments, PEDS_ASSESSMENT_SELECT, type PedsAssessmentRow } from "@/lib/pedsExam";
import {
  PAIN_MAP_REGIONS,
  formatPainOutOfTen,
  latestAssessmentByRegionSide,
  regionRequiresSide,
  type PainAssessmentRow,
  type PainMapRegionKey,
  type QuestionOverrideRow,
} from "@/lib/painMap";
import type { RecordLayer } from "@/lib/sessionProtocols";

type Mine = { id: string; created_at: string; submitted_by?: string | null };

/** The pain step's quick score, run by the cockpit's Save and next: it
 *  records the score as a Pain Map reading and answers that reading's id. */
export type QuickPainSave = () => Promise<{ ok: true; id: string } | { ok: false; failure: CockpitFailure }>;

const KNOWN_REGIONS: ReadonlySet<string> = new Set(PAIN_MAP_REGIONS.map((r) => r.key as string));

const COPY: Record<RecordLayer, { icon: string; open: string; again: string; saved: string; missing: string; what: string }> = {
  pain_map: {
    icon: "fa-person-rays",
    open: "Add detail on the Pain Map",
    again: "Add detail on the Pain Map",
    saved: "Pain Map updated for this assessment",
    missing: "Tap the pain score, 0 to 10.",
    what: "Optional: the full exam for an area (questions, other areas).",
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
  onQuick,
  intakeAreas = [],
  fallbackRegion = null,
}: {
  layer: RecordLayer;
  patientId: string;
  patientName: string;
  runStartedAt: string;
  disabled: boolean;
  onRecord: (recordId: string | null, missing: string | null) => void;
  /** The pain step: hands the cockpit the quick score's save once a number
   *  is picked, null when none is. */
  onQuick?: (save: QuickPainSave | null) => void;
  /** The areas the patient marked in their intake (the pain step starts on the worst). */
  intakeAreas?: AreaPainEntry[];
  /** The protocol's own joint, when nothing on record names an area. */
  fallbackRegion?: string | null;
}) {
  const [rows, setRows] = useState<(Mine & Record<string, unknown>)[] | null>(null);
  const [overrides, setOverrides] = useState<Record<string, QuestionOverrideRow[]>>({});
  const [userId, setUserId] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [recording, setRecording] = useState(false);
  const copy = COPY[layer];
  const scaleLabelId = useId();

  // The pain step's quick score: an area (started from the record), a side
  // where the area has two, and a number on the eleven buttons.
  const [area, setArea] = useState<PainArea | null>(null);
  const [choosingArea, setChoosingArea] = useState(false);
  const [score, setScore] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const supabase = createClient();
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


  // Where the pain step starts: the latest exam, the worst intake area, the
  // protocol's joint (painStepStartArea). Picked once the record is read.
  const startArea = useMemo(
    () =>
      layer === "pain_map" && (rows || failed)
        ? painStepStartArea({
            exams: (rows ?? []) as unknown as { region: string; side: string | null; created_at: string }[],
            intakeAreas,
            fallbackRegion,
            knownRegions: KNOWN_REGIONS,
          })
        : null,
    [layer, rows, failed, intakeAreas, fallbackRegion]
  );
  const shownArea = area ?? startArea;
  const areaDef = shownArea ? PAIN_MAP_REGIONS.find((r) => r.key === shownArea.region) ?? null : null;
  const needsSide = shownArea ? regionRequiresSide(shownArea.region as PainMapRegionKey) : false;
  const areaSide: "left" | "right" | null = needsSide ? (shownArea?.side === "right" ? "right" : shownArea?.side === "left" ? "left" : null) : null;
  const lastForArea = useMemo(() => {
    if (layer !== "pain_map" || !rows || !shownArea) return null;
    return latestAssessmentByRegionSide(rows as unknown as PainAssessmentRow[]).get(`${shownArea.region}:${needsSide ? areaSide ?? "left" : "na"}`) ?? null;
  }, [layer, rows, shownArea, needsSide, areaSide]);
  const scoreReady = layer === "pain_map" && score !== null && !!shownArea && (!needsSide || !!areaSide);

  const quickSave = useCallback<QuickPainSave>(async () => {
    const percent = score === null ? null : painPercentFromScore(score);
    if (!shownArea || percent === null) return { ok: false, failure: { message: "Pick the area and the number first.", fix: null, kind: "refused" } };
    try {
      const res = await fetch(ENDPOINT.pain_map, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...debugNowHeaders() },
        body: JSON.stringify({ patientId, region: shownArea.region, side: needsSide ? areaSide ?? undefined : undefined, answers: [], painPercent: percent }),
      });
      if (!res.ok) return { ok: false, failure: cockpitFailure(await readProgressFailure(res)) };
      // The route answers no id: read back this physiotherapist's newest reading.
      const supabase = createClient();
      const { data: session } = await supabase.auth.getSession();
      const me = session.session?.user.id ?? null;
      const latest = await supabase
        .from("pain_assessments")
        .select("id, created_at")
        .eq("patient_id", patientId)
        .eq("submitted_by", me ?? "")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const id = latest.data?.id as string | undefined;
      if (latest.error || !id || Date.parse(latest.data!.created_at as string) < Date.parse(runStartedAt)) {
        return { ok: false, failure: { message: "The score was saved, but we couldn't check it just now.", fix: "Save and next again in a moment.", kind: "unchecked" } };
      }
      setScore(null);
      void load();
      return { ok: true, id };
    } catch {
      return { ok: false, failure: OFFLINE_FAILURE };
    }
  }, [score, shownArea, needsSide, areaSide, patientId, runStartedAt, load]);

  // What Save and next is still waiting for, said in the order it is done.
  const missingNow =
    layer === "pain_map" && !shownArea
      ? "Choose the area first."
      : layer === "pain_map" && needsSide && !areaSide
        ? "Choose left or right."
        : failed
          ? "We couldn't check whether it was saved. Try again."
          : copy.missing;
  useEffect(() => {
    onRecord(recordId, missingNow);
  }, [recordId, missingNow, onRecord]);

  useEffect(() => {
    if (!onQuick) return;
    onQuick(scoreReady ? quickSave : null);
  }, [onQuick, scoreReady, quickSave]);
  useEffect(() => () => onQuick?.(null), [onQuick]);

  const neuroPrevious = useMemo(() => (layer === "neuro_exam" ? parseNeuroAssessments((rows ?? []) as unknown as NeuroAssessmentRow[])[0] ?? null : null), [layer, rows]);
  const pedsPrevious = useMemo(() => (layer === "peds_exam" ? parsePedsAssessments((rows ?? []) as unknown as PedsAssessmentRow[])[0] ?? null : null), [layer, rows]);

  return (
    <div data-testid={`layer-${layer}`} className="space-y-3">
      {/* The quick score works even when the record could not be read: it
          only adds a reading, and "last time" then says nothing. */}
      {layer === "pain_map" && (rows || failed) && (
        <div data-testid="pain-quick-score" className="space-y-3 rounded-xl border border-slate-200 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p id={scaleLabelId} className="text-base font-semibold text-slate-900">
              {areaDef ? (
                <>
                  Pain now in the {areaDef.label.toLowerCase()}
                  {areaSide ? ` (${areaSide})` : ""}, 0 to 10
                </>
              ) : (
                "Which area? Then the pain now, 0 to 10"
              )}
            </p>
            <button
              type="button"
              aria-expanded={choosingArea}
              onClick={() => setChoosingArea((v) => !v)}
              className="min-h-[44px] rounded-xl px-3 text-sm font-semibold text-teal-800 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
            >
              {areaDef ? "Change area" : "Choose the area"}
            </button>
          </div>
          {(choosingArea || !areaDef) && (
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Area">
              {PAIN_MAP_REGIONS.map((r) => (
                <button
                  key={r.key}
                  type="button"
                  aria-pressed={shownArea?.region === r.key}
                  onClick={() => {
                    setArea({ region: r.key, side: r.paired ? (shownArea?.side === "right" ? "right" : "left") : "na" });
                    setChoosingArea(false);
                  }}
                  className={`min-h-[44px] rounded-full border px-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 ${
                    shownArea?.region === r.key ? "border-teal-700 bg-teal-50 text-teal-900" : "border-slate-300 bg-white text-slate-800"
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          )}
          {needsSide && shownArea && (
            <div className="inline-flex rounded-xl bg-slate-100 p-0.5" role="group" aria-label="Side">
              {(["left", "right"] as const).map((sd) => (
                <button
                  key={sd}
                  type="button"
                  aria-pressed={areaSide === sd}
                  onClick={() => setArea({ region: shownArea.region, side: sd })}
                  className={`min-h-[44px] rounded-lg px-4 text-sm font-semibold capitalize focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 ${
                    areaSide === sd ? "bg-white text-slate-900 shadow-sm" : "text-slate-700"
                  }`}
                >
                  {sd}
                </button>
              ))}
            </div>
          )}
          <PainScaleButtons value={score} onChange={setScore} labelledBy={scaleLabelId} disabled={disabled || !shownArea} large />
          <p className="text-sm text-slate-700" data-testid="pain-quick-note">
            {[
              failed
                ? "We couldn't check last time's score."
                : lastForArea
                  ? `Last time ${formatPainOutOfTen(lastForArea.pain_percent)}${score !== null ? `, ${painChangeWords(lastForArea.pain_percent, score * 10).toLowerCase()}` : ""}.`
                  : "Nothing on record for this area yet.",
              score !== null ? "Save and next records it on the Pain Map." : null,
            ]
              .filter(Boolean)
              .join(" ")}
          </p>
        </div>
      )}
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
            recordId || layer === "pain_map" ? "border border-slate-300 bg-white text-slate-900 hover:border-teal-500" : "bg-teal-700 text-white hover:bg-teal-800"
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
        <details className="rounded-xl border border-slate-200 px-3">
          <summary className="flex min-h-[44px] cursor-pointer items-center text-sm font-semibold text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600">
            Show the Pain Map
          </summary>
          <div className="max-h-72 overflow-auto pb-2">
            <PainMapView assessments={rows as unknown as PainAssessmentRow[]} />
          </div>
        </details>
      )}
      {recording && layer === "pain_map" && rows && (
        <PainExamDialog
          endpoint={ENDPOINT.pain_map}
          patientId={patientId}
          initialRegion={(shownArea?.region as PainMapRegionKey | undefined) ?? null}
          initialSide={areaSide}
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
