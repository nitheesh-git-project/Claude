import { PAIN_MAP_REGIONS, painBand, painTrend, PAIN_BAND_LABEL } from "@/lib/painMap";

const PAIN_BAND_STYLE: Record<string, string> = {
  low: "bg-emerald-100 text-emerald-700",
  mid: "bg-amber-100 text-amber-700",
  high: "bg-red-100 text-red-700",
};

type AssessmentRow = {
  region: string;
  side: string;
  pain_percent: number;
  created_at: string;
};

// Read-only Pain Map view — used on the patient dashboard (view-only, per
// the product decision that only a therapist's clinical exam writes this
// data) and could be reused anywhere else a read-only view is needed.
// Only regions with at least one assessment show up, matching the "only
// affected areas are marked" rule from the design pass.
export default function PainMapSummary({ assessments }: { assessments: AssessmentRow[] }) {
  const byRegionSide = new Map<string, AssessmentRow[]>();
  for (const a of assessments) {
    const key = `${a.region}:${a.side}`;
    const list = byRegionSide.get(key) ?? [];
    list.push(a);
    byRegionSide.set(key, list);
  }

  const entries = PAIN_MAP_REGIONS.flatMap((r) => {
    const sides = r.paired ? ["left", "right"] : ["na"];
    return sides
      .map((side) => {
        const list = byRegionSide.get(`${r.key}:${side}`);
        if (!list || list.length === 0) return null;
        const sorted = [...list].sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        const latest = sorted[0];
        const previous = sorted[1] ?? null;
        return {
          label: r.paired && side !== "na" ? `${r.label} (${side})` : r.label,
          percent: latest.pain_percent,
          band: painBand(latest.pain_percent),
          trend: painTrend(latest.pain_percent, previous?.pain_percent ?? null),
        };
      })
      .filter((e): e is NonNullable<typeof e> => e !== null);
  });

  if (entries.length === 0) {
    return (
      <p className="text-xs text-slate-500">
        Your therapist hasn&apos;t recorded a pain assessment yet — this fills in after your exam.
      </p>
    );
  }

  return (
    <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {entries.map((e) => (
        <li
          key={e.label}
          className="flex items-center justify-between gap-2 rounded-xl border border-slate-100 px-3 py-2"
        >
          <span className="text-xs font-semibold text-slate-700">{e.label}</span>
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${PAIN_BAND_STYLE[e.band]}`}>
            {e.percent}% · {PAIN_BAND_LABEL[e.band]}
            {e.trend === "down" && " ↓"}
            {e.trend === "up" && " ↑"}
          </span>
        </li>
      ))}
    </ul>
  );
}
