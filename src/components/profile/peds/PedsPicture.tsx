"use client";

import { useState } from "react";
import MilestoneWindowChart from "@/components/profile/peds/MilestoneWindowChart";
import PedsExamDialog from "@/components/profile/peds/PedsExamDialog";
import { useRouter } from "@/lib/useRouter";
import { formatClinicDate } from "@/lib/formatDateTime";
import { describePedsChange, gmfcsLabel, GMFCS_LEVELS } from "@/lib/pedsExam";
import { pedsChartUnplacedReason } from "@/lib/pedsChartGeometry";
import type { PedsChecklistItem, PedsExamView } from "@/lib/pedsProfileView";
import type { Voice } from "@/lib/progressView";

/**
 * The paediatric "condition picture": where the orthopaedic profile has the
 * body map and the neurological one the examination, this is the milestone
 * chart - one bar per WHO milestone for the usual age range and a marker for
 * where this child is - with a First exam / Latest switch (the neurological
 * picture's), the list of what the child does on their own (the intake's tick
 * list, in the parent's words), and what the examination also holds: the
 * GMFCS level, equipment and the note.
 *
 * Four states before the chart, each its own sentence: the date of birth
 * cannot be right for a child (no chart, a card saying so - to the clinician
 * how to fix it, to the family only that it is being checked), the
 * examinations could not be read ("couldn't check" is not "nothing
 * recorded"), nothing recorded yet, and the chart itself. The clinician's
 * prompts (a doctor's review for a child not walking by 18 months corrected;
 * walking alone not assessed yet) are clinician-voice only.
 */
