"use client";

import { useMemo, useState } from "react";
import ListPager from "@/components/dashboard/ListPager";
import FilterChips from "@/components/dashboard/FilterChips";
import SurfaceCard, { EmptyState, StatusPill } from "@/components/dashboard/SurfaceCard";
import WeekScheduleSummary from "@/components/roster/WeekScheduleSummary";
import WeeklyScheduleEditor from "@/components/roster/WeeklyScheduleEditor";
import ScheduleExceptionsPanel from "@/components/roster/ScheduleExceptionsPanel";
import LeavePanel from "@/components/roster/LeavePanel";
import { usePagedList } from "@/lib/usePagedList";
import {
  ROSTER_STATUS_LABELS,
  describeLeave,
  effectiveRangesForDate,
  formatRanges,
  formatShortDate,
  listExceptions,
  nextWorkingPeriod,
  rosterStatusFor,
  templateToWeekly,
  type RosterStatus,
  type ScheduledAppointment,
} from "@/lib/availabilityRanges";
import type { OverrideRow, TemplateRow } from "@/lib/therapistAvailability";

// The roster, rebuilt around the therapist rather than around a date.
//
// It used to open on a calendar: pick a day, then read an eighteen-column
// grid of every therapist's hours, then click individual cells to pin one.
// That is the storage model drawn on screen -- correct, and unusable for the
// thing admins actually do, which is "what does she normally work?" So the
// primary object here is a therapist, the primary view is their weekly
// schedule, and dates that differ from it are a separate list called
// exceptions. Leave is its own thing again, and none of the three touches
// the others' data.
//
// Nothing about effective availability changed: the schedule is still the
// weekly template, exceptions still win for their own date, and leave still
// overrides both. Booking reads exactly what it read before.

type Therapist = {
  id: string;
  full_name: string | null;
  timezone: string | null;
  on_leave: boolean;
  on_leave_from: string | null;
  on_leave_to: string | null;
  on_leave_reason: string | null;
  approved: boolean | null;
  active: boolean | null;
};

type RosterFilter = "all" | RosterStatus | "inactive";

