type ProfitSession = {
  id: string;
  label: string;
  paidPaise: number;
  payoutPaise: number;
  profitPaise: number;
};

// Chart colors are picked separately from the app's teal-700 brand accent —
// teal-700 itself is too low-chroma to read reliably as a chart series, and
// a plain slate neutral sits too close to it for colorblind-safe separation
// (both checked with the dataviz skill's palette validator). teal-600 +
// indigo-600 pass every check: lightness band, chroma floor, CVD separation
// at the 6-8 floor and above, and contrast against a white card.
const PAYOUT_COLOR = "#4f46e5"; // indigo-600
const PROFIT_COLOR = "#0d9488"; // teal-600

function formatInr(paise: number) {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

export default function PatientProfitChart({
  sessions,
  totalPaidPaise,
  totalPayoutPaise,
  totalProfitPaise,
  excludedCount,
}: {
  sessions: ProfitSession[];
  totalPaidPaise: number;
  totalPayoutPaise: number;
  totalProfitPaise: number;
  excludedCount: number;
}) {
  if (sessions.length === 0) {
    return (
      <p className="text-xs text-slate-500 py-4 text-center">
        {excludedCount > 0
          ? "No sessions with a known therapist payout yet."
          : "No paid sessions yet."}
      </p>
    );
  }

  const barWidth = 24;
  const gap = 28;
  const chartHeight = 140;
  const labelSpace = 22;
  const maxPaise = Math.max(...sessions.map((s) => s.paidPaise), 1);
  const svgWidth = sessions.length * (barWidth + gap) + gap;

  return (
    <div>
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="bg-slate-50 rounded-xl p-3 text-center">
          <p className="text-[11px] text-slate-500">Total Paid</p>
          <p className="text-base font-bold text-slate-900">{formatInr(totalPaidPaise)}</p>
        </div>
        <div className="bg-slate-50 rounded-xl p-3 text-center">
          <p className="text-[11px] text-slate-500">Therapist Payout</p>
          <p className="text-base font-bold text-slate-900" style={{ color: PAYOUT_COLOR }}>
            {formatInr(totalPayoutPaise)}
          </p>
        </div>
        <div className="bg-teal-50 rounded-xl p-3 text-center">
          <p className="text-[11px] text-slate-500">Your Profit</p>
          <p className="text-base font-bold" style={{ color: PROFIT_COLOR }}>
            {formatInr(totalProfitPaise)}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-4 mb-2 text-[11px] text-slate-500">
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block w-2.5 h-2.5 rounded-sm"
            style={{ backgroundColor: PAYOUT_COLOR }}
          />
          Therapist Payout
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block w-2.5 h-2.5 rounded-sm"
            style={{ backgroundColor: PROFIT_COLOR }}
          />
          Your Profit
        </span>
      </div>

      <div className="overflow-x-auto">
        <svg
          width={svgWidth}
          height={chartHeight + labelSpace}
          role="img"
          aria-label="Paid amount per session, split into therapist payout and your profit"
        >
          <line
            x1={0}
            y1={chartHeight}
            x2={svgWidth}
            y2={chartHeight}
            stroke="#e2e8f0"
            strokeWidth={1}
          />
          {sessions.map((s, i) => {
            const x = gap + i * (barWidth + gap);
            const totalH = (s.paidPaise / maxPaise) * (chartHeight - 20);
            const payoutH = s.paidPaise > 0 ? (s.payoutPaise / s.paidPaise) * totalH : 0;
            const profitH = Math.max(totalH - payoutH - (payoutH > 0 ? 2 : 0), 0);
            const payoutY = chartHeight - payoutH;
            const profitY = payoutY - profitH - (payoutH > 0 && profitH > 0 ? 2 : 0);

            return (
              <g key={s.id}>
                <title>
                  {s.label}: paid {formatInr(s.paidPaise)}, payout {formatInr(s.payoutPaise)},
                  profit {formatInr(s.profitPaise)}
                </title>
                {payoutH > 0 && (
                  <rect
                    x={x}
                    y={payoutY}
                    width={barWidth}
                    height={payoutH}
                    fill={PAYOUT_COLOR}
                    rx={profitH > 0 ? 0 : 4}
                  />
                )}
                {profitH > 0 && (
                  <rect
                    x={x}
                    y={profitY}
                    width={barWidth}
                    height={profitH}
                    fill={PROFIT_COLOR}
                    rx={4}
                  />
                )}
                <text
                  x={x + barWidth / 2}
                  y={Math.min(payoutY, profitY) - 6}
                  textAnchor="middle"
                  fontSize={10}
                  fontWeight={700}
                  fill="#0f172a"
                >
                  {formatInr(s.paidPaise)}
                </text>
                <text
                  x={x + barWidth / 2}
                  y={chartHeight + 15}
                  textAnchor="middle"
                  fontSize={9.5}
                  fill="#94a3b8"
                >
                  {s.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {excludedCount > 0 && (
        <p className="text-[11px] text-slate-400 mt-3">
          {excludedCount} paid session{excludedCount > 1 ? "s" : ""} excluded — therapist not
          assigned or their revenue share isn&apos;t set yet.
        </p>
      )}
    </div>
  );
}
