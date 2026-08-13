"use client";

import { useEffect, useRef, useState } from "react";
import {
  PAIN_MAP_REGIONS,
  latestAssessmentByRegionSide,
  painBand,
  PAIN_BAND_LABEL,
  type PainMapRegionKey,
  type PainMapSide,
  type PainAssessmentRow,
} from "@/lib/painMap";
import { type AreaPainEntry } from "@/lib/conditionIntake";
import BodyMapDiagram from "@/components/profile/BodyMapDiagram";

const PAIN_BAND_STYLE: Record<string, string> = {
  low: "bg-emerald-100 text-emerald-700",
  mid: "bg-amber-100 text-amber-700",
  high: "bg-red-100 text-red-700",
};

const POPUP_WIDTH = 240;
const POPUP_HALF = POPUP_WIDTH / 2;
const POPUP_MARGIN = 8;

type Selection = { region: PainMapRegionKey; side: PainMapSide; left: number; top: number };

// The payoff of sharing one region list between the patient's own
// self-report (area_pain, patient_condition_profiles) and the therapist's
// clinical exam (pain_assessments): overlay both on one figure so a
// therapist or admin can see at a glance where what the patient reported
// and what the exam found agree or don't. Fill = therapist's Pain Map
// band; blue ring = patient also flagged this area themselves.
export default function PainComparisonView({
  assessments,
  areaPain,
}: {
  assessments: PainAssessmentRow[];
  areaPain: AreaPainEntry[];
}) {
  const [selection, setSelection] = useState<Selection | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  const latestByKey = latestAssessmentByRegionSide(assessments);
  const secondaryByKey = new Map(areaPain.map((a) => [`${a.region}:${a.side}`, a.pain]));
  const allKeys = new Set([...latestByKey.keys(), ...secondaryByKey.keys()]);

  useEffect(() => {
    if (!selection) return;
    function handlePointerDown(e: MouseEvent) {
      const target = e.target as Node;
      if (popupRef.current?.contains(target) || containerRef.current?.contains(target)) return;
      setSelection(null);
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [selection]);

  function handleSelect(region: PainMapRegionKey, side: PainMapSide, rect: DOMRect) {
    setSelection((current) => {
      if (current?.region === region && current?.side === side) return null;
      const containerRect = containerRef.current?.getBoundingClientRect();
      if (!containerRect) return null;
      const rawLeft = rect.left - containerRect.left + rect.width / 2;
      const left = Math.min(
        Math.max(rawLeft, POPUP_HALF + POPUP_MARGIN),
        containerRect.width - POPUP_HALF - POPUP_MARGIN
      );
      return { region, side, left, top: rect.top - containerRect.top };
    });
  }

  if (allKeys.size === 0) {
    return (
      <p className="text-xs text-slate-500">
        Nothing to compare yet — no self-reported areas or clinical assessments on record.
      </p>
    );
  }

  const selectedRegionDef = selection ? PAIN_MAP_REGIONS.find((r) => r.key === selection.region) : null;
  const selectedClinical = selection ? latestByKey.get(`${selection.region}:${selection.side}`) : null;
  const selectedSelfReport = selection ? secondaryByKey.get(`${selection.region}:${selection.side}`) : null;
  const selectedNote = selection
    ? areaPain.find((a) => a.region === selection.region && a.side === selection.side)?.note
    : null;

  return (
    <div>
      <div className="flex items-center gap-4 mb-3 text-[11px] text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-slate-400" /> Therapist assessed (fill)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full ring-2 ring-blue-600" /> Patient self-reported
          (ring)
        </span>
      </div>

      <div ref={containerRef} className="relative">
        <BodyMapDiagram
          latestByKey={latestByKey}
          secondaryByKey={secondaryByKey}
          selected={selection}
          onSelect={handleSelect}
        />

        {selection && selectedRegionDef && (
          <div
            ref={popupRef}
            className="absolute z-10 w-60 -translate-x-1/2 -translate-y-[calc(100%+12px)] rounded-xl border border-slate-200 bg-white p-3 shadow-lg"
            style={{ left: selection.left, top: selection.top }}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-bold text-slate-800">
                {selectedRegionDef.label}
                {selectedRegionDef.paired && selection.side !== "na" ? ` (${selection.side})` : ""}
              </p>
              <button
                type="button"
                onClick={() => setSelection(null)}
                className="shrink-0 text-slate-400 hover:text-slate-600"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <div className="mt-2 space-y-1.5">
              <p className="text-xs text-slate-600">
                <span className="font-semibold">Therapist: </span>
                {selectedClinical ? (
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${PAIN_BAND_STYLE[painBand(selectedClinical.pain_percent)]}`}
                  >
                    {selectedClinical.pain_percent}% · {PAIN_BAND_LABEL[painBand(selectedClinical.pain_percent)]}
                  </span>
                ) : (
                  "Not assessed yet"
                )}
              </p>
              <p className="text-xs text-slate-600">
                <span className="font-semibold">Patient: </span>
                {selectedSelfReport != null ? `${selectedSelfReport}/10` : "Not reported"}
              </p>
              {selectedNote && <p className="text-xs text-slate-500 italic">&quot;{selectedNote}&quot;</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
