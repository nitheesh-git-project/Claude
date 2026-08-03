// Stacked two-segment bar chart, hand-rolled SVG like PatientProfitChart (no
// charting library in this codebase) -- one bar per calendar day (IST) that
// has at least one earning in the currently-filtered rows, split into the
// paid-out portion (bottom, solid teal) and the still-pending portion (top,
// lighter teal) so settling a payout visibly moves that day's segment from
// pending to paid on next load. Bucketing stops at "by day"; a wide date
// range just scrolls horizontally rather than collapsing into weeks/months,
// the same tradeoff PatientProfitChart already accepts for many sessions.
const PAID_COLOR = "#0f766e"; // teal-700, this app's own brand accent
const PENDING_COLOR = "#99f6e4"; // teal-200, same hue family, clearly lighter

function formatInr(paise: number) {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

export type EarningsDay = {
  key: string; // IST date key, YYYY-MM-DD
  label: string; // short display label, e.g. "1 Aug"
  paidPaise: number;
  pendingPaise: number;
};

export default function TherapistEarningsChart({ days }: { days: EarningsDay[] }) {
  if (days.length === 0) {
    return (
      <p className="text-xs text-slate-500 py-4 text-center">
        No earnings in this range yet.
      </p>
    );
  }

  const barWidth = 24;
  const gap = 28;
  const chartHeight = 140;
  const labelSpace = 22;
  const totals = days.map((d) => d.paidPaise + d.pendingPaise);
  const maxPaise = Math.max(...totals, 1);
  const svgWidth = days.length * (barWidth + gap) + gap;

  return (
    <div>
      <div className="flex items-center gap-4 mb-2 text-[11px] text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: PAID_COLOR }}></span>
          Paid Out
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: PENDING_COLOR }}></span>
          Pending
        </span>
      </div>
      <div className="overflow-x-auto">
        <svg
          width={svgWidth}
          height={chartHeight + labelSpace}
          role="img"
          aria-label="Your earnings per day, split into paid-out and pending"
        >
          <line
            x1={0}
            y1={chartHeight}
            x2={svgWidth}
            y2={chartHeight}
            stroke="#e2e8f0"
            strokeWidth={1}
          />
          {days.map((d, i) => {
            const total = d.paidPaise + d.pendingPaise;
            const x = gap + i * (barWidth + gap);
            const totalH = (total / maxPaise) * (chartHeight - 20);
            const paidH = total > 0 ? (d.paidPaise / total) * totalH : 0;
            const pendingH = totalH - paidH;
            const paidY = chartHeight - paidH;
            const pendingY = paidY - pendingH;
            return (
              <g key={d.key}>
                <title suppressHydrationWarning>
                  {`${d.label}: ${formatInr(total)} (${formatInr(d.paidPaise)} paid, ${formatInr(d.pendingPaise)} pending)`}
                </title>
                {paidH > 0 && (
                  <rect x={x} y={paidY} width={barWidth} height={paidH} fill={PAID_COLOR} rx={4} />
                )}
                {pendingH > 0 && (
                  <rect x={x} y={pendingY} width={barWidth} height={pendingH} fill={PENDING_COLOR} rx={4} />
                )}
                <text
                  x={x + barWidth / 2}
                  y={pendingY - 6}
                  textAnchor="middle"
                  fontSize={10}
                  fontWeight={700}
                  fill="#0f172a"
                >
                  {formatInr(total)}
                </text>
                <text
                  x={x + barWidth / 2}
                  y={chartHeight + 15}
                  textAnchor="middle"
                  fontSize={9.5}
                  fill="#94a3b8"
                >
                  {d.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
