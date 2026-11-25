import type { CSSProperties } from "react";
import Link from "next/link";
import ProgressLink from "@/components/system/ProgressLink";
import { formatClinicTime } from "@/lib/formatDateTime";
import { todayProgress, type TodayRow, type TodayState } from "@/lib/therapistToday";

const STATE: Record<TodayState, { label: string; className: string }> = {
  done: { label: "Done", className: "bg-emerald-50 text-emerald-700" },
  "no-show": { label: "No-show", className: "bg-rose-50 text-rose-700" },
  now: { label: "Now", className: "bg-teal-700 text-white" },
  next: { label: "Next", className: "bg-teal-50 text-teal-800" },
  later: { label: "Later", className: "bg-slate-100 text-slate-600" },
  "to-finish": { label: "Mark complete", className: "bg-amber-50 text-amber-800" },
  waiting: { label: "Awaiting clinic", className: "bg-slate-100 text-slate-600" },
};

/**
 * The therapist's Home "Today": every session on the clinic's today, in time
 * order, with one word each for where it stands and a progress bar for the
 * day. Under the Next up card, so the session to act on comes first and the
 * shape of the day comes straight after. Each row opens that patient's Health
 * Profile; the session's own controls (Join, Done, no-show) stay on the
 * Next up card and the Sessions screen, so nothing is offered twice.
 */
export default function TherapistToday({ rows, names }: { rows: TodayRow[]; names: Map<string, string> }) {
  const { settled, total } = todayProgress(rows);
  return (
    <section aria-labelledby="therapist-today-title" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 id="therapist-today-title" className="text-lg font-bold text-slate-900">
          Today
        </h2>
        <ProgressLink href="/therapist/dashboard/sessions" className="text-sm font-semibold text-teal-700 hover:text-teal-800">
          All sessions
        </ProgressLink>
      </div>
      {total === 0 ? (
        <p className="mt-2 text-sm text-slate-600">
          No sessions today. Keep your availability open and the clinic assigns work to it.
        </p>
      ) : (
        <>
          <div className="mt-3 flex items-center gap-3">
            <div
              className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100"
              role="progressbar"
              aria-label="Today's sessions settled"
              aria-valuemin={0}
              aria-valuemax={total}
              aria-valuenow={settled}
            >
              <span
                className="block h-full rounded-full bg-teal-600 motion-safe:transition-[width] motion-safe:duration-700"
                style={{ width: `${(settled / total) * 100}%` }}
              />
            </div>
            <span className="shrink-0 text-sm font-semibold text-slate-700">
              {settled} of {total} done
            </span>
          </div>
          <ol className="mt-3 divide-y divide-slate-100">
            {rows.map((r, i) => {
              const name = names.get(r.patientId) ?? "A patient";
              const s = STATE[r.state];
              const settledRow = r.state === "done" || r.state === "no-show";
              return (
                <li key={r.id} className="mr-rise" style={{ "--d": `${i * 40}ms` } as CSSProperties}>
                  <Link
                    href={`/therapist/dashboard/health-profile/${r.patientId}`}
                    className={`flex min-h-[64px] items-center gap-3 rounded-lg px-1 py-2 transition hover:bg-slate-50 ${settledRow ? "opacity-70" : ""}`}
                  >
                    <span className="w-[4.5rem] shrink-0 font-display text-sm font-bold text-slate-900">
                      {formatClinicTime(r.slotTime)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold text-slate-900">{name}</span>
                      <span className="block truncate text-[13px] text-slate-500">
                        {[r.concern, r.homeVisit ? "Home visit" : "Video"].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[12px] font-bold ${s.className}`}>
                      {r.state === "done" && <i aria-hidden className="fa-solid fa-check mr-1 text-[10px]" />}
                      {s.label}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
        </>
      )}
    </section>
  );
}
