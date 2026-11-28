// The therapist's Home "Today" list: every session on the clinic's today, in
// order, each with the one word that says where it stands. Dependency-free
// apart from the clinic-zone formatter, so it is testable without rendering.
//
// "Today" is the clinic's day (Asia/Kolkata via formatClinicDate), never the
// server's: on a UTC host a 9 AM IST session belongs to "yesterday" until
// 5:30 AM, which is how the Today count used to disagree with the list a
// therapist could see.

import { formatClinicDate } from "./formatDateTime";

export type TodayAppointment = {
  id: string;
  patient_id: string;
  slot_time: string | null;
  status: string;
  no_show?: boolean | null;
  duration_minutes?: number | null;
  concern?: string | null;
  visit?: { visit_mode?: string | null } | null;
};

export type TodayState =
  /** Delivered. */
  | "done"
  | "no-show"
  /** Started and not over yet. */
  | "now"
  /** The first one still to come. */
  | "next"
  | "later"
  /** Its time has passed and nobody has marked it complete. */
  | "to-finish"
  /** Booked, waiting for the clinic to confirm. */
  | "waiting";

export type TodayRow = {
  id: string;
  patientId: string;
  slotTime: string;
  durationMinutes: number;
  concern: string | null;
  homeVisit: boolean;
  state: TodayState;
};

export function sameClinicDay(a: string | number | Date, b: string | number | Date): boolean {
  const x = formatClinicDate(a);
  return x !== "-" && x === formatClinicDate(b);
}

export function todaysSessions(appointments: TodayAppointment[], nowMs: number): TodayRow[] {
  const rows = appointments
    .filter((a) => !!a.slot_time && a.status !== "cancelled" && sameClinicDay(a.slot_time, nowMs))
    .sort((a, b) => Date.parse(a.slot_time as string) - Date.parse(b.slot_time as string));
  let nextTaken = false;
  return rows.map((a) => {
    const start = Date.parse(a.slot_time as string);
    const minutes = a.duration_minutes ?? 60;
    const end = start + minutes * 60_000;
    let state: TodayState;
    if (a.no_show) state = "no-show";
    else if (a.status === "completed") state = "done";
    else if (a.status === "requested") state = "waiting";
    else if (start <= nowMs && nowMs < end) state = "now";
    else if (end <= nowMs) state = "to-finish";
    else if (!nextTaken) {
      state = "next";
      nextTaken = true;
    } else state = "later";
    return {
      id: a.id,
      patientId: a.patient_id,
      slotTime: a.slot_time as string,
      durationMinutes: minutes,
      concern: a.concern ?? null,
      homeVisit: a.visit?.visit_mode === "home_visit",
      state,
    };
  });
}

/**
 * Today's progress. `settled` (delivered or a no-show) fills the bar --
 * neither needs anything more from the therapist. `done` is delivered only,
 * which is what "N of M done" says: a no-show can be marked a quarter of an
 * hour into the slot, and counting it as done had Home read "1 of 1 done"
 * while that session's time was still running and nothing had been done.
 */
export function todayProgress(rows: TodayRow[]): { settled: number; done: number; noShow: number; total: number } {
  const done = rows.filter((r) => r.state === "done").length;
  const noShow = rows.filter((r) => r.state === "no-show").length;
  return { settled: done + noShow, done, noShow, total: rows.length };
}

/** "1 of 2 done", "0 of 1 done · 1 no-show". */
export function todayProgressLabel(p: { done: number; noShow: number; total: number }): string {
  return `${p.done} of ${p.total} done${p.noShow > 0 ? ` · ${p.noShow} no-show` : ""}`;
}
