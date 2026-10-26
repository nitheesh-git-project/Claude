import type { GeriatricFallRisk } from "@/lib/geriatricRisk";
import type { Voice } from "@/lib/progressView";

const CX = 120;
const CY = 118;
const R = 92;
const ZONES = [
  { key: "low", label: "Low", color: "var(--chart-good-soft)" },
  { key: "moderate", label: "Moderate", color: "var(--chart-amber)" },
  { key: "high", label: "High", color: "var(--chart-rose)" },
] as const;

/** A point on the dial's arc: 180 degrees is the left end, 360 the right. */
function point(deg: number, r: number): { x: number; y: number } {
  const rad = (deg * Math.PI) / 180;
  return { x: CX + r * Math.cos(rad), y: CY + r * Math.sin(rad) };
}

function arc(from: number, to: number): string {
  const a = point(from, R);
  const b = point(to, R);
  return `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} A ${R} ${R} 0 0 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
}

/**
 * The fall-risk dial: Low, Moderate and High as three arcs, the needle on
 * the STEADI level, and under it the level, the RULE that decided it
 * ("High because of 3 falls in the last 12 months") and, as a separate line,
 * "Tests in the safer range: 3 of 4". The level is never moved by the tests
 * when the fall history decided it, and the dial says so in the same breath,
 * so an improving test result never reads as a lowered risk.
 *
 * With no level yet ("not known") the needle is left off and the arcs are
 * greyed: the dial is not a reading until there is one.
 */
export default function FallRiskDial({
  risk,
  text,
  voice,
  unreadableNote,
}: {
  risk: GeriatricFallRisk;
  /** The level and its rule in the reader's words (fallRiskSentence). */
  text: string;
  voice: Voice;
  /** The diary could not be read: the dial says it was worked out without it. */
  unreadableNote?: string | null;
}) {
  const index = risk.level === "low" ? 0 : risk.level === "moderate" ? 1 : risk.level === "high" ? 2 : null;
  const needleDeg = index === null ? null : 180 + 30 + index * 60;
  const tip = needleDeg === null ? null : point(needleDeg, R - 14);
  const levelWord = risk.level ? risk.level[0].toUpperCase() + risk.level.slice(1) : "Not known yet";
  return (
    <div className="min-w-0" data-testid="fall-risk-dial">
      <svg viewBox="0 0 240 134" className="mx-auto block h-auto w-full max-w-[18rem]" role="img" aria-label={`Fall risk: ${levelWord}. ${text}`}>
        {ZONES.map((z, i) => (
          <path
            key={z.key}
            d={arc(180 + i * 60 + 1.5, 180 + (i + 1) * 60 - 1.5)}
            fill="none"
            stroke={index === null ? "var(--chart-grid)" : z.color}
            strokeOpacity={index === null || index === i ? 1 : 0.35}
            strokeWidth={index === i ? 22 : 16}
            strokeLinecap="butt"
          />
        ))}
        {tip && (
          <>
            <line x1={CX} y1={CY} x2={tip.x} y2={tip.y} stroke="var(--chart-ink)" strokeWidth={4} strokeLinecap="round" />
            <circle cx={CX} cy={CY} r={7} fill="var(--chart-ink)" />
          </>
        )}
      </svg>
      <ul aria-hidden className="mx-auto -mt-1 grid max-w-[18rem] grid-cols-3 text-center text-[11px] font-semibold text-slate-700">
        {ZONES.map((z, i) => (
          <li key={z.key} className={index === i ? "text-slate-900" : ""}>
            {z.label}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-center font-display text-xl font-extrabold text-slate-900">{levelWord}</p>
      <p className="mt-1 text-center text-sm leading-relaxed text-slate-800 [overflow-wrap:anywhere]" data-testid="fall-risk-rule">
        {text}
      </p>
      {risk.saferRangeLine ? (
        <p className="mt-2 rounded-xl bg-slate-50 px-3 py-2 text-center text-sm font-semibold text-slate-900" data-testid="safer-range-line">
          {risk.saferRangeLine}
        </p>
      ) : (
        <p className="mt-2 rounded-xl bg-slate-50 px-3 py-2 text-center text-sm text-slate-700">
          {voice === "patient" ? "None of the four tests has been done yet." : "None of the four tests is recorded yet."}
        </p>
      )}
      <p className="mt-2 text-center text-xs text-slate-700">
        {voice === "patient"
          ? "Set by the CDC STEADI rules: falls in the last 12 months count as well as today's tests."
          : "CDC STEADI: falls in the last 12 months count as well as today's tests. A level means higher risk, never a diagnosis."}
      </p>
      {unreadableNote && (
        <p role="status" className="mt-2 text-center text-xs text-amber-900">
          {unreadableNote}
        </p>
      )}
    </div>
  );
}
