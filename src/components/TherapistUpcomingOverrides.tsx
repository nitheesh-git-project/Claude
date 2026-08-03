import { formatHourRange } from "@/lib/therapistAvailability";

type OverrideRow = { date: string; hour: number; available: boolean; note: string | null };

function formatDateLabel(dateKey: string) {
  return new Date(`${dateKey}T00:00:00`).toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export default function TherapistUpcomingOverrides({ overrides }: { overrides: OverrideRow[] }) {
  const sorted = [...overrides].sort((a, b) =>
    a.date === b.date ? a.hour - b.hour : a.date.localeCompare(b.date)
  );

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
      <h2 className="font-bold text-lg text-slate-800 mb-1">Schedule Changes From Admin</h2>
      <p className="text-[11px] text-slate-400 mb-4">
        Admin has adjusted your availability for these specific dates — your regular weekly
        schedule above is unchanged otherwise.
      </p>
      <ul className="space-y-2 text-xs">
        {sorted.map((o, i) => (
          <li
            key={`${o.date}-${o.hour}-${i}`}
            className="flex items-center justify-between gap-3 p-2.5 rounded-lg border border-slate-200"
          >
            <span className="text-slate-700 font-semibold">
              {formatDateLabel(o.date)} · {formatHourRange(o.hour)}
            </span>
            <span
              className={`font-semibold px-2 py-1 rounded-full ${
                o.available ? "text-green-800 bg-green-100" : "text-red-700 bg-red-100"
              }`}
            >
              {o.available ? "Made available" : "Made unavailable"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
