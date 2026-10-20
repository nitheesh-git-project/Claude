"use client";

import { PAIN_MAP_REGIONS, painMapPointLabel, type PainMapRegionKey, type PainMapSide } from "@/lib/painMap";
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
  label,
}: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  /** The question this answers, as the group's accessible name -- a
   *  <label htmlFor> cannot point at a figure, so the wizard's question
   *  heading named nothing here. */
  label?: string;
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

  function updateNote(region: PainMapRegionKey, side: PainMapSide, note: string) {
    onChange(
      serializeAreaPain(entries.map((e) => (e.region === region && e.side === side ? { ...e, note } : e)))
    );
  }

  function remove(region: PainMapRegionKey, side: PainMapSide) {
    onChange(serializeAreaPain(entries.filter((e) => !(e.region === region && e.side === side))));
  }

  return (
    <div role="group" aria-label={label}>
      <BodyMapDiagram
        latestByKey={new Map()}
        includedKeys={includedKeys}
        interactive={!disabled}
        onSelect={toggle}
      />
      {entries.length === 0 ? (
        <p className="text-xs text-slate-500 mt-2">
          Tap a point above for each area that hurts - or Tab to a point and press Space.
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {entries.map((e) => {
            const where = painMapPointLabel(e.region, e.side);
            return (
              <div key={`${e.region}:${e.side}`} className="rounded-lg border border-slate-100 p-2.5">
                <div className="flex items-center gap-3">
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
                    aria-label={`Pain in ${where.toLowerCase()}, 0 to 10`}
                    aria-valuetext={`${e.pain} out of 10`}
                    onChange={(ev) => updatePain(e.region, e.side, Number(ev.target.value))}
                    className="flex-1"
                  />
                  <span className="w-8 shrink-0 text-xs font-semibold text-slate-600 text-right">{e.pain}/10</span>
                  {!disabled && (
                    <button
                      type="button"
                      onClick={() => remove(e.region, e.side)}
                      className="shrink-0 text-xs text-slate-500 hover:text-red-600"
                      aria-label={`Remove ${where}`}
                    >
                      ✕
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  value={e.note ?? ""}
                  disabled={disabled}
                  onChange={(ev) => updateNote(e.region, e.side, ev.target.value)}
                  aria-label={`Note about ${where.toLowerCase()} (optional)`}
                  placeholder="Add a note (optional) - e.g. started after a fall"
                  className="mt-2 w-full p-1.5 rounded-md border border-slate-200 text-xs disabled:bg-slate-50"
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
