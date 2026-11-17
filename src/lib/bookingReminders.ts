import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";
import { REMINDER_WINDOWS, dueReminder } from "@/lib/bookingEmails";
import { sendAppointmentEmailOnce } from "@/lib/appointmentEmailServer";

// The reminder step of the maintenance sweep (maintenanceSweep.ts, every 30
// minutes and after an admin dashboard load). Finds confirmed sessions inside
// a reminder window and sends each due reminder once -- the appointment_emails
// row makes a second run, or the dashboard's run racing the schedule, a no-op.
// Bounded: at most MAX_PER_RUN sessions a run, oldest slot first, so a backlog
// drains over a few runs rather than in one long request.

const MAX_PER_RUN = 100;

export async function sendDueBookingReminders(admin: ReturnType<typeof createAdminClient>, nowMs: number = Date.now()): Promise<number> {
  const from = new Date(nowMs + REMINDER_WINDOWS.reminder_1h.fromMs).toISOString();
  const to = new Date(nowMs + REMINDER_WINDOWS.reminder_24h.toMs).toISOString();
  const { data, error } = await admin
    .from("appointments")
    .select("id, slot_time, created_at")
    .eq("status", "confirmed")
    .gt("slot_time", from)
    .lte("slot_time", to)
    .order("slot_time", { ascending: true })
    .limit(MAX_PER_RUN);
  if (error) throw error;
  let queued = 0;
  for (const row of data ?? []) {
    const slotMs = Date.parse(String(row.slot_time));
    const bookedAtMs = row.created_at ? Date.parse(String(row.created_at)) : null;
    const event = dueReminder({ slotMs, nowMs, bookedAtMs: Number.isFinite(bookedAtMs) ? bookedAtMs : null });
    if (!event) continue;
    await sendAppointmentEmailOnce(String(row.id), event);
    queued += 1;
  }
  return queued;
}
