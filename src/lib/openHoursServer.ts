import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readAllRowsByIds } from "@/lib/supabase/readAllRows";
import { addDaysToKey, openSlotStarts, openStartsAmong, zoneHourStarts, type RosterTherapist } from "@/lib/openHours";
import { zonedSlotMs, CLINIC_TIMEZONE } from "@/lib/bookingSlots";
import { clinicDateKey } from "@/lib/clinicWeek";
import { DEFAULT_ADMIN_SETTINGS } from "@/lib/adminSettings";

type TemplateReadRow = { therapist_id: string; day_of_week: number; hour: number };

/**
 * Reads the roster -- every approved, active therapist's weekly hours,
 * one-off exceptions and sessions -- and answers which start times in the
 * window at least one of them can take (openHours.ts).
 *
 * Null when any part could not be read: "could not check" is never "nobody
 * is free". The pickers then offer every hour and the booking route lets
 * the booking through, which is what both did before this existed.
 */
export async function readOpenSlotStarts(
  admin: SupabaseClient,
  // The length may still be on its way (the route reads it from the
  // service): it is awaited only when the roster is in hand, so the two
  // reads overlap instead of queueing.
  input: {
    fromDateKey: string;
    days: number;
    durationMinutes: number | Promise<number>;
    nowMs: number;
    /** Only these therapists' hours -- the therapist suggesting a session,
     *  or the one an admin has chosen. Absent: anyone in the clinic. */
    therapistIds?: string[];
    /** Travel time either side of a home visit (the clinic's setting). */
    bufferMinutes?: number;
    /** The session being moved, so its own slot does not block it. */
    excludeAppointmentId?: string;
    /** Answer on this zone's whole hours (the patient's own picker grid)
     *  instead of the clinic's. Absent or the clinic's zone: the clinic grid. */
    gridTimeZone?: string | null;
    /** Judge exactly these instants instead of a grid -- a booking route
     *  checking the one time it was asked for. */
    starts?: number[];
  }
): Promise<number[] | null> {
  try {
    const days = Math.max(1, Math.min(input.days, 120));
    const endKey = addDaysToKey(input.fromDateKey, days);
    const windowStart = zonedSlotMs(input.fromDateKey, 0, CLINIC_TIMEZONE);
    const windowEnd = zonedSlotMs(endKey, 0, CLINIC_TIMEZONE);
    if (windowStart === null || windowEnd === null) return null;

    const { data: therapists, error } = await admin
      .from("profiles")
      .select("id, on_leave, on_leave_from, on_leave_to")
      .eq("role", "therapist")
      .eq("approved", true)
      .eq("active", true);
    if (error || !therapists) return null;
    const wanted = input.therapistIds ? new Set(input.therapistIds) : null;
    const chosen = wanted ? therapists.filter((t) => wanted.has(t.id as string)) : therapists;
    if (chosen.length === 0) return [];
    const ids = chosen.map((t) => t.id as string);

    // A session that started up to a day before the window can still run
    // into it, so the bookings read reaches back a day.
    const [templates, overrides, bookings] = await Promise.all([
      readAllRowsByIds(ids, (chunk) =>
        admin
          .from("therapist_availability_template")
          .select("therapist_id, day_of_week, hour")
          .in("therapist_id", chunk)
          .order("id", { ascending: true })
      ),
      readAllRowsByIds<{ therapist_id: string; date: string; hour: number; available: boolean }>(ids, (chunk) =>
        admin
          .from("therapist_availability_override")
          .select("therapist_id, date, hour, available")
          .in("therapist_id", chunk)
          .gte("date", input.fromDateKey)
          .lt("date", endKey)
          .order("id", { ascending: true })
      ),
      readAllRowsByIds<{
        id: string;
        therapist_id: string;
        slot_time: string | null;
        duration_minutes: number | null;
        status: string;
      }>(ids, (chunk) =>
        admin
          .from("appointments")
          .select("id, therapist_id, slot_time, duration_minutes, status")
          .in("therapist_id", chunk)
          .in("status", ["requested", "confirmed"])
          .gte("slot_time", new Date(windowStart - 86_400_000).toISOString())
          // A day past the window: a grid on a zone ahead of the clinic (and
          // a session that runs over midnight) reaches into the next day.
          .lt("slot_time", new Date(windowEnd + 86_400_000).toISOString())
          .order("id", { ascending: true })
      ),
    ]);
    if (templates.error || overrides.error || bookings.error) return null;
    if (templates.truncated || overrides.truncated || bookings.truncated) return null;
    // Nobody in the clinic has any weekly hours: the roster is not in use, so
    // it cannot say who is free. "Not checked" (every hour offered, and the
    // clinic confirms), never "nobody is free" -- which would refuse every
    // booking in a clinic that simply has not filled its roster in.
    if (templates.rows.length === 0) {
      if (!wanted) return null;
      // A named therapist with no weekly hours: whether that means "the
      // clinic does not use the roster" or "this one cannot be booked"
      // depends on whether anybody else has hours.
      const { count, error: countError } = await admin
        .from("therapist_availability_template")
        .select("therapist_id", { count: "exact", head: true });
      if (countError) return null;
      if (!count) return null;
    }

    const roster: RosterTherapist[] = chosen.map((t) => ({
      id: t.id as string,
      onLeave: t.on_leave === true,
      leaveFrom: (t.on_leave_from as string | null) ?? null,
      leaveTo: (t.on_leave_to as string | null) ?? null,
      template: (templates.rows as TemplateReadRow[])
        .filter((r) => r.therapist_id === t.id)
        .map((r) => ({ day_of_week: r.day_of_week, hour: r.hour })),
      overrides: overrides.rows.filter((r) => r.therapist_id === t.id).map((r) => ({ date: r.date, hour: r.hour, available: r.available })),
      bookings: bookings.rows.filter((r) => r.therapist_id === t.id),
    }));

    const durationMinutes = await input.durationMinutes;
    const ownGrid =
      input.starts ??
      (input.gridTimeZone && input.gridTimeZone !== CLINIC_TIMEZONE
        ? zoneHourStarts(input.fromDateKey, days, input.gridTimeZone)
        : null);
    if (ownGrid) {
      return openStartsAmong({
        starts: ownGrid,
        therapists: roster,
        durationMinutes,
        bufferMinutes: input.bufferMinutes,
        excludeAppointmentId: input.excludeAppointmentId,
        nowMs: input.nowMs,
      });
    }

    return openSlotStarts({
      fromDateKey: input.fromDateKey,
      days,
      therapists: roster,
      durationMinutes,
      bufferMinutes: input.bufferMinutes,
      excludeAppointmentId: input.excludeAppointmentId,
      nowMs: input.nowMs,
    });
  } catch (err) {
    console.error("readOpenSlotStarts failed", err);
    return null;
  }
}

