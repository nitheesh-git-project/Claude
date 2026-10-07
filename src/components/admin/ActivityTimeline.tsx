"use client";

import { useEffect, useMemo, useState } from "react";
import DateField from "@/components/system/DateField";
import { formatClinicDate, formatClinicTime } from "@/lib/formatDateTime";
import {
  ACTIVITY_CATEGORY_LABEL,
  activityDateKey,
  activityFacets,
  filterActivity,
  type ActivityActorRole,
  type ActivityCategory,
  type ActivityEvent,
} from "@/lib/activityTimeline";

const CATEGORY_ICON: Record<ActivityCategory, string> = {
  booking: "fa-calendar-plus",
  payment: "fa-indian-rupee-sign",
  assignment: "fa-user-doctor",
  clinical: "fa-notes-medical",
  account: "fa-user",
  admin: "fa-user-shield",
};

const CATEGORY_TONE: Record<ActivityCategory, string> = {
  booking: "bg-sky-50 text-sky-700",
  payment: "bg-emerald-50 text-emerald-700",
  assignment: "bg-violet-50 text-violet-700",
  clinical: "bg-teal-50 text-teal-700",
  account: "bg-slate-100 text-slate-600",
  admin: "bg-amber-50 text-amber-700",
};

const ACTOR_LABEL: Record<ActivityActorRole, string> = {
  patient: "Patient",
  therapist: "Therapist",
  hospital: "Hospital",
  admin: "Admin",
  system: "System",
};

const PAGE = 50;

/**
 * A timestamped history -- a session's (`sessionId`) or a person's
 * (`personId`) -- with filters for what happened, who did it, when, and
 * free text. Read from /api/admin/timeline; see src/lib/activityTimeline.ts
 * for where every line comes from.
 */
