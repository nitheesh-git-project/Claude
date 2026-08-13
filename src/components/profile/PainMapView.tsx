"use client";

import { useEffect, useRef, useState } from "react";
import {
  PAIN_MAP_REGIONS,
  latestAssessmentByRegionSide,
  painBand,
  painTrend,
  PAIN_BAND_LABEL,
  type PainMapRegionKey,
  type PainMapSide,
  type PainAssessmentRow,
} from "@/lib/painMap";
import BodyMapDiagram from "@/components/profile/BodyMapDiagram";
import PainMapSummary from "@/components/profile/PainMapSummary";

const PAIN_BAND_STYLE: Record<string, string> = {
  low: "bg-emerald-100 text-emerald-700",
  mid: "bg-amber-100 text-amber-700",
  high: "bg-red-100 text-red-700",
};

const POPUP_WIDTH = 224; // matches w-56
const POPUP_HALF = POPUP_WIDTH / 2;
const POPUP_MARGIN = 8;

type Selection = { region: PainMapRegionKey; side: PainMapSide; left: number; top: number };

// Read-only Pain Map surface: the tap-point body diagram, a popup
// anchored right at the tapped dot showing that region's detail, and the
// existing pill-list underneath as an accessible/scannable fallback.
// Used by the patient (view-only, per the product decision) and the
// admin.
export default function PainMapView({ assessments }: { assessments: PainAssessmentRow[] }) {
  const [selection, setSelection] = useState<Selection | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const latestByKey = latestAssessmentByRegionSide(assessments);

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
      if (current?.region === region && current?.side === side) return null; // tap same dot again to close
      const containerRect = containerRef.current?.getBoundingClientRect();
      if (!containerRect) return null;
      const rawLeft = rect.left - containerRect.left + rect.width / 2;
      const left = Math.min(
        Math.max(rawLeft, POPUP_HALF + POPUP_MARGIN),
        containerRect.width - POPUP_HALF - POPUP_MARGIN
      );
      const top = rect.top - containerRect.top;
      return { region, side, left, top };
    });
  }

  const selectedRegionDef = selection ? PAIN_MAP_REGIONS.find((r) => r.key === selection.region) : null;
  const selectedLatest = selection ? latestByKey.get(`${selection.region}:${selection.side}`) : null;
  const selectedHistory = selection
    ? assessments
        .filter((a) => a.region === selection.region && a.side === selection.side)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    : [];
  const selectedPrevious = selectedHistory[1] ?? null;

  return (
    <div>
      <div ref={containerRef} className="relative">
        <BodyMapDiagram
          latestByKey={latestByKey}
          selected={selection}
          onSelect={handleSelect}
        />

        {selection && selectedRegionDef && (
          <div
            ref={popupRef}
            className="absolute z-10 w-56 -translate-x-1/2 -translate-y-[calc(100%+12px)] rounded-xl border border-slate-200 bg-white p-3 shadow-lg"
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
            {selectedLatest ? (
              <>
                <p className="mt-1">
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${PAIN_BAND_STYLE[painBand(selectedLatest.pain_percent)]}`}
                  >
                    {selectedLatest.pain_percent}% · {PAIN_BAND_LABEL[painBand(selectedLatest.pain_percent)]}
                    {(() => {
                      const trend = painTrend(selectedLatest.pain_percent, selectedPrevious?.pain_percent ?? null);
                      return trend === "down" ? " ↓" : trend === "up" ? " ↑" : "";
                    })()}
                  </span>
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Last assessed {new Date(selectedLatest.created_at).toLocaleString()}
                  {selectedHistory.length > 1 && ` · ${selectedHistory.length} assessments on record`}
                </p>
              </>
            ) : (
              <p className="text-xs text-slate-500 mt-1">Not assessed yet.</p>
            )}
          </div>
        )}
      </div>

      <div className="mt-6 pt-6 border-t border-slate-100">
        <PainMapSummary assessments={assessments} />
      </div>
    </div>
  );
}
