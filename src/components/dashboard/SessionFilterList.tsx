"use client";

import { useMemo, useState, type ReactNode } from "react";
import { EmptyState } from "@/components/dashboard/SurfaceCard";

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
 * dashboard already follows ("a session is listed once" -- see AGENTS.md):
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
      upcoming: sessions.filter(
        (s) => s.status !== "cancelled" && !!s.slotTime && new Date(s.slotTime).getTime() >= now
      ).length,
      past: sessions.filter(
        (s) => s.status !== "cancelled" && (!s.slotTime || new Date(s.slotTime).getTime() < now)
      ).length,
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
        if (when === "cancelled") return s.status === "cancelled";
        if (s.status === "cancelled") return false;
        const at = s.slotTime ? new Date(s.slotTime).getTime() : 0;
        return when === "upcoming" ? at >= now : at < now;
      })
      .sort((a, b) => {
        const at = a.slotTime ? new Date(a.slotTime).getTime() : 0;
        const bt = b.slotTime ? new Date(b.slotTime).getTime() : 0;
        // Upcoming reads soonest-first (what happens next); everything
        // else reads newest-first (what happened last).
        return when === "upcoming" ? at - bt : bt - at;
      });
  }, [sessions, when, mode, nowMs]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-xl bg-slate-100 p-1">
          {(["upcoming", "past", "cancelled", "all"] as When[]).map((key) => (
            <button
              key={key}
              type="button"
              aria-pressed={when === key}
              onClick={() => setWhen(key)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                when === key ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {WHEN_LABEL[key]}
              <span className="ml-1.5 text-[10px] font-bold text-slate-400">{counts[key]}</span>
            </button>
          ))}
        </div>

        {hasBothModes && (
          <div className="inline-flex rounded-xl bg-slate-100 p-1">
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
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  mode === key ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
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
        <ul className="space-y-3">
          {visible.map((s) => (
            <li key={s.id}>{cardsById[s.id]}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