export default function ActivityTimeline({
  sessionId,
  personId,
  title = "Activity log",
}: {
  sessionId?: string;
  personId?: string;
  title?: string;
}) {
  const [events, setEvents] = useState<ActivityEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [categories, setCategories] = useState<ActivityCategory[]>([]);
  const [actors, setActors] = useState<ActivityActorRole[]>([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(PAGE);

  useEffect(() => {
    let alive = true;
    fetch("/api/admin/timeline", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sessionId ? { sessionId } : { personId }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!alive) return;
        if (!res.ok) {
          setError(data.error ?? "We couldn't load this history just now.");
          return;
        }
        setError(null);
        setEvents(data.events as ActivityEvent[]);
      })
      .catch(() => alive && setError("Could not reach the server. Please try again."));
    return () => {
      alive = false;
    };
  }, [sessionId, personId, attempt]);

  const facets = useMemo(() => activityFacets(events ?? []), [events]);
  const filtered = useMemo(
    () => filterActivity(events ?? [], { categories, actorRoles: actors, from: from || null, to: to || null, query }),
    [events, categories, actors, from, to, query]
  );
  const visible = filtered.slice(0, shown);
  const filtering = categories.length > 0 || actors.length > 0 || !!from || !!to || !!query.trim();

  const groups: { day: string; items: ActivityEvent[] }[] = [];
  for (const e of visible) {
    const day = activityDateKey(e.at);
    const last = groups[groups.length - 1];
    if (last?.day === day) last.items.push(e);
    else groups.push({ day, items: [e] });
  }

  function toggle<T>(list: T[], value: T, set: (next: T[]) => void) {
    set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
    setShown(PAGE);
  }

  return (
    <section aria-label={title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display text-base font-bold text-slate-900">{title}</h3>
        {events && (
          <p className="text-xs text-slate-500">
            {filtering ? `${filtered.length} of ${events.length}` : events.length}{" "}
            {events.length === 1 ? "entry" : "entries"}
          </p>
        )}
      </div>

      {error ? (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
          {error}{" "}
          <button type="button" onClick={() => setAttempt((n) => n + 1)} className="font-semibold underline">
            Try again
          </button>
        </div>
      ) : events === null ? (
        <p className="mt-4 text-xs text-slate-500">Loading the history...</p>
      ) : events.length === 0 ? (
        <p className="mt-4 text-xs text-slate-500">Nothing recorded yet.</p>
      ) : (
        <>
          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by what happened">
              {facets.categories.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-pressed={categories.includes(c)}
                  onClick={() => toggle(categories, c, setCategories)}
                  className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition ${
                    categories.includes(c)
                      ? "border-teal-600 bg-teal-700 text-white"
                      : "border-slate-200 bg-white text-slate-600 hover:border-teal-300"
                  }`}
                >
                  <i className={`fa-solid ${CATEGORY_ICON[c]} text-[10px]`} aria-hidden="true" />
                  {ACTIVITY_CATEGORY_LABEL[c]}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by who did it">
              {facets.actorRoles.map((r) => (
                <button
                  key={r}
                  type="button"
                  aria-pressed={actors.includes(r)}
                  onClick={() => toggle(actors, r, setActors)}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                    actors.includes(r)
                      ? "border-slate-700 bg-slate-800 text-white"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-400"
                  }`}
                >
                  By {ACTOR_LABEL[r].toLowerCase()}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="w-40">
                <DateField value={from} onChange={(v) => { setFrom(v); setShown(PAGE); }} ariaLabel="From date" clearable />
              </div>
              <span className="text-xs text-slate-400">to</span>
              <div className="w-40">
                <DateField value={to} onChange={(v) => { setTo(v); setShown(PAGE); }} ariaLabel="To date" clearable />
              </div>
              <input
                type="search"
                value={query}
                onChange={(e) => { setQuery(e.target.value); setShown(PAGE); }}
                placeholder="Search"
                aria-label="Search the history"
                className="w-40 rounded-lg border border-slate-300 px-3 py-2 text-xs"
              />
              {filtering && (
                <button
                  type="button"
                  onClick={() => {
                    setCategories([]);
                    setActors([]);
                    setFrom("");
                    setTo("");
                    setQuery("");
                    setShown(PAGE);
                  }}
                  className="text-xs font-semibold text-teal-700 hover:underline"
                >
                  Clear filters
                </button>
              )}
            </div>
          </div>

          {filtered.length === 0 ? (
            <p className="mt-5 text-xs text-slate-500">Nothing matches these filters.</p>
          ) : (
            <ol className="mt-5 space-y-5">
              {groups.map((group) => (
                <li key={group.day}>
                  <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.15em] text-slate-400">
                    {formatClinicDate(group.items[0].at)}
                  </p>
                  <ol className="relative space-y-3 border-l border-slate-200 pl-5">
                    {group.items.map((e) => (
                      <li key={e.id} className="relative">
                        <span
                          className={`absolute -left-[31px] top-0.5 flex h-5 w-5 items-center justify-center rounded-full text-[9px] ring-4 ring-white ${CATEGORY_TONE[e.category]}`}
                        >
                          <i className={`fa-solid ${CATEGORY_ICON[e.category]}`} aria-hidden="true" />
                        </span>
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                          <span className="text-[11px] font-semibold tabular-nums text-slate-500">
                            {formatClinicTime(e.at)}
                          </span>
                          <span className="text-sm font-semibold text-slate-800">{e.title}</span>
                          {e.sessionCode && !sessionId && (
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-600">
                              {e.sessionCode}
                            </span>
                          )}
                        </div>
                        {e.detail && <p className="mt-0.5 text-xs text-slate-600">{e.detail}</p>}
                        <p className="mt-0.5 text-[11px] text-slate-400">
                          by {e.actorName ? `${e.actorName} (${ACTOR_LABEL[e.actorRole].toLowerCase()})` : ACTOR_LABEL[e.actorRole].toLowerCase()}
                        </p>
                      </li>
                    ))}
                  </ol>
                </li>
              ))}
            </ol>
          )}
          {filtered.length > shown && (
            <button
              type="button"
              onClick={() => setShown((n) => n + PAGE)}
              className="mt-4 text-xs font-semibold text-teal-700 hover:underline"
            >
              Show {Math.min(PAGE, filtered.length - shown)} more
            </button>
          )}
        </>
      )}
    </section>
  );
}
