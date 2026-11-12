"use client";

import { useState } from "react";
import AffectedSideFigure from "@/components/profile/neuro/AffectedSideFigure";
import NeuroExamPanel from "@/components/profile/neuro/NeuroExamPanel";
import WalkingLadder from "@/components/profile/neuro/WalkingLadder";
import WalkingSpeedBar from "@/components/profile/neuro/WalkingSpeedBar";
import type { NeuroAssessmentRow } from "@/lib/neuroExam";
import type { AffectedParts, SpeedZones, WalkingLadder as Ladder } from "@/lib/neuroProfile";
import type { Voice } from "@/lib/progressView";

/**
 * The neurological "condition picture": where the orthopaedic profile has the
 * body map, this is the examination - the same panel (history chips, the
 * change since the examination before, "Record a re-examination", the load
 * failure and empty states) - with a First exam / Latest switch, mirroring
 * the Pain Map's `snapshot`, beside the things worth seeing at a glance: the
 * affected-side figure (when the intake names a side), the walking-ability
 * ladder from FAC and the walking-speed zones. Each of those is drawn only
 * from something recorded; none is invented.
 *
 * Two columns from `lg`, the quick-look column sticky; one on a phone, and
 * the three quick looks sit two-up on a tablet.
 */
export default function NeuroPicture({
  voice,
  assessments,
  examsFailed,
  affected,
  affectedLabel,
  ladder,
  speed,
  record,
}: {
  voice: Voice;
  assessments: NeuroAssessmentRow[];
  examsFailed: boolean;
  affected: AffectedParts | null;
  affectedLabel: string | null;
  ladder: Ladder | null;
  speed: SpeedZones | null;
  record?: { endpoint: string; patientId: string; patientName?: string };
}) {
  const clinician = voice === "clinician";
  const [snapshot, setSnapshot] = useState<"first" | "latest">("latest");
  const canToggle = !examsFailed && assessments.length > 1;
  const shown = canToggle ? snapshot : "latest";
  const quick = [affected && affectedLabel ? "figure" : null, ladder ? "ladder" : null, speed ? "speed" : null].filter(Boolean);

  return (
    <section aria-label="Condition picture" className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6" data-testid="neuro-picture">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-lg font-bold text-slate-900">{clinician ? "Neurological examination" : "How your body is working now"}</h2>
          <p className="mt-0.5 text-sm text-slate-700">
            {clinician
              ? "Tone, power, reflexes, sensation, coordination, balance and gait - the examination shown, and what changed since the one before."
              : "What your physiotherapist found when they examined you, and how it has changed."}
          </p>
        </div>
        {canToggle && (
          <div role="group" aria-label="Show which exam" className="inline-flex w-full rounded-xl bg-slate-100 p-1 sm:w-auto">
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
                  shown === key ? "bg-white text-slate-900 shadow-sm" : "text-slate-700 hover:text-slate-900"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className={`grid gap-5 ${quick.length > 0 ? "lg:grid-cols-[minmax(0,19rem)_minmax(0,1fr)] lg:items-start" : ""}`}>
        {quick.length > 0 && (
          <div className="min-w-0 lg:sticky lg:top-4 lg:max-h-[calc(100dvh-2rem)] lg:overflow-y-auto">
            <div className="grid items-start gap-3 sm:grid-cols-2 lg:grid-cols-1">
              {affected && affectedLabel && (
                <div className="flex min-w-0 items-center justify-center rounded-xl border border-slate-200 bg-white p-3.5">
                  <AffectedSideFigure parts={affected} label={affectedLabel} voice={voice} />
                </div>
              )}
              {ladder && <WalkingLadder ladder={ladder} voice={voice} />}
              {speed && <WalkingSpeedBar zones={speed} voice={voice} />}
            </div>
          </div>
        )}
        <div className="min-w-0">
          <NeuroExamPanel key={shown} snapshot={shown} assessments={assessments} loadFailed={examsFailed} voice={voice} record={record} />
        </div>
      </div>
    </section>
  );
}
