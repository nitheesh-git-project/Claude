"use client";

import { useMemo, useState, type ReactNode } from "react";
import SessionFilterList, { type FilterableSession } from "@/components/dashboard/SessionFilterList";
import SessionCalendarTab from "@/components/dashboard/SessionCalendarTab";

/**
 * Sessions as a list or as a month grid, over the same rows.
 *
 * Calendar used to be its own sidebar entry, which made "when is my next
 * session?" a question with two answers in two places — the same mistake
 * the two-delivery-mode split made before SessionFilterList merged it.
 * A calendar is a *view* of your sessions, not a different set of them, so
 * it lives here as a view switch instead.
 *
 * Cards are rendered by the server and passed in by id, so both views show
 * the identical card for a given session.
 */
export default function SessionsView({
  sessions,
  cardsById,
  emptyTitle,
  emptyBody,
  nowMs,
  showMotivation,
}: {
  sessions: FilterableSession[];
  cardsById: Record<string, ReactNode>;
  emptyTitle: string;
  emptyBody: string;
  nowMs: number;
  showMotivation?: boolean;
}) {
  const [view, setView] = useState<"list" | "calendar">("list");

  // The calendar's shape uses the DB column names; the filter list's uses
  // camelCase. One prop in, mapped here, so a caller never passes the same
  // sessions twice in two shapes and risks them disagreeing.
  const calendarSessions = useMemo(
    () =>
      sessions.map((s) => ({
        id: s.id,
        slot_time: s.slotTime,
        status: s.status,
        no_show: s.noShow,
      })),
    [sessions]
  );

  return (
    <div>
      <div className="mb-4 inline-flex rounded-xl bg-slate-100 p-1">
        {(
          [
            ["list", "List", "fa-list"],
            ["calendar", "Calendar", "fa-calendar"],
          ] as const
        ).map(([key, label, icon]) => (
          <button
            key={key}
            type="button"
            aria-pressed={view === key}
            onClick={() => setView(key)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              view === key ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <i className={`fa-solid ${icon} mr-1.5`}></i>
            {label}
          </button>
        ))}
      </div>

      {view === "list" ? (
        <SessionFilterList
          sessions={sessions}
          cardsById={cardsById}
          nowMs={nowMs}
          emptyTitle={emptyTitle}
          emptyBody={emptyBody}
        />
      ) : (
        <SessionCalendarTab
          sessions={calendarSessions}
          cardsById={cardsById}
          showMotivation={showMotivation}
        />
      )}
    </div>
  );
}
