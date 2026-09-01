import { summarizeWeek, type WeeklySchedule } from "@/lib/availabilityRanges";

// The week at a glance: consecutive days with the same hours read as one
// line, so a roster of eight therapists fits on a screen. Presentational and
// server-renderable on purpose -- the grouping itself is summarizeWeek's job,
// which is unit-tested without rendering anything.
export default function WeekScheduleSummary({
  weekly,
  includeOffDays = true,
  className = "",
}: {
  weekly: WeeklySchedule;
  /** Off days are worth showing on a therapist's own schedule and noise in a
   *  dense list. */
  includeOffDays?: boolean;
  className?: string;
}) {
  const lines = summarizeWeek(weekly).filter((line) => includeOffDays || line.working);

  if (lines.length === 0) {
    return <p className={`text-xs text-slate-500 ${className}`}>No working hours set yet.</p>;
  }

  return (
    <dl className={`grid grid-cols-[3.5rem_1fr] gap-x-3 gap-y-1 text-xs ${className}`}>
      {lines.map((line) => (
        <div key={line.days} className="contents">
          <dt className="font-semibold text-slate-500">{line.days}</dt>
          <dd className={line.working ? "font-semibold text-slate-800" : "text-slate-400"}>
            {line.hours}
          </dd>
        </div>
      ))}
    </dl>
  );
}
