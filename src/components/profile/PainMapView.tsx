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

const PAIN_BAND_STYLE: Record<string, string> = {
  low: "bg-emerald-100 text-emerald-700",
  mid: "bg-amber-100 text-amber-700",
  high: "bg-red-100 text-red-700",
};

const POPUP_WIDTH = 256; // matches w-64
const POPUP_HALF = POPUP_WIDTH / 2;
const POPUP_MARGIN = 8;

const SUBMITTER_LABEL: Record<string, string> = {
  therapist: "your therapist",
  admin: "an admin",
};

// Tiny trend sparkline across every assessment on record for one region,
// oldest to newest -- the up/down arrow next to the latest number only
// tells you the last move, not the shape of the whole trend.
function Sparkline({ history }: { history: PainAssessmentRow[] }) {
  const chronological = [...history].reverse();
  const width = 200;
  const height = 32;
  const points = chronological.map((a, i) => {
    const x = chronological.length > 1 ? (i / (chronological.length - 1)) * width : width / 2;
    const y = height - (a.pain_percent / 100) * height;
    return `${x},${y}`;
  });
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-8 mt-1">
      <polyline points={points.join(" ")} fill="none" stroke="#0d9488" strokeWidth={2} />
      {chronological.map((a, i) => {
        const [x, y] = points[i].split(",").map(Number);
        return <circle key={a.created_at} cx={x} cy={y} r={2.5} fill="#0d9488" />;
      })}
    </svg>
  );
}

type Selection = {
  region: PainMapRegionKey;
  side: PainMapSide;
  left: number;
  top: number;
  placeAbove: boolean;
};

const MIN_SPACE_ABOVE = 160; // rough floor for "popup fits above without help"

// Read-only Pain Map surface: the tap-point body diagram plus a popup
// anchored right at the tapped dot showing that region's detail. The
// scannable ranked list that used to sit under it now lives in
// RegionStandingsList, rendered once by PainMapExplorer -- this component
// is only ever the figure, so the comparison view can swap in beside it
// without the list appearing twice.
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
      // Horizontal clamping above keeps the popup inside the container's
      // left/right edges; do the same on the vertical axis instead of
      // always translating upward from the tapped dot -- a dot near the
      // top of the diagram (neck, shoulder, chest) would otherwise push
      // the popup off the top of the visible area with no way back.
      const spaceAbove = rect.top - containerRect.top;
      const spaceBelow = containerRect.bottom - rect.bottom;
      const placeAbove = spaceAbove >= MIN_SPACE_ABOVE || spaceAbove >= spaceBelow;
      const top = placeAbove ? spaceAbove : rect.bottom - containerRect.top;
      return { region, side, left, top, placeAbove };
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
            className={`absolute z-10 w-64 -translate-x-1/2 rounded-xl border border-slate-200 bg-white p-3 shadow-lg ${
              selection.placeAbove ? "-translate-y-[calc(100%+12px)]" : "translate-y-3"
            }`}
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
                  {selectedLatest.submitted_by_role &&
                    ` by ${SUBMITTER_LABEL[selectedLatest.submitted_by_role] ?? selectedLatest.submitted_by_role}`}
                </p>
                {selectedHistory.length > 1 && (
                  <>
                    <Sparkline history={selectedHistory} />
                    <details className="mt-1">
                      <summary className="text-[11px] font-semibold text-teal-700 cursor-pointer">
                        {selectedHistory.length} assessments on record
                      </summary>
                      <ul className="mt-1.5 space-y-1 max-h-32 overflow-y-auto">
                        {selectedHistory.map((a) => (
                          <li key={a.created_at} className="text-[11px] text-slate-500 flex justify-between gap-2">
                            <span>{new Date(a.created_at).toLocaleDateString()}</span>
                            <span className="font-semibold text-slate-600">{a.pain_percent}%</span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  </>
                )}
              </>
            ) : (
              <p className="text-xs text-slate-500 mt-1">Not assessed yet.</p>
            )}
          </div>
        )}
      </div>

    </div>
  );
}