export default function PedsPicture({
  voice,
  exam,
  checklist,
  dobImplausible,
  record,
}: {
  voice: Voice;
  exam: PedsExamView;
  checklist: PedsChecklistItem[];
  dobImplausible: "future" | "adult" | null;
  record?: { endpoint: string; patientId: string; patientName?: string };
}) {
  const router = useRouter();
  const clinician = voice === "clinician";
  const [snapshot, setSnapshot] = useState<"first" | "latest">("latest");
  const [recording, setRecording] = useState(false);
  const canToggle = !exam.examsFailed && exam.first !== null && !dobImplausible;
  const shown = canToggle ? snapshot : "latest";
  const windows =
    shown === "first" && exam.firstWindows ? exam.firstWindows : exam.windows;
  const selected = shown === "first" ? exam.first : exam.latest;
  const findings = selected?.findings ?? null;
  const unplaced = pedsChartUnplacedReason(windows.age, voice);
  const done = checklist.filter((c) => c.done).length;

  const recordButton = record && (
    <button
      type="button"
      onClick={() => setRecording(true)}
      className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 text-sm font-semibold text-white transition hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 print:hidden"
    >
      <i aria-hidden className="fa-solid fa-notes-medical text-xs" />
      {exam.exams.length === 0
        ? "Record the paediatric exam"
        : "Record a re-examination"}
    </button>
  );

  let chartBlock;
  if (dobImplausible) {
    chartBlock = clinician ? (
      <div
        role="status"
        className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-4 text-sm text-amber-900"
        data-testid="peds-dob-card"
      >
        <p className="font-display text-base font-bold">
          Check the date of birth
        </p>
        <p className="mt-1 leading-relaxed">
          {dobImplausible === "future"
            ? "The date of birth on file is in the future, so the milestone chart is not drawn."
            : "The date of birth on file makes this patient an adult, most likely the parent's own entered when the account was opened, so the milestone chart is not drawn."}
        </p>
        <p className="mt-1 leading-relaxed">
          The family corrects it under Profile on their account (date of birth
          is a reviewed field: the change goes to the clinic to approve). The
          examinations below are kept and appear on the chart once the date is
          right.
        </p>
      </div>
    ) : (
      <div
        role="status"
        className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-800"
        data-testid="peds-dob-card"
      >
        <p className="font-semibold">
          We&apos;re checking your child&apos;s date of birth
        </p>
        <p className="mt-1 text-slate-700">
          The milestone chart appears once it has been confirmed.
        </p>
      </div>
    );
  } else if (exam.examsFailed) {
    chartBlock = (
      <div
        role="status"
        className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
      >
        <p className="font-semibold">
          {clinician
            ? "We couldn't load the examinations just now."
            : "We couldn't load your child's examination just now."}
        </p>
        <p className="mt-0.5 text-xs">
          Nothing is lost - this is a problem reading the record, not an empty
          one.{" "}
          <button
            type="button"
            onClick={() => router.refresh()}
            className="min-h-[44px] rounded font-semibold underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-700"
          >
            Try again
          </button>
        </p>
      </div>
    );
  } else {
    chartBlock = (
      <>
        {exam.birthFailed && (
          <p
            role="status"
            className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
          >
            {
              "We couldn't read the date of birth just now, so the milestones are listed but not placed on the chart. It is not missing - please try again in a moment."
            }
          </p>
        )}
        {!exam.birthFailed && unplaced && (
          <p
            role="status"
            className="mb-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800"
          >
            {unplaced}
          </p>
        )}
        {exam.exams.length === 0 && (
          <p
            role="status"
            className="mb-3 rounded-xl border border-dashed border-slate-300 bg-slate-50/60 px-4 py-3 text-sm text-slate-700"
            data-testid="peds-no-exam"
          >
            {clinician
              ? record
                ? "No paediatric examination recorded yet. Record the milestones you looked for in a session; each re-examination is compared with the one before."
                : "No paediatric examination recorded yet. It appears here as the treating physiotherapist records it."
              : "Your child's physiotherapist will check each of these milestones in a session. They appear here, with when each came, as they do."}
          </p>
        )}
        <MilestoneWindowChart key={shown} windows={windows} voice={voice} />
        <p className="mt-2 text-[11px] text-slate-600">
          {windows.verificationNote}
        </p>
      </>
    );
  }

  const clinicianFlags = clinician && !dobImplausible && !exam.examsFailed && (
    <>
      {exam.referral && (
        <p
          role="note"
          className="mt-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900"
          data-testid="peds-referral"
        >
          {exam.referral.clinicianText}
        </p>
      )}
      {exam.walkingNotAssessed && (
        <p
          role="note"
          className="mt-3 rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-800"
          data-testid="peds-walking-not-assessed"
        >
          {exam.walkingNotAssessed.clinicianText}
        </p>
      )}
    </>
  );

  const examExtras = selected && !exam.examsFailed && !dobImplausible && (
    <div
      className="mt-4 space-y-3 border-t border-slate-100 pt-4"
      data-testid="peds-exam-extras"
    >
      <p className="text-xs text-slate-700">
        {shown === "first"
          ? "First examination"
          : exam.exams.length > 1
            ? "Latest examination"
            : "Examination"}
        , {formatClinicDate(selected.createdAt)}
        {selected.submittedByRole === "admin"
          ? clinician
            ? ", recorded by the clinic"
            : ", recorded by the clinic"
          : ""}
      </p>
      {shown === "latest" && exam.tally && (
        <p className="text-sm text-slate-800" data-testid="peds-tally">
          {clinician
            ? `${exam.tally.achieved} achieved, ${exam.tally.emerging} emerging, ${exam.tally.notYet} not yet, ${exam.tally.notAssessed} not assessed${
                exam.tally.reportedOnly > 0
                  ? ` (${exam.tally.reportedOnly} on the parent's word alone)`
                  : ""
              }.`
            : `${exam.tally.achieved} of 6 reached${exam.tally.emerging > 0 ? `, ${exam.tally.emerging} starting to come` : ""}.`}
        </p>
      )}
      {shown === "latest" &&
        exam.changes.some(
          (c) =>
            clinician ||
            (c.id.startsWith("milestone.") && !c.id.endsWith(".source")),
        ) && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
              {clinician ? "Since the examination before" : "Since last time"}
            </p>
            <ul className="mt-1 space-y-1 text-sm text-slate-800">
              {exam.changes
                .filter(
                  (c) =>
                    clinician ||
                    (c.id.startsWith("milestone.") &&
                      !c.id.endsWith(".source")),
                )
                .map((c) => (
                  <li key={c.id} className="[overflow-wrap:anywhere]">
                    {describePedsChange(c, clinician ? "clinician" : "patient")}
                  </li>
                ))}
            </ul>
          </div>
        )}
      {findings?.gmfcsLevel !== undefined && (
        <p className="text-sm text-slate-800">
          <span className="font-semibold">
            {clinician ? "GMFCS" : "Movement level (GMFCS)"}:
          </span>{" "}
          {gmfcsLabel(findings.gmfcsLevel)} -{" "}
          {GMFCS_LEVELS.find(
            (g) => g.value === findings.gmfcsLevel,
          )?.meaning.toLowerCase()}
        </p>
      )}
      {findings?.equipment && (
        <p className="text-sm text-slate-800 [overflow-wrap:anywhere]">
          <span className="font-semibold">
            {clinician ? "Orthoses and equipment" : "Braces and equipment"}:
          </span>{" "}
          {findings.equipment}
        </p>
      )}
      {findings?.notes && (
        <p className="whitespace-pre-line text-sm text-slate-800 [overflow-wrap:anywhere]">
          <span className="font-semibold">Notes:</span> {findings.notes}
        </p>
      )}
    </div>
  );

  return (
    <section
      aria-label="Condition picture"
      className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6"
      data-testid="peds-picture"
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-lg font-bold text-slate-900">
            {clinician
              ? "Movement milestones by age"
              : "How your child is moving"}
          </h2>
          <p className="mt-0.5 text-sm text-slate-700">
            {clinician
              ? "Each bar is the age range in which most children reach the skill (WHO). The marker is when this child did, or where they are today."
              : "Each bar is the age range in which most children reach that skill. The marker shows when your child did, or where they are today."}
            {windows.age.status === "ok" && windows.age.basis === "corrected"
              ? " Ages are corrected for being born early."
              : ""}
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          {canToggle && (
            <div
              role="group"
              aria-label="Show which exam"
              className="inline-flex w-full rounded-xl bg-slate-100 p-1 sm:w-auto"
            >
              {(
                [
                  ["first", "First exam"],
                  ["latest", "Latest"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={shown === key}
                  onClick={() => setSnapshot(key)}
                  className={`min-h-[44px] flex-1 rounded-lg px-4 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 sm:flex-none ${
                    shown === key
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-700 hover:text-slate-900"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          {recordButton}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,19rem)] lg:items-start">
        <div className="min-w-0">
          {chartBlock}
          {clinicianFlags}
          {examExtras}
        </div>

        {checklist.length > 0 && (
          <aside
            aria-label={
              clinician
                ? "What the parent says they do on their own"
                : "What your child does on their own"
            }
            className="min-w-0 rounded-xl border border-slate-200 bg-white p-3.5"
            data-testid="peds-checklist"
          >
            <h3 className="font-display text-sm font-bold text-slate-900">
              {clinician
                ? "Does on their own (parent's report)"
                : "What your child does on their own"}
            </h3>
            <p className="mt-0.5 text-xs text-slate-700">
              {done} of {checklist.length} ticked
              {clinician ? " at intake" : " - as you told us"}.
            </p>
            <ul className="mt-2 grid gap-1 sm:grid-cols-2 lg:grid-cols-1">
              {checklist.map((c) => (
                <li
                  key={c.label}
                  className={`flex items-start gap-2 text-sm ${c.done ? "text-slate-900" : "text-slate-600"}`}
                >
                  <i
                    aria-hidden
                    className={`fa-solid mt-0.5 text-xs ${c.done ? "fa-circle-check text-emerald-700" : "fa-circle text-slate-300"}`}
                  />
                  <span className="[overflow-wrap:anywhere]">
                    {c.label}
                    <span className="sr-only">
                      {c.done ? " - can do" : " - not yet"}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </aside>
        )}
      </div>

      {recording && record && (
        <PedsExamDialog
          endpoint={record.endpoint}
          patientId={record.patientId}
          patientName={record.patientName}
          previous={exam.exams[0] ?? null}
          onClose={() => setRecording(false)}
        />
      )}
    </section>
  );
}
