import type { createAdminClient } from "@/lib/supabase/admin";
import { deleteMeetEventForAppointment } from "@/lib/googleCalendarSync";

type AdminClient = ReturnType<typeof createAdminClient>;
type PurchaseColumn = "package_purchase_id" | "home_visit_purchase_id";

/**
 * How many sessions on a purchase were delivered -- read AFTER the refund
 * has claimed the purchase, so the figure cannot move underneath it.
 *
 * Both refund routes counted first and claimed second, and dropped the
 * count's error: a failed count read as zero delivered (a full refund of
 * treatment already given), and a therapist completing a session in the
 * window was refunded too. Once the purchase reads `refunded`,
 * /api/appointments/complete-session refuses its sessions, so the count is
 * final. Null when it could not be read -- the caller must not refund.
 */
export async function countDeliveredSessions(
  admin: AdminClient,
  column: PurchaseColumn,
  purchaseId: string
): Promise<number | null> {
  const { count, error } = await admin
    .from("appointments")
    .select("id", { count: "exact", head: true })
    .eq(column, purchaseId)
    .eq("status", "completed");
  if (error) return null;
  return count ?? 0;
}

/**
 * After a refund has gone through: every still-live session on the purchase
 * is cancelled, then its Meet event removed.
 *
 * It used to cancel and delete without checking either result and answer
 * success, so a refunded programme could keep confirmed sessions that were
 * still bookable and joinable. Every failure is collected and returned, so
 * the route says which sessions still need a person rather than claiming
 * they were all closed.
 */
export async function closeRefundedPurchaseSessions(
  admin: AdminClient,
  { column, purchaseId, adminId }: { column: PurchaseColumn; purchaseId: string; adminId: string }
): Promise<{ cancelledIds: string[]; failedIds: string[]; readFailed: boolean }> {
  const { data: live, error } = await admin
    .from("appointments")
    .select("id, google_event_id")
    .eq(column, purchaseId)
    .in("status", ["requested", "confirmed"]);
  if (error) return { cancelledIds: [], failedIds: [], readFailed: true };

  const cancelledIds: string[] = [];
  const failedIds: string[] = [];
  for (const appointment of live ?? []) {
    // Cancelled first: a session that cannot be joined is the guarantee; the
    // calendar entry is tidying behind it.
    const { data: cancelled, error: cancelError } = await admin
      .from("appointments")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        cancelled_by: adminId,
        cancellation_reason: "Package refunded by admin",
      })
      .eq("id", appointment.id)
      .in("status", ["requested", "confirmed"])
      .select("id")
      .maybeSingle();
    if (cancelError) {
      failedIds.push(appointment.id);
      continue;
    }
    if (!cancelled) continue; // already closed by someone else -- nothing live left
    cancelledIds.push(appointment.id);

    await deleteMeetEventForAppointment(admin, {
      appointmentId: appointment.id,
      googleEventId: appointment.google_event_id,
    });
    // deleteMeetEventForAppointment never throws; it records a failed
    // deletion on the row (google_calendar_sync_error), which the admin's
    // Meet sync screen already lists for a retry.
  }
  return { cancelledIds, failedIds, readFailed: false };
}

/** The warning a refund answers with when a session could not be closed. */
export function refundCloseoutWarning(result: { failedIds: string[]; readFailed: boolean }): string | null {
  if (result.readFailed) {
    return "The refund went through, but we couldn't read the programme's remaining sessions to cancel them. Check its sessions and cancel any still booked.";
  }
  if (result.failedIds.length > 0) {
    return `The refund went through, but ${result.failedIds.length} session(s) could not be cancelled and may still be booked. Cancel them from the programme's sessions.`;
  }
  return null;
}
