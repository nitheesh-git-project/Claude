"use client";

import { useState } from "react";
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

// Read-only Pain Map surface: the tap-point body diagram plus a detail
// panel for whichever region was last tapped, with the existing pill-list
// underneath as an accessible/scannable fallback. Used by the patient
// (view-only, per the product decision) and the admin.
export default function PainMapView({ assessments }: { assessments: PainAssessmentRow[] }) {
  const [selected, setSelected] = useState<{ region: PainMapRegionKey; side: PainMapSide } | null>(null);
  const latestByKey = latestAssessmentByRegionSide(assessments);

  const selectedRegionDef = selected ? PAIN_MAP_REGIONS.find((r) => r.key === selected.region) : null;
  const selectedLatest = selected ? latestByKey.get(`${selected.region}:${selected.side}`) : null;
  const selectedHistory = selected
    ? assessments
        .filter((a) => a.region === selected.region && a.side === selected.side)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    : [];
  const selectedPrevious = selectedHistory[1] ?? null;

  return (
    <div>
      <BodyMapDiagram latestByKey={latestByKey} selected={selected} onSelect={(region, side) => setSelected({ region, side })} />

      {selected && selectedRegionDef && (
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-bold text-slate-800">
            {selectedRegionDef.label}
            {selectedRegionDef.paired && selected.side !== "na" ? ` (${selected.side})` : ""}
          </p>
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

      <div className="mt-6 pt-6 border-t border-slate-100">
        <PainMapSummary assessments={assessments} />
      </div>
    </div>
  );
}