export default function AdminRosterTab({
  therapists,
  templateRows,
  overrideRows,
  scheduleVersions,
  appointments,
  todayKey,
  canManageSchedule,
  canManageLeave,
}: {
  therapists: Therapist[];
  templateRows: (TemplateRow & { therapist_id: string })[];
  overrideRows: (OverrideRow & { therapist_id: string; note?: string | null })[];
  /** Version each therapist's schedule is at, so an editor opened here can
   *  be rejected rather than overwrite an edit made somewhere else. */
  scheduleVersions: Record<string, number>;
  appointments: {
    id: string;
    therapist_id: string | null;
    slot_time: string | null;
    status: string | null;
    patientName: string;
  }[];
  /** IST-pinned on the server -- see the identical note in
   *  ScheduleExceptionsPanel for why this is not computed here. */
  todayKey: string;
  /** The two capabilities this screen needs sit in different admin scopes
   *  (schedule under sessions, leave under people). A control a scope cannot
   *  call must not render, or the admin gets a 403 with nothing explaining
   *  it. */
  canManageSchedule: boolean;
  canManageLeave: boolean;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(therapists[0]?.id ?? null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<RosterFilter>("all");

  const templateByTherapist = useMemo(() => groupBy(templateRows), [templateRows]);
  const overrideByTherapist = useMemo(() => groupBy(overrideRows), [overrideRows]);

  const appointmentsByTherapist = useMemo(() => {
    const map = new Map<string, ScheduledAppointment[]>();
    for (const appointment of appointments) {
      if (!appointment.therapist_id) continue;
      const list = map.get(appointment.therapist_id) ?? [];
      list.push({
        id: appointment.id,
        slotTime: appointment.slot_time,
        status: appointment.status,
        label: appointment.patientName,
      });
      map.set(appointment.therapist_id, list);
    }
    return map;
  }, [appointments]);

  const rows = useMemo(
    () =>
      therapists.map((therapist) => {
        const template = templateByTherapist.get(therapist.id) ?? [];
        const overrides = overrideByTherapist.get(therapist.id) ?? [];
        const weekly = templateToWeekly(template);
        const todayRanges = therapist.on_leave
          ? []
          : effectiveRangesForDate(todayKey, template, overrides);
        return {
          therapist,
          template,
          overrides,
          weekly,
          todayRanges,
          status: rosterStatusFor({ onLeave: therapist.on_leave, weekly, todayRanges }),
          upcomingExceptions: listExceptions(template, overrides, { fromDateKey: todayKey }),
          next: nextWorkingPeriod(todayKey, template, overrides, {
            onLeave: therapist.on_leave,
          }),
        };
      }),
    [therapists, templateByTherapist, overrideByTherapist, todayKey]
  );

  const counts = useMemo(() => {
    const tally: Record<RosterFilter, number> = {
      all: rows.length,
      available_today: 0,
      on_leave: 0,
      off_today: 0,
      no_schedule: 0,
      inactive: 0,
    };
    for (const row of rows) {
      tally[row.status] += 1;
      if (row.therapist.active === false) tally.inactive += 1;
    }
    return tally;
  }, [rows]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (needle && !(row.therapist.full_name ?? "").toLowerCase().includes(needle)) return false;
      if (filter === "all") return true;
      if (filter === "inactive") return row.therapist.active === false;
      return row.status === filter;
    });
  }, [rows, query, filter]);

  const { rows: pageRows, pager } = usePagedList(filtered, { storageKey: "admin-roster" });
  const selected = rows.find((row) => row.therapist.id === selectedId) ?? null;

  if (therapists.length === 0) {
    return (
      <SurfaceCard title="Therapist roster" icon="fa-calendar-week">
        <EmptyState
          icon="fa-user-doctor"
          title="No therapists yet"
          body="Approved therapists appear here with their working hours, exceptions and time off."
        />
      </SurfaceCard>
    );
  }

  return (
    <div className="space-y-4">
      <SurfaceCard
        title="Therapist roster"
        icon="fa-calendar-week"
        subtitle="What each therapist normally works, what is different on a date, and who is away."
      >
        <div className="mb-4 flex flex-wrap gap-3 text-xs">
          <Tally label="Therapists" value={counts.all} />
          <Tally label="Available today" value={counts.available_today} />
          <Tally label="On leave" value={counts.on_leave} />
          <Tally label="Not working today" value={counts.off_today} />
          <Tally label="No schedule set" value={counts.no_schedule} />
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-3">
          <label htmlFor="roster-search" className="sr-only">
            Search therapists
          </label>
          <input
            id="roster-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search therapists…"
            className="w-full max-w-xs rounded-lg border border-slate-300 px-3 py-2 text-xs"
          />
        </div>

        <FilterChips
          label="Filter therapists"
          value={filter}
          onChange={setFilter}
          choices={[
            { key: "all", label: "All", count: counts.all },
            { key: "available_today", label: "Available today", count: counts.available_today },
            { key: "on_leave", label: "On leave", count: counts.on_leave },
            { key: "off_today", label: "Not working today", count: counts.off_today },
            { key: "no_schedule", label: "No schedule", count: counts.no_schedule },
            { key: "inactive", label: "Inactive", count: counts.inactive },
          ]}
        />

        {filtered.length === 0 ? (
          <EmptyState
            icon="fa-magnifying-glass"
            title="No therapists match"
            body="Try a different search, or clear the filter."
          />
        ) : (
          <>
            <ul className="grid gap-2 lg:grid-cols-2">
              {pageRows.map((row) => {
                const isSelected = row.therapist.id === selectedId;
                return (
                  <li key={row.therapist.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(row.therapist.id)}
                      aria-pressed={isSelected}
                      className={`w-full rounded-xl border px-4 py-3 text-left transition ${
                        isSelected
                          ? "border-teal-600 bg-teal-50/50"
                          : "border-slate-200 bg-white hover:border-teal-300"
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-display text-sm font-bold text-slate-900">
                          {row.therapist.full_name ?? "Unknown therapist"}
                        </span>
                        <StatusPill tone={STATUS_TONE[row.status]}>
                          {ROSTER_STATUS_LABELS[row.status]}
                        </StatusPill>
                      </div>
                      <p className="mt-0.5 text-[11px] text-slate-500">
                        {row.therapist.timezone || "Asia/Kolkata"}
                        {row.therapist.active === false && " · Suspended"}
                        {row.therapist.approved === false && " · Awaiting approval"}
                      </p>
                      <WeekScheduleSummary
                        weekly={row.weekly}
                        includeOffDays={false}
                        className="mt-2"
                      />
                      <p className="mt-2 text-[11px] text-slate-600">
                        {row.therapist.on_leave
                          ? describeLeave({
                              onLeave: true,
                              from: row.therapist.on_leave_from,
                              to: row.therapist.on_leave_to,
                              reason: row.therapist.on_leave_reason,
                            })
                          : row.todayRanges.length > 0
                            ? `Today · ${formatRanges(row.todayRanges)}`
                            : row.next
                              ? `Next: ${formatShortDate(row.next.dateKey)} · ${formatRanges([
                                  row.next.range,
                                ])}`
                              : "No upcoming hours"}
                      </p>
                      {row.upcomingExceptions.length > 0 && (
                        <p className="mt-1 text-[11px] font-semibold text-amber-700">
                          {row.upcomingExceptions.length} upcoming{" "}
                          {row.upcomingExceptions.length === 1 ? "exception" : "exceptions"}
                        </p>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
            <ListPager pager={pager} noun="therapist" />
          </>
        )}
      </SurfaceCard>

      {selected && (
        <>
          <SurfaceCard
            title={`${selected.therapist.full_name ?? "Therapist"} · Weekly schedule`}
            icon="fa-clock"
            subtitle="What this therapist normally works. Every date follows this unless an exception below says otherwise."
          >
            {canManageSchedule ? (
              <WeeklyScheduleEditor
                key={selected.therapist.id}
                initialWeekly={selected.weekly}
                initialVersion={scheduleVersions[selected.therapist.id] ?? 0}
                timezone={selected.therapist.timezone}
                endpoint="/api/admin/save-therapist-availability"
                therapistId={selected.therapist.id}
                appointments={appointmentsByTherapist.get(selected.therapist.id) ?? []}
                voice="clinician"
                therapistName={selected.therapist.full_name}
              />
            ) : (
              <WeekScheduleSummary weekly={selected.weekly} />
            )}
          </SurfaceCard>

          <SurfaceCard title="Exceptions" icon="fa-calendar-day">
            <ScheduleExceptionsPanel
              key={selected.therapist.id}
              therapistId={selected.therapist.id}
              therapistName={selected.therapist.full_name ?? "This therapist"}
              templateRows={selected.template}
              overrideRows={selected.overrides}
              todayKey={todayKey}
              readOnly={!canManageSchedule}
            />
          </SurfaceCard>

          <SurfaceCard title="Time off" icon="fa-plane-departure">
            {canManageLeave ? (
              <LeavePanel
                key={selected.therapist.id}
                endpoint="/api/admin/set-therapist-on-leave"
                therapistId={selected.therapist.id}
                onLeave={selected.therapist.on_leave}
                from={selected.therapist.on_leave_from}
                to={selected.therapist.on_leave_to}
                reason={selected.therapist.on_leave_reason}
                voice="clinician"
                therapistName={selected.therapist.full_name}
              />
            ) : (
              <p className="text-xs text-slate-500">
                {selected.therapist.on_leave
                  ? "On leave. Managing time off needs the people section."
                  : "Available for bookings."}
              </p>
            )}
          </SurfaceCard>
        </>
      )}
    </div>
  );
}

const STATUS_TONE: Record<RosterStatus, string> = {
  available_today: "good",
  on_leave: "warn",
  off_today: "neutral",
  no_schedule: "bad",
};

function Tally({ label, value }: { label: string; value: number }) {
  return (
    <span className="rounded-lg bg-slate-100 px-3 py-1.5 font-semibold text-slate-700">
      {value} <span className="font-normal text-slate-500">{label.toLowerCase()}</span>
    </span>
  );
}

function groupBy<T extends { therapist_id: string }>(rows: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const list = map.get(row.therapist_id) ?? [];
    list.push(row);
    map.set(row.therapist_id, list);
  }
  return map;
}
