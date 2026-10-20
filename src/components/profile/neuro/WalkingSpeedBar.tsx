import type { SpeedZones } from "@/lib/neuroProfile";
import { GAIT_SPEED_LABEL } from "@/lib/neuroExam";

const ZONES = [
  { key: "household", label: "Around the house", from: 0, to: 0.4 / 1.2, tone: "bg-red-100" },
  { key: "limited", label: "Short trips out", from: 0.4 / 1.2, to: 0.8 / 1.2, tone: "bg-amber-100" },
  { key: "community", label: "The neighbourhood", from: 0.8 / 1.2, to: 1, tone: "bg-emerald-100" },
] as const;

/**
 * Walking speed against the three zones the exam's own bands use (under 0.4,
 * 0.4 to 0.8, 0.8 and over m/s), with the first reading marked "Start" and the
 * latest "Now". The zone names are under the bar in words and the reading is
 * a number above it, so the bar is a picture of the sentence, not the only
 * place it is said.
 */
export default function WalkingSpeedBar({ zones, voice }: { zones: SpeedZones; voice: "patient" | "clinician" }) {
  return (
    <section aria-label="Walking speed" className="min-w-0 rounded-xl border border-slate-200 bg-white p-3.5" data-testid="walking-speed">
      <h3 className="font-display text-sm font-bold text-slate-900">
        Walking speed{zones.medicationState ? ` (${zones.medicationState.toUpperCase()})` : ""}
      </h3>
      <p className="mt-1 font-display text-2xl font-extrabold text-slate-900">
        {zones.now}
        <span className="ml-1 text-sm font-medium text-slate-700">m/s</span>
      </p>
      <div className="relative mt-5 h-3 rounded-full" role="img" aria-label={`${zones.now} metres per second: ${GAIT_SPEED_LABEL[zones.nowBand]}${zones.first !== null ? `. It started at ${zones.first}.` : ""}`}>
        <div className="flex h-full overflow-hidden rounded-full">
          {ZONES.map((z) => (
            <div key={z.key} className={`${z.tone} ${z.key === zones.nowBand ? "ring-2 ring-inset ring-slate-600" : ""}`} style={{ width: `${(z.to - z.from) * 100}%` }} />
          ))}
        </div>
        {zones.firstPercent !== null && (
          <span aria-hidden className="absolute -top-4 text-[11px] font-semibold text-slate-700" style={{ left: `${zones.firstPercent}%`, transform: "translateX(-50%)" }}>
            Start
          </span>
        )}
        {zones.firstPercent !== null && (
          <span aria-hidden className="absolute top-0 h-3 w-0.5 bg-slate-600" style={{ left: `${zones.firstPercent}%` }} />
        )}
        <span aria-hidden className="absolute -top-4 text-[11px] font-bold text-slate-900" style={{ left: `${zones.nowPercent}%`, transform: zones.nowPercent > 85 ? "translateX(-100%)" : "translateX(-50%)" }}>
          Now
        </span>
        <span aria-hidden className="absolute -top-0.5 h-4 w-1.5 rounded bg-slate-900" style={{ left: `${zones.nowPercent}%`, transform: "translateX(-50%)" }} />
      </div>
      <ul className="mt-1.5 grid grid-cols-3 gap-1 text-[11px] leading-tight text-slate-700">
        {ZONES.map((z) => (
          <li key={z.key} className={z.key === zones.nowBand ? "font-bold text-slate-900" : ""}>
            {z.label}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-slate-700">
        {voice === "patient" ? "0.4 and 0.8 m/s are the usual lines between these." : "Perry's categories: under 0.4, 0.4 to 0.8, 0.8 m/s or more."}
      </p>
    </section>
  );
}
