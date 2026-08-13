"use client";

import { PAIN_MAP_REGIONS, type PainMapRegionKey, type PainMapSide } from "@/lib/painMap";
import { parseAreaPain, serializeAreaPain } from "@/lib/conditionIntake";
import BodyMapDiagram from "@/components/profile/BodyMapDiagram";

const regionLabel = (key: PainMapRegionKey) => PAIN_MAP_REGIONS.find((r) => r.key === key)?.label ?? key;

// The patient's (or therapist/admin-on-behalf) own self-reported pain
// areas -- a different dataset from the therapist's clinical Pain Map
// (pain_assessments), reusing the same BodyMapDiagram and region list so
// the two can be compared later. Tapping a dot toggles it into/out of the
// list; each included area gets its own 0-10 slider.
export default function AreaPainPicker({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
}) {
  const entries = parseAreaPain(value);
  const includedKeys = new Set(entries.map((e) => `${e.region}:${e.side}`));

  function toggle(region: PainMapRegionKey, side: PainMapSide) {
    if (disabled) return;
    const key = `${region}:${side}`;
    if (includedKeys.has(key)) {
      onChange(serializeAreaPain(entries.filter((e) => `${e.region}:${e.side}` !== key)));
    } else {
      onChange(serializeAreaPain([...entries, { region, side, pain: 5 }]));
    }
  }

  function updatePain(region: PainMapRegionKey, side: PainMapSide, pain: number) {
    onChange(
      serializeAreaPain(entries.map((e) => (e.region === region && e.side === side ? { ...e, pain } : e)))
    );
  }

  function remove(region: PainMapRegionKey, side: PainMapSide) {
    onChange(serializeAreaPain(entries.filter((e) => !(e.region === region && e.side === side))));
  }

  return (
    <div>
      <BodyMapDiagram
        latestByKey={new Map()}
        includedKeys={includedKeys}
        interactive={!disabled}
        onSelect={toggle}
      />
      {entries.length === 0 ? (
        <p className="text-xs text-slate-400 mt-2">Tap a point above for each area that hurts.</p>
      ) : (
        <div className="mt-4 space-y-3">
          {entries.map((e) => (
            <div key={`${e.region}:${e.side}`} className="flex items-center gap-3">
              <span className="w-32 shrink-0 text-xs font-semibold text-slate-700">
                {regionLabel(e.region)}
                {e.side !== "na" ? ` (${e.side})` : ""}
              </span>
              <input
                type="range"
                min={0}
                max={10}
                value={e.pain}
                disabled={disabled}
                onChange={(ev) => updatePain(e.region, e.side, Number(ev.target.value))}
                className="flex-1"
              />
              <span className="w-8 shrink-0 text-xs font-semibold text-slate-600 text-right">{e.pain}/10</span>
              {!disabled && (
                <button
                  type="button"
                  onClick={() => remove(e.region, e.side)}
                  className="shrink-0 text-xs text-slate-400 hover:text-red-600"
                  aria-label={`Remove ${regionLabel(e.region)}`}
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
