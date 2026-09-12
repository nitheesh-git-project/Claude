import { describeRefund, type RefundRow } from "@/lib/refundState";

// The refund, beside the payment, wherever a session is listed.
//
// A payment has always had a chip; money going back out had none, so an
// admin who refunded a session from a patient's profile watched the row go
// on looking exactly as it had. The colour carries the same meaning it does
// everywhere else in this app: green is done, amber is waiting on somebody,
// red is broken, slate is a decision that nothing is owed.
//
// Renders **nothing** when there is no refund -- an empty chip beside every
// unrefunded session would be noise on the 99% of rows that have nothing to
// say.
export default function RefundChip({
  row,
  className = "",
}: {
  row: RefundRow | null | undefined;
  className?: string;
}) {
  const refund = describeRefund(row);
  if (refund.state === "none") return null;

  const tone =
    refund.tone === "good"
      ? "text-emerald-700 bg-emerald-50"
      : refund.tone === "warn"
        ? "text-amber-800 bg-amber-50"
        : refund.tone === "bad"
          ? "text-red-700 bg-red-50"
          : "text-slate-500 bg-slate-100";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold ${tone} ${className}`}
      // The reason is the half an admin actually needs months later, and
      // there is no room for it on a table row.
      title={refund.reason ?? undefined}
    >
      <i
        aria-hidden
        className={`fa-solid text-[9px] ${
          refund.state === "processed"
            ? "fa-rotate-left"
            : refund.state === "failed"
              ? "fa-circle-exclamation"
              : refund.state === "manual_pending"
                ? "fa-hand-holding-dollar"
                : "fa-minus"
        }`}
      />
      {refund.label}
    </span>
  );
}
