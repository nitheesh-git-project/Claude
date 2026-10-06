"use client";

import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { EmptyState, StatusPill } from "@/components/dashboard/SurfaceCard";
import { clinicDayParts, formatClinicTime } from "@/lib/formatDateTime";
import { sessionRowStatus } from "@/lib/sessionRowStatus";
import ListPager from "@/components/dashboard/ListPager";
import { usePagedList } from "@/lib/usePagedList";
import { sessionBucket } from "@/lib/sessionBucket";

export type FilterableSession = {
  id: string;
  slotTime: string | null;
  status: string;
  noShow?: boolean;
  isHomeVisit: boolean;
  /** What the desktop list's compact row leads with -- the condition for a
   *  patient, the patient's name for a therapist -- and the line under it.
   *  Both are already on the card; the row repeats them so it can be read
   *  without opening the card. */
  title?: string;
  detail?: string;
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

  // Which session's card the desktop layout shows beside the list. Falls
  // back to the first on the page, so a filter or page change never leaves
  // the right-hand side empty while there are rows on the left.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = pageSessions.find((s) => s.id === selectedId) ?? pageSessions[0];

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
        // Below 2xl: the cards, one under another. From 2xl: a compact row
        // per session on the left and the chosen session's card on the
        // right (`.session-split` in globals.css). Each card is rendered
        // once either way -- the rows are extra, the cards are not
        // duplicated -- so a half-filled form in a card is never in the
        // page twice.
        <ul
          className="session-split grid items-start gap-3"
          style={{ "--rows": pageSessions.length } as CSSProperties}
        >
          {pageSessions.map((s) => {
            const isSelected = s.id === selected?.id;
            const day = clinicDayParts(s.slotTime);
            const status = sessionRowStatus(s.status, s.noShow);
            return (
              <li key={s.id} className="2xl:contents">
                <button
                  type="button"
                  onClick={() => setSelectedId(s.id)}
                  aria-pressed={isSelected}
                  className={`session-split-row hidden w-full items-center gap-3.5 rounded-xl border px-3.5 py-3 text-left transition 2xl:flex ${
                    isSelected
                      ? "border-teal-300 bg-teal-50"
                      : "border-slate-200 bg-white hover:border-teal-200 hover:bg-slate-50"
                  }`}
                >
                  <span className="w-12 shrink-0 text-center leading-tight">
                    <span className={`block text-[11px] font-bold uppercase ${isSelected ? "text-teal-700" : "text-slate-500"}`}>
                      {day.weekday}
                    </span>
                    <span className="block font-display text-xl font-bold text-slate-900">{day.day}</span>
                    <span className="block text-[11px] text-slate-500">{day.month}</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-slate-900">
                      {s.title ?? (s.isHomeVisit ? "Home visit" : "Video session")}
                    </span>
                    <span className="block truncate text-xs text-slate-500">
                      {formatClinicTime(s.slotTime)} · {s.isHomeVisit ? "Home visit" : "Video"}
                      {s.detail ? ` · ${s.detail}` : ""}
                    </span>
                  </span>
                  <StatusPill tone={status.tone}>{status.label}</StatusPill>
                </button>
                <div className={isSelected ? "session-split-card" : "2xl:hidden"}>{cardsById[s.id]}</div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Always rendered, even with nothing in view: the steps grey out
          rather than disappearing, so the control does not move around as
          filters change what is on screen. */}
      <ListPager pager={pager} noun="session" />
    </div>
  );
}
