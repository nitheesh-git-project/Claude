import AdminScreenLink from "@/components/admin/AdminScreenLink";
import { adminScreenHref, type InboxGroup } from "@/lib/adminNav";
import { formatClinicTime } from "@/lib/formatDateTime";

export type BriefSession = {
  id: string;
  slotTime: string;
  patient: string;
  /** Null when nobody has been assigned yet. */
  therapist: string | null;
  homeVisit: boolean;
  /** Needs a therapist before it can happen (sessionAssignQueue's rule). */
  needsTherapist: boolean;
  completed: boolean;
};

/**
 * The top of Home › Today in the Morning Brief layout: the jobs that most
 * need a person, each one tap from where it is done, and today's sessions
 * in time order.
 *
 * Nothing here is new data. The jobs are the Today queues' own rows
 * (adminHome.ts), urgent ones first, so the count on a job and the count on
 * its queue can never disagree; the sessions are the same "today" the
 * headline counts.
 */
export default function AdminMorningBrief({
  groups,
  workable,
  sessions,
  nowMs,
}: {
  groups: InboxGroup[];
  /** Sections this admin may change: a job they cannot work is not theirs. */
  workable: string[];
  sessions: BriefSession[];
  nowMs: number;
}) {
  const jobs = groups
    .flatMap((g) => g.items)
    .filter((item) => item.count > 0 && workable.includes(item.workSection ?? item.section))
    .sort((a, b) => Number(Boolean(b.urgent)) - Number(Boolean(a.urgent)) || b.count - a.count)
    .slice(0, 3);
  const ordered = [...sessions].sort((a, b) => a.slotTime.localeCompare(b.slotTime));

  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-2" data-testid="admin-morning-brief">
      <section aria-labelledby="brief-urgent" className="min-w-0">
        <h2 id="brief-urgent" className="text-xs font-bold uppercase tracking-wide text-slate-500">
          Most urgent
        </h2>
        {jobs.length === 0 ? (
          <p className="mt-2 rounded-xl bg-emerald-50 px-3.5 py-3 text-sm font-semibold text-emerald-800">
            Nothing is waiting on you. Enjoy the quiet.
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {jobs.map((job) => (
              <li
                key={`${job.section}:${job.tab}:${job.label}`}
                className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border bg-white px-3.5 py-3 ${
                  job.urgent ? "border-l-4 border-red-200 border-l-red-500" : "border-l-4 border-slate-200 border-l-amber-500"
                }`}
              >
                <div className="min-w-0 flex-1 basis-48">
                  <p className="text-sm font-semibold text-slate-900 [overflow-wrap:anywhere]">
                    {job.count} · {job.label}
                  </p>
                  {job.hint && <p className="text-[13px] text-slate-500 [overflow-wrap:anywhere]">{job.hint}</p>}
                </div>
                <AdminScreenLink
                  href={adminScreenHref(job.section, job.tab, job.view)}
                  className="inline-flex min-h-11 items-center rounded-lg bg-teal-700 px-4 text-sm font-semibold text-white transition hover:bg-teal-800"
                >
                  Open
                </AdminScreenLink>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="brief-today" className="min-w-0">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="brief-today" className="text-xs font-bold uppercase tracking-wide text-slate-500">
            Today&apos;s sessions
          </h2>
          <AdminScreenLink
            href={adminScreenHref("sessions", "schedule")}
            className="inline-flex min-h-11 items-center text-sm font-semibold text-teal-700 hover:underline"
          >
            Open calendar
          </AdminScreenLink>
        </div>
        {ordered.length === 0 ? (
          <p className="mt-1 text-sm text-slate-500">No sessions are booked for today.</p>
        ) : (
          <ul className="mt-1 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
            {ordered.slice(0, 6).map((s) => {
              const started = new Date(s.slotTime).getTime() <= nowMs;
              const status = s.completed
                ? { text: "Done", cls: "bg-emerald-50 text-emerald-800" }
                : s.needsTherapist
                  ? { text: "No therapist", cls: "bg-red-50 text-red-700" }
                  : started
                    ? { text: "Started", cls: "bg-teal-50 text-teal-800" }
                    : { text: "Upcoming", cls: "bg-slate-100 text-slate-700" };
              return (
                <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3.5 py-2.5">
                  <span className="w-16 shrink-0 text-sm font-semibold tabular-nums text-slate-700">
                    {formatClinicTime(s.slotTime)}
                  </span>
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="font-semibold text-slate-900">{s.patient}</span>
                    <span className="text-slate-500">
                      {" "}
                      · {s.homeVisit ? "Home visit" : "Video"}
                      {s.therapist ? ` · ${s.therapist}` : ""}
                    </span>
                  </span>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${status.cls}`}>{status.text}</span>
                </li>
              );
            })}
            {ordered.length > 6 && (
              <li className="px-3.5 py-2.5 text-sm text-slate-500">
                and {ordered.length - 6} more in the calendar
              </li>
            )}
          </ul>
        )}
      </section>
    </div>
  );
}