/** What a booking route says when nobody can take the time asked for. */
export const SLOT_NOT_OPEN_ERROR = "No physiotherapist is free at that time any more. Please pick another time.";

/**
 * Whether one slot is closed -- checked and nobody can take it -- for the
 * routes that book a time a picker offered (openHours.ts). The pickers show
 * only open hours; this is the copy that binds, for a page left open or a
 * request made without the picker. "Could not check" is not closed: the
 * booking goes through and the clinic confirms or offers another time, as
 * before this existed. Never call it after money has moved -- a paid
 * booking is never refused for this.
 */
export async function isSlotClosed(
  admin: SupabaseClient,
  slotIso: string,
  opts: { durationMinutes: number; bufferMinutes?: number; excludeAppointmentId?: string }
): Promise<boolean> {
  const slotMs = Date.parse(slotIso);
  if (!Number.isFinite(slotMs)) return false;
  const open = await readOpenSlotStarts(admin, {
    fromDateKey: clinicDateKey(slotMs),
    days: 1,
    durationMinutes: opts.durationMinutes,
    nowMs: Date.now(),
    bufferMinutes: opts.bufferMinutes,
    excludeAppointmentId: opts.excludeAppointmentId,
    // The instant itself, not a lookup in the clinic grid: a patient on a
    // zone whose hours fall on the clinic half hour was refused every time.
    starts: [slotMs],
  });
  return open !== null && !open.includes(slotMs);
}

/** The clinic's travel time around a home visit, or the default when the
 *  setting cannot be read. */
export async function readTravelBufferMinutes(admin: SupabaseClient): Promise<number> {
  try {
    const { data } = await admin.from("site_settings").select("home_visit_travel_buffer_minutes").maybeSingle();
    return (
      (data as { home_visit_travel_buffer_minutes?: number | null } | null)?.home_visit_travel_buffer_minutes ??
      DEFAULT_ADMIN_SETTINGS.homeVisitTravelBufferMinutes
    );
  } catch {
    return DEFAULT_ADMIN_SETTINGS.homeVisitTravelBufferMinutes;
  }
}
