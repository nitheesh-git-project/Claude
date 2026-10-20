"use client";

import { useMemo, useState } from "react";
import NeuroExamDialog from "@/components/profile/neuro/NeuroExamDialog";
import NeuroExamSummary from "@/components/profile/neuro/NeuroExamSummary";
import { EmptyState } from "@/components/dashboard/SurfaceCard";
import { useRouter } from "@/lib/useRouter";
import { formatClinicDate } from "@/lib/formatDateTime";
import { parseNeuroAssessments, type NeuroAssessmentRow } from "@/lib/neuroExam";

/** How many exam dates the picker shows before "Show all". */
const RECENT_EXAMS = 6;

/**
 * The neurological examination layer: the arm of `SpecialtyExamPanel` for a
 * patient recorded as neurological, the counterpart of `PainMapExplorer`.
 *
 * Shared by the therapist's chart, the patient's Health Profile and the
 * admin's condition detail, like the Pain Map. The newest examination is
 * shown, compared with the one before it; earlier ones are a tap away. The
 * history picker is a row of dated buttons rather than a `<select>`, the
 * same choice the Pain Map's region chips made.
 *
 * Three states before any data, each its own sentence: the read failed
 * ("couldn't check" is not "nothing recorded"), nothing recorded yet, and
 * the chart itself.
 */
export default function NeuroExamPanel({
  assessments,
  loadFailed = false,
  voice,
  record,
}: {
  assessments: NeuroAssessmentRow[];
  loadFailed?: boolean;
  voice: "patient" | "clinician";
  /** Present only for a viewer allowed to record an examination. */
  record?: { endpoint: string; patientId: string; patientName?: string };
}) {
  const router = useRouter();
  const exams = useMemo(() => parseNeuroAssessments(assessments), [assessments]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [recording, setRecording] = useState(false);
  const clinician = voice === "clinician";

  const selectedIndex = Math.max(
    0,
    exams.findIndex((e) => e.id === selectedId)
  );
  const selected = exams[selectedIndex] ?? null;
  const previous = exams[selectedIndex + 1] ?? null;
  const visible = showAll ? exams : exams.slice(0, RECENT_EXAMS);

  const recordButton = record && (
    <button
      type="button"
      onClick={() => setRecording(true)}
      className="rounded-xl bg-teal-700 px-4 py-2 text-xs font-semibold text-white transition hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2"
    >
      <i aria-hidden className="fa-solid fa-notes-medical mr-1.5" />
      {exams.length === 0 ? "Record an examination" : "Record a re-examination"}
    </button>
  );

  let body;
  if (loadFailed) {
    body = (
      <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <p className="font-semibold">
          {clinician ? "We couldn't load the examinations just now." : "We couldn't load your examination just now."}
        </p>
        <p className="mt-0.5 text-xs">
          Nothing is lost - this is a problem reading the record, not an empty one.{" "}
          <button
            type="button"
            onClick={() => router.refresh()}
            className="rounded font-semibold underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-700"
          >
            Try again
          </button>
        </p>
      </div>
    );
  } else if (!selected) {
    body = (
      <EmptyState
        icon="fa-brain"
        title={clinician ? "No neurological examination recorded yet" : "No examination recorded yet"}
        body={
          clinician
            ? record
              ? "Record tone, power, reflexes, sensation, coordination, balance and gait from a session you've run. Each re-examination is compared with the one before it."
              : "Examinations appear here as the treating therapist records them."
            : "After your therapist examines you, what they found - strength, stiffness, balance and walking - appears here, and how it changes over time."
        }
        action={recordButton || undefined}
      />
    );
  } else {
    body = (
      <>
        {exams.length > 1 && (
          <div className="mb-4">
            <p id="neuro-exam-history" className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              {clinician ? `Examinations on record (${exams.length})` : `Your examinations (${exams.length})`}
            </p>
            <div role="group" aria-labelledby="neuro-exam-history" className="flex flex-wrap gap-1.5">
              {visible.map((exam, index) => {
                const active = exam.id === selected.id;
                return (
                  <button
                    key={exam.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setSelectedId(exam.id)}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 ${
                      active ? "border-teal-700 bg-teal-700 text-white" : "border-slate-200 text-slate-600 hover:border-teal-400"
                    }`}
                  >
                    {formatClinicDate(exam.createdAt)}
                    {index === 0 && <span className="ml-1 font-normal opacity-80">(latest)</span>}
                  </button>
                );
              })}
              {exams.length > RECENT_EXAMS && (
                <button
                  type="button"
                  onClick={() => setShowAll((v) => !v)}
                  className="rounded-full px-2 py-1 text-xs font-semibold text-teal-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
                >
                  {showAll ? "Show fewer" : `Show all ${exams.length}`}
                </button>
              )}
            </div>
          </div>
        )}
        <NeuroExamSummary exam={selected} previous={previous} voice={voice} />
      </>
    );
  }

  return (
    <div>
      {recordButton && (selected || loadFailed) && <div className="mb-4 flex justify-end">{recordButton}</div>}
      {body}
      {recording && record && (
        <NeuroExamDialog
          endpoint={record.endpoint}
          patientId={record.patientId}
          patientName={record.patientName}
          previous={exams[0] ?? null}
          onClose={() => setRecording(false)}
        />
      )}
    </div>
  );
}
