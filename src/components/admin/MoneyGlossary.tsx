// Why this exists: the money screens carry several figures that sound alike
// and are not. "Package cash collected" (money in the bank up front) is not
// revenue (recognised one session at a time). "Clinic share" is not profit.
// "Owed to therapists" is a balance as of now, while everything beside it is
// a flow over the selected dates.
//
// The rule this enforces: one word, one figure. Where an earlier version had
// two names for one number ("Recognised revenue" alongside "Gross revenue")
// the duplicate was removed rather than explained; where one word covered two
// different numbers ("Profit" on both Summary and Payouts) each was renamed
// for what it actually measures. What is left here is the genuinely
// non-obvious distinctions, not an apology for careless labels.
//
// Plain server component -- it is a table of text with no state.

const ENTRIES: { term: string; meaning: string }[] = [
  {
    term: "Gross revenue",
    meaning:
      "Everything charged for sessions whose slot falls in the range, before refunds. The top line.",
  },
  {
    term: "Refunded",
    meaning: "Refunds that actually processed. A refund that failed or was never eligible is not here.",
  },
  {
    term: "Net revenue",
    meaning: "Gross revenue minus refunds — what the clinic kept. Every share below is taken out of this.",
  },
  {
    term: "Therapists' share",
    meaning:
      "What therapists earned on sessions they actually delivered, at each therapist's own rate, plus any home-visit travel reimbursement in full. A session that was booked and paid for but never delivered earns nobody a share.",
  },
  {
    term: "Partners' share",
    meaning:
      "A referring hospital's commission on the money the clinic kept from patients they sent. Taken on net revenue, so a refund reverses the commission with it.",
  },
  {
    term: "Clinic share",
    meaning:
      "Net revenue less both shares — the clinic's own take, before running costs (payment fees, software, salaries). It is deliberately not called profit: no cost of running the business has been deducted from it.",
  },
  {
    term: "Left out of the split",
    meaning:
      "Paid sessions counted in revenue but excluded from the three shares, because no split can be worked out: the therapist has no revenue share set, or the patient came from a partner whose share is not configured. Set the percentages in People and they disappear.",
  },
  {
    term: "Owed to therapists",
    meaning:
      "What the clinic owes right now, all time — not scoped to the dates in view, because a debt does not stop existing outside a date range. Already net of any cash therapists are holding, so it is exactly what a payout run would transfer.",
  },
  {
    term: "Paid to therapists",
    meaning: "Already transferred, for sessions scheduled in the range in view.",
  },
  {
    term: "Package cash collected",
    meaning:
      "The full price of package purchases paid up front — money in the bank. Deliberately not added to revenue, which recognises the same money gradually, one session at a time as they get scheduled. Both are real; they answer different questions.",
  },
  {
    term: "Travel fee",
    meaning:
      "A home visit's travel reimbursement. Paid to the therapist in full and never counted as revenue — folding it in would mean a therapist funding their own transport.",
  },
  {
    term: "Cash collected",
    meaning:
      "Money a therapist took at a patient's door on a cash-on-visit home visit. It belongs to the clinic but is physically with the therapist.",
  },
  {
    term: "Cash remitted",
    meaning:
      "Collected cash the clinic has back. Until then it nets off that therapist's next payout — and settling a payout that absorbs it records it as remitted, so the same rupees are never deducted twice.",
  },
  {
    term: "Manual refund pending",
    meaning:
      "A cancelled cash visit where money was collected and there is no Razorpay payment to reverse — a human has to hand it back. It stays on the Cash Ledger until someone confirms they did.",
  },
  {
    term: "Unpaid (home visit)",
    meaning:
      "Normal for cash-on-visit before the therapist records the collection. It does not mean nobody will ever pay — check the payment mode before reading it as a debt.",
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
