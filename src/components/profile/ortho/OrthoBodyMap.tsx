"use client";

import { useState } from "react";
import PainMapExplorer from "@/components/profile/PainMapExplorer";
import KneeBendGauge from "@/components/profile/ortho/KneeBendGauge";
import StrengthBar from "@/components/profile/ortho/StrengthBar";
import type { AreaProgress, KneeBend, KneeStraightening, LegStrength } from "@/lib/orthoProfile";
import { straighteningText } from "@/lib/orthoProfile";
import { formatClinicDate } from "@/lib/formatDateTime";
import type { AreaPainEntry } from "@/lib/conditionIntake";
import type { PainAssessmentRow, QuestionOverrideRow } from "@/lib/painMap";
import type { Voice } from "@/lib/progressView";

const CHANGE_TONE: Record<AreaProgress["change"], string> = {
  better: "text-emerald-800",
  worse: "text-red-800",
  same: "text-slate-700",
  only_one: "text-slate-700",
};

/**
 * The orthopaedic body-map card: the existing Pain Map (same figure, same
 * popups, same right/left orientation, same recording dialog) with a
 * First exam / Latest switch, a first / now / change card for every area
 * examined, and the knee-bend dial and leg-strength bar beside them.
 *
 * Nothing here re-implements the Pain Map; it hands PainMapExplorer a
 * `snapshot` and lays the rest out around it. The cards replace the ranked
 * list under the figure (`showStandings={false}`) because they carry the
 * same scores and the move since the first exam. The dial and bar come from
 * the recorded measurements, so when those could not be read they say so
 * instead of vanishing.
 */
export default function OrthoBodyMap({
  voice,
  assessments,
  areaPain,
  areas,
  kneeBend,
  legStrength,
  straightening,
  measuresFailed,
  record,
}: {
  voice: Voice;
  assessments: PainAssessmentRow[];
  areaPain: AreaPainEntry[];
  areas: AreaProgress[];
  kneeBend: KneeBend | null;
  legStrength: LegStrength | null;
  straightening: KneeStraightening | null;
  measuresFailed: boolean;
  record?: { endpoint: string; patientId: string; overridesByRegion: Record<string, QuestionOverrideRow[]> };
}) {
  const clinician = voice === "clinician";
  const [snapshot, setSnapshot] = useState<"first" | "latest">("latest");
  const canToggle = areas.some((a) => a.change !== "only_one");
  const shown = canToggle ? snapshot : "latest";
  const lines = straightening ? (
      <p className="text-xs leading-relaxed text-slate-700">
        {straightening.passive && (
          <span className="block">
            {clinician ? "Straightening, passive" : "Straightens when the physio moves it"}: {straighteningText(straightening.passive.now)}
            {straightening.passive.first !== straightening.passive.now && ` (was ${straightening.passive.first}°)`}
          </span>
        )}
        {straightening.active && (
          <span className="block">
            {clinician ? "Straightening, active" : "Straightens on your own"}: {straighteningText(straightening.active.now)}
            {straightening.active.first !== straightening.active.now && ` (was ${straightening.active.first}°)`}
          </span>
        )}
        {straightening.lag && (
          <span className="block font-semibold">
            {clinician ? "Extension lag" : "Gap between the two"}: {straightening.lag.now === 0 ? "none" : `${straightening.lag.now}°`}
            {straightening.lag.first !== null && straightening.lag.first !== straightening.lag.now && ` (was ${straightening.lag.first}°)`}
          </span>
        )}
      </p>
  ) : null;
  const sideWord = (side: string | null) => (side ? `${side[0].toUpperCase()}${side.slice(1)} ` : "");

  return (
    <section aria-label="Body map" className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-lg font-bold text-slate-900">{clinician ? "Pain Map" : "Your body map"}</h2>
          <p className="mt-0.5 text-sm text-slate-700">
            {clinician
              ? "Scored at each exam. Tap a marked point for that area's detail."
              : "Scored by your physiotherapist at each exam. Tap any marked point for that area's detail."}
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

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
        <div className="min-w-0 lg:sticky lg:top-4">
          <PainMapExplorer assessments={assessments} areaPain={areaPain} showStandings={false} snapshot={shown} record={record} />
        </div>

        <div className="min-w-0 space-y-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Area by area</h3>
            {areas.length === 0 ? (
              <p className="mt-2 rounded-xl border border-dashed border-slate-300 bg-slate-50/60 px-4 py-4 text-sm text-slate-700">
                {clinician ? "No area has been scored yet. Record an exam to start the body map." : "Your physiotherapist scores each painful area at an exam. They appear here after that."}
              </p>
            ) : (
              <ul className="mt-2 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                {areas.map((a) => (
                  <li key={a.key} className="min-w-0 rounded-xl border border-slate-200 p-3">
                    <div className="flex items-baseline justify-between gap-2 text-sm font-semibold text-slate-900">
                      <span className="min-w-0 [overflow-wrap:anywhere]">{a.label}</span>
                      <span className="shrink-0">{a.nowText}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-700">
                      First exam {a.firstText}
                      {a.change !== "only_one" && " - "}
                      {a.change !== "only_one" && <span className={`font-semibold ${CHANGE_TONE[a.change]}`}>{a.changeText}</span>}
                      {a.change === "only_one" && <span className="font-semibold"> - {a.changeText}</span>}
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-600">Latest scored {formatClinicDate(a.nowAt)}</p>
                  </li>
                ))}
              </ul>
            )}
            <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-700" aria-label="Colour key">
              <li className="inline-flex items-center gap-1"><span aria-hidden className="h-2.5 w-2.5 rounded-full bg-amber-400" />Under 4</li>
              <li className="inline-flex items-center gap-1"><span aria-hidden className="h-2.5 w-2.5 rounded-full bg-orange-700" />4 to 6</li>
              <li className="inline-flex items-center gap-1"><span aria-hidden className="h-2.5 w-2.5 rounded-full bg-red-700" />7 and over</li>
            </ul>
          </div>

          {measuresFailed ? (
            <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {"We couldn't load the movement and strength readings just now."} They are not missing - please try again in a moment.
            </p>
          ) : kneeBend || legStrength ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              {kneeBend && (
                <KneeBendGauge
                  title={`${sideWord(kneeBend.side)}knee bend${kneeBend.mode === "passive" ? " (moved for you)" : ""}`}
                  value={kneeBend.now}
                  start={kneeBend.series.points.length > 1 ? kneeBend.first : null}
                  goal={kneeBend.goal}
                  goalReached={kneeBend.goalReached}
                  max={kneeBend.usual + 15}
                />
              )}
              {legStrength && (
                <StrengthBar
                  title={`${sideWord(legStrength.side)}${clinician ? legStrength.group.toLowerCase() : "leg strength"}`.trim()}
                  subtitle={clinician ? "As a percentage of the other side" : "Thigh muscle, as % of the other leg"}
                  percent={legStrength.now}
                  start={legStrength.series.points.length > 1 ? legStrength.first : null}
                  goal={legStrength.goal}
                >
                  {lines}
                </StrengthBar>
              )}
              {!legStrength && lines && <div className="rounded-xl border border-slate-200 p-3.5">{lines}</div>}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
