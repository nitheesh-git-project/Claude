import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readAllRowsByIds } from "@/lib/supabase/readAllRows";
import { addDaysToKey, openSlotStarts, type RosterTherapist } from "@/lib/openHours";
import { zonedSlotMs, CLINIC_TIMEZONE } from "@/lib/bookingSlots";

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
  input: { fromDateKey: string; days: number; durationMinutes: number | Promise<number>; nowMs: number }
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
    if (therapists.length === 0) return [];
    const ids = therapists.map((t) => t.id as string);

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
          .lt("slot_time", new Date(windowEnd).toISOString())
          .order("id", { ascending: true })
      ),
    ]);
    if (templates.error || overrides.error || bookings.error) return null;
    if (templates.truncated || overrides.truncated || bookings.truncated) return null;
    // Nobody in the clinic has any weekly hours: the roster is not in use, so
    // it cannot say who is free. "Not checked" (every hour offered, and the
    // clinic confirms), never "nobody is free" -- which would refuse every
    // booking in a clinic that simply has not filled its roster in.
    if (templates.rows.length === 0) return null;

    const roster: RosterTherapist[] = therapists.map((t) => ({
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

    return openSlotStarts({
      fromDateKey: input.fromDateKey,
      days,
      therapists: roster,
      durationMinutes: await input.durationMinutes,
      nowMs: input.nowMs,
    });
  } catch (err) {
    console.error("readOpenSlotStarts failed", err);
    return null;
  }
}
