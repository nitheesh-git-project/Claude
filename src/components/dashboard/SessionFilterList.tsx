"use client";

import { useMemo, useState, type ReactNode } from "react";
import { EmptyState } from "@/components/dashboard/SurfaceCard";
import ListPager from "@/components/dashboard/ListPager";
import { usePagedList } from "@/lib/usePagedList";
import { sessionBucket } from "@/lib/sessionBucket";

export type FilterableSession = {
  id: string;
  slotTime: string | null;
  status: string;
  noShow?: boolean;
  isHomeVisit: boolean;
};

type When = "upcoming" | "past" | "cancelled" | "all";
type Mode = "all" | "online" | "home_visit";

const WHEN_LABEL: Record<When, string> = {
  upcoming: "Upcoming",
  past: "Past",
  cancelled: "Cancelled",
  all: "All",
};

/**
 * One list of sessions with filters, instead of one list per delivery
 * mode.
 *
 * Video consultations and home visits were two sidebar entries over the
 * same `appointments` rows, so "when is my next session?" meant checking
 * two screens and merging them by hand. This is the same rule the admin
 * dashboard already follows ("a session is listed once" -- see
 * docs/rules/dashboards.md):
 * one list, filters on top. The mode filter only appears for people who
 * actually have both kinds, so a video-only patient never sees a control
 * that does nothing.
 *
 * Cards are rendered by the server and passed in by id, so this component
 * decides what is shown without knowing how a session looks.
 */
export default function SessionFilterList({
  sessions,
  cardsById,
  emptyTitle,
  emptyBody,
  nowMs,
  defaultWhen = "upcoming",
}: {
  sessions: FilterableSession[];
  cardsById: Record<string, ReactNode>;
  emptyTitle: string;
  emptyBody: string;
  /** Request-time clock, passed from the server. Reading it here would
   *  make the first client render disagree with the server's HTML, and
   *  "upcoming" would briefly classify differently on each side. */
  nowMs: number;
  defaultWhen?: When;
}) {
  const [when, setWhen] = useState<When>(defaultWhen);
  const [mode, setMode] = useState<Mode>("all");

  const hasBothModes =
    sessions.some((s) => s.isHomeVisit) && sessions.some((s) => !s.isHomeVisit);

  const counts = useMemo(() => {
    const now = nowMs;
    return {
      upcoming: sessions.filter((s) => sessionBucket(s, now) === "upcoming").length,
      past: sessions.filter((s) => sessionBucket(s, now) === "past").length,
      cancelled: sessions.filter((s) => s.status === "cancelled").length,
      all: sessions.length,
    };
  }, [sessions, nowMs]);

  const visible = useMemo(() => {
    const now = nowMs;
    return sessions
      .filter((s) => {
        if (mode === "online" && s.isHomeVisit) return false;
        if (mode === "home_visit" && !s.isHomeVisit) return false;
        if (when === "all") return true;
        // An open session that has started stays under Upcoming -- see
        // sessionBucket.ts.
        return sessionBucket(s, now) === when;
      })
      .sort((a, b) => {
        const at = a.slotTime ? new Date(a.slotTime).getTime() : 0;
        const bt = b.slotTime ? new Date(b.slotTime).getTime() : 0;
        // Upcoming reads soonest-first (what happens next); everything
        // else reads newest-first (what happened last).
        return when === "upcoming" ? at - bt : bt - at;
      });
  }, [sessions, when, mode, nowMs]);

  const { rows: pageSessions, pager } = usePagedList(visible, {
    storageKey: "sessions-list",
    defaultPageSize: 5,
  });

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {/* Full width on a phone, each tab an equal share: as an
            inline-flex it ran off a 360px screen once the counts grew. */}
        <div className="flex w-full rounded-xl bg-slate-100 p-1 sm:inline-flex sm:w-auto">
          {(["upcoming", "past", "cancelled", "all"] as When[]).map((key) => (
            <button
              key={key}
              type="button"
              aria-pressed={when === key}
              onClick={() => setWhen(key)}
              className={`flex flex-1 flex-col items-center whitespace-nowrap rounded-lg px-1 py-1.5 text-xs font-semibold transition sm:flex-none sm:flex-row sm:px-3 ${
                when === key ? "bg-white text-slate-800 shadow-sm" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {/* The count sits under the label on a phone, so four tabs
                  with three-digit counts still fit a 360px screen. */}
              <span>{WHEN_LABEL[key]}</span>
              <span className="text-[10px] font-bold text-slate-600 sm:ml-1.5">{counts[key]}</span>
            </button>
          ))}
        </div>

        {hasBothModes && (
          <div className="flex w-full rounded-xl bg-slate-100 p-1 sm:inline-flex sm:w-auto">
            {(
              [
                ["all", "Both"],
                ["online", "Video"],
                ["home_visit", "Home visit"],
              ] as [Mode, string][]
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                aria-pressed={mode === key}
                onClick={() => setMode(key)}
                className={`flex-1 whitespace-nowrap rounded-lg px-2 py-1.5 text-xs font-semibold transition sm:flex-none sm:px-3 ${
                  mode === key ? "bg-white text-slate-800 shadow-sm" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon="fa-calendar-xmark"
          title={when === "upcoming" ? "Nothing coming up" : emptyTitle}
          body={
            when === "upcoming" && counts.past > 0
              ? "No sessions booked yet. Past sessions are under the Past tab."
              : emptyBody
          }
        />
      ) : (
        // Two across on a desktop: one card per row left half of a 1920
        // screen empty and pushed the pager below the fold.
        <ul className="grid items-start gap-3 2xl:grid-cols-2">
          {pageSessions.map((s) => (
            <li key={s.id}>{cardsById[s.id]}</li>
          ))}
        </ul>
      )}

      {/* Always rendered, even with nothing in view: the steps grey out
          rather than disappearing, so the control does not move around as
          filters change what is on screen. */}
      <ListPager pager={pager} noun="session" />
    </div>
  );
}
