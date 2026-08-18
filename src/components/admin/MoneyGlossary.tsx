// Why this exists: every figure on the money screens was already correct,
// and none of them said which question it answered. "Revenue" on the summary
// (paid sessions by slot time, before refunds) is not "Revenue" in category
// performance, and neither is "Package Cash" (collected up front, recognised
// later). Three right answers to three different questions, all labelled the
// same word.
//
// Plain server component -- it is a table of text with no state.

const ENTRIES: { term: string; meaning: string }[] = [
  {
    term: "Gross Revenue",
    meaning:
      "Every paid session whose slot falls in the range, before any refunds. The top line: what was charged.",
  },
  {
    term: "Net Revenue",
    meaning: "Gross Revenue minus refunds that actually processed. What the business kept.",
  },
  {
    term: "Platform Margin (Profit)",
    meaning:
      "What is left after the therapist's cut and any hospital's cut. Sessions whose split can't be worked out — a therapist with no revenue share configured — are excluded rather than counted as 100% margin.",
  },
  {
    term: "Net Platform Margin",
    meaning:
      "Platform Margin minus refunds. Approximate on purpose: it subtracts the full refunded amount even for a session that was excluded from the margin, so treat it as a floor, not a precise figure.",
  },
  {
    term: "Paid to Therapists",
    meaning: "Money already transferred out in settled payouts.",
  },
  {
    term: "Pending Owed",
    meaning:
      "Earned by therapists on delivered sessions and not yet transferred. This is a debt, not a cost — it will become Paid to Therapists.",
  },
  {
    term: "Recognised revenue",
    meaning:
      "What has been earned so far: a paid session counts when it is scheduled. A package is recognised one session at a time, not all at once when it is bought.",
  },
  {
    term: "Package cash collected",
    meaning:
      "The full price of package purchases paid up front — what came into the bank. Deliberately not added to recognised revenue, which counts the same money gradually as sessions get scheduled. Both figures are real; they answer different questions.",
  },
  {
    term: "Travel fee",
    meaning:
      "A home visit's travel reimbursement. Paid to the therapist in full and never counted as revenue or margin — folding it in would mean a therapist funding their own transport.",
  },
  {
    term: "Cash collected",
    meaning:
      "Money a therapist took at a patient's door on a cash-on-visit home visit. It belongs to the business but is physically with the therapist.",
  },
  {
    term: "Cash remitted",
    meaning:
      "Collected cash that has been handed over. Until it is, it nets off what that therapist's next payout actually transfers.",
  },
  {
    term: "Manual refund pending",
    meaning:
      "A cancelled cash visit where money was collected and there is no Razorpay payment to reverse — a human has to hand it back. It stays on this list until someone confirms they did.",
  },
  {
    term: "Unpaid (home visit)",
    meaning:
      "Normal for cash-on-visit. It does not mean nobody ever paid — check the payment mode before reading it as a debt.",
  },
];

export default function MoneyGlossary() {
  return (
    <details className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <summary className="cursor-pointer px-6 py-4 text-sm font-bold text-slate-800">
        What each number means
      </summary>
      <div className="border-t border-slate-100 px-6 py-4">
        <p className="mb-4 text-xs text-slate-500">
          One word, one meaning. Where two figures sound alike, this says what separates them.
        </p>
        <dl className="space-y-3">
          {ENTRIES.map((e) => (
            <div key={e.term} className="grid grid-cols-1 gap-1 sm:grid-cols-[180px_1fr] sm:gap-4">
              <dt className="text-xs font-bold text-slate-800">{e.term}</dt>
              <dd className="text-xs text-slate-600">{e.meaning}</dd>
            </div>
          ))}
        </dl>
      </div>
    </details>
  );
}
