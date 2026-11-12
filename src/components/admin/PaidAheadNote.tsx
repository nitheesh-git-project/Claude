"use client";

import { paidAheadOf, type PaidAheadAppointment } from "@/lib/paidAhead";
import { formatClinicDate } from "@/lib/formatDateTime";
import { istDateKey } from "@/lib/formatSlotRange";
import { formatRupees } from "@/lib/formatMoney";

/**
 * "Paid for upcoming sessions": money already in for sessions dated after the
 * range, which the figures on this screen count on the session's own date.
 * Without it, a patient who pays today for tomorrow appears nowhere on a range
 * that ends today. Renders nothing when there is none.
 */
export default function PaidAheadNote({
  appointments,
  rangeEndMs,
  onInclude,
}: {
  appointments: PaidAheadAppointment[];
  rangeEndMs: number;
  /** Moves the range's To date so these sessions are counted. */
  onInclude: (toDate: string) => void;
}) {
  const ahead = paidAheadOf(appointments, rangeEndMs);
  if (ahead.count === 0 || !ahead.latestSlotTime) return null;
  const latest = ahead.latestSlotTime;
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-xs text-sky-900"
      data-testid="paid-ahead-note"
    >
      <p>
        <strong>Paid for upcoming sessions: ₹{formatRupees(ahead.netPaise)}</strong> from {ahead.count}{" "}
        session{ahead.count === 1 ? "" : "s"} dated after this range
        {ahead.refundedPaise > 0 ? ` (₹${formatRupees(ahead.paidPaise)} paid, ₹${formatRupees(ahead.refundedPaise)} refunded)` : ""}.
        Money counts on the session&apos;s date, so it joins these figures when the session takes place.
      </p>
      <button
        type="button"
        onClick={() => onInclude(istDateKey(latest))}
        className="shrink-0 rounded-lg border border-sky-300 bg-white px-3 py-1.5 font-semibold text-sky-800 hover:bg-sky-100"
      >
        Show up to {formatClinicDate(latest)}
      </button>
    </div>
  );
}
