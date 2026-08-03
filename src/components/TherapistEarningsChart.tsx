// Single-series bar chart, hand-rolled SVG like PatientProfitChart (no
// charting library in this codebase) -- one bar per calendar day (IST)
// that has at least one earning in the currently-filtered rows. Bucketing
// stops at "by day"; a wide date range just scrolls horizontally rather
// than collapsing into weeks/months, the same tradeoff PatientProfitChart
// already accepts for many sessions.
const EARNINGS_COLOR = "#0f766e"; // teal-700, this app's own brand accent

function formatInr(paise: number) {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

export type EarningsDay = {
  key: string; // IST date key, YYYY-MM-DD
  label: string; // short display label, e.g. "1 Aug"
  earningsPaise: number;
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
  const maxPaise = Math.max(...days.map((d) => d.earningsPaise), 1);
  const svgWidth = days.length * (barWidth + gap) + gap;

  return (
    <div className="overflow-x-auto">
      <svg
        width={svgWidth}
        height={chartHeight + labelSpace}
        role="img"
        aria-label="Your earnings per day"
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
          const x = gap + i * (barWidth + gap);
          const barH = (d.earningsPaise / maxPaise) * (chartHeight - 20);
          const y = chartHeight - barH;
          return (
            <g key={d.key}>
              <title suppressHydrationWarning>{`${d.label}: ${formatInr(d.earningsPaise)}`}</title>
              {barH > 0 && (
                <rect x={x} y={y} width={barWidth} height={barH} fill={EARNINGS_COLOR} rx={4} />
              )}
              <text
                x={x + barWidth / 2}
                y={y - 6}
                textAnchor="middle"
                fontSize={10}
                fontWeight={700}
                fill="#0f172a"
              >
                {formatInr(d.earningsPaise)}
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
  );
}
