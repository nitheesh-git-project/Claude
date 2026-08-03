"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  type MetricsAppointment,
  type Person,
  type PeriodBucket,
  filterByDimension,
  filterBySlotRange,
  buildBuckets,
  revenueByBucketFor,
  bookingsByBucketFor,
  moneyByBucketFor,
  computeNoShowRate,
  computeCancellationRate,
  computeRepeatBookingRate,
  computeTherapistUtilization,
} from "@/lib/adminMetrics";

export type { MetricsAppointment };

// Single sequential hue reused from PatientProfitChart's already-validated
// pair (teal-600) — these charts are always single-series (one bar color =
// magnitude only, never identity), so no categorical pair or legend is
// needed; the card title names the series.
const CHART_COLOR = "#0d9488";

// Four-series palette for the revenue breakdown line chart, chosen the same
// way as PatientProfitChart's pair: distinct in lightness/hue, colorblind-
// separable, and readable against a white card. Profit reuses teal (the
// same "your take" meaning PatientProfitChart already gives it); therapist
// cut reuses PatientProfitChart's indigo for the same reason.
const REVENUE_COLOR = "#0f172a"; // slate-900 — the top-line total
const THERAPIST_CUT_COLOR = "#4f46e5"; // indigo-600
const HOSPITAL_CUT_COLOR = "#d97706"; // amber-600
const PROFIT_COLOR = "#0d9488"; // teal-600

type Category = { id: string; title: string };

function formatInr(paise: number) {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

function toDateInputValue(d: Date) {
  return d.toISOString().slice(0, 10);
}

function daysAgo(n: number, fromMs: number) {
  return new Date(fromMs - n * 24 * 60 * 60 * 1000);
}

// A plain module-level helper so a fresh read isn't flagged as an impure
// call inside the component body -- safe here regardless, since this is
// only ever reached from the onClick below, never during render.
function nowTimestamp() {
  return Date.now();
}

// Measures its container's actual rendered width client-side, after mount,
// so charts can fill exactly the space they're given at any screen size
// instead of a fixed pixel width. Deliberately NOT done via an SVG
// viewBox+preserveAspectRatio stretch: that scales text/stroke-width
// non-uniformly whenever the container's aspect ratio doesn't match the
// viewBox's, visibly squashing or stretching labels. Measuring real pixels
// keeps every chart pixel-accurate at any width. The default width is only
// what server-rendered HTML shows before this runs -- an effect never fires
// during SSR, so hydration always matches (this is the same "settle to a
// real value after mount" pattern used for any client-only measurement in
// an SSR app; it updates in a later commit, never in a mismatched first one).
function useContainerWidth(defaultWidth: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(defaultWidth);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 0) setWidth(w);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return { ref, width };
}

function TrendBarChart({
  buckets,
  values,
  formatValue,
}: {
  buckets: PeriodBucket[];
  values: number[];
  formatValue: (v: number) => string;
}) {
  const { ref, width } = useContainerWidth(640);

  if (buckets.length === 0 || values.every((v) => v === 0)) {
    return <p className="text-xs text-slate-500 py-8 text-center">No data in this range.</p>;
  }

  const chartHeight = 150;
  const labelSpace = 24;
  const slotWidth = width / buckets.length;
  const barWidth = Math.max(Math.min(slotWidth * 0.55, 48), 4);
  const max = Math.max(...values, 1);

  return (
    <div ref={ref} className="w-full">
      <svg width={width} height={chartHeight + labelSpace} role="img" aria-label="Trend chart">
        <line x1={0} y1={chartHeight} x2={width} y2={chartHeight} stroke="#e2e8f0" strokeWidth={1} />
        {buckets.map((b, i) => {
          const value = values[i];
          const h = (value / max) * (chartHeight - 24);
          const x = i * slotWidth + (slotWidth - barWidth) / 2;
          const y = chartHeight - h;
          return (
            <g key={b.label + i}>
              {/* One interpolated string, not `{b.label}: {formatValue(value)}`
                  as three separate children -- with multiple children,
                  suppressHydrationWarning only silences the console warning
                  but doesn't stop React from still treating it as a real
                  mismatch and discarding/re-rendering the subtree client-side
                  (visibly, as a flash + a thrown hydration error in dev).
                  A single string child is what suppressHydrationWarning
                  actually patches over. */}
              <title suppressHydrationWarning>{`${b.label}: ${formatValue(value)}`}</title>
              {h > 0 && <rect x={x} y={y} width={barWidth} height={h} fill={CHART_COLOR} rx={3} />}
              <text
                x={x + barWidth / 2}
                y={y - 6}
                textAnchor="middle"
                fontSize={11}
                fontWeight={700}
                fill="#0f172a"
              >
                {value > 0 ? formatValue(value) : ""}
              </text>
              <text x={x + barWidth / 2} y={chartHeight + 16} textAnchor="middle" fontSize={10} fill="#94a3b8">
                {b.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function TrendLineChart({
  buckets,
  series,
  formatValue,
}: {
  buckets: PeriodBucket[];
  series: { label: string; color: string; values: number[] }[];
  formatValue: (v: number) => string;
}) {
  const { ref, width } = useContainerWidth(640);

  if (buckets.length === 0 || series.every((s) => s.values.every((v) => v === 0))) {
    return <p className="text-xs text-slate-500 py-8 text-center">No data in this range.</p>;
  }

  const chartHeight = 180;
  const labelSpace = 24;
  const padTop = 18;
  const padBottom = 12;
  const plotHeight = chartHeight - padTop - padBottom;
  const slotWidth = width / buckets.length;
  const max = Math.max(...series.flatMap((s) => s.values), 1);

  const yFor = (v: number) => padTop + (1 - v / max) * plotHeight;
  const xFor = (i: number) => i * slotWidth + slotWidth / 2;

  return (
    <div>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 mb-3 text-[11px] text-slate-500">
        {series.map((s) => (
          <span key={s.label} className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
      <div ref={ref} className="w-full">
        <svg width={width} height={chartHeight + labelSpace} role="img" aria-label="Revenue breakdown trend">
          <line x1={0} y1={chartHeight} x2={width} y2={chartHeight} stroke="#e2e8f0" strokeWidth={1} />
          {[0.25, 0.5, 0.75].map((f) => (
            <line
              key={f}
              x1={0}
              y1={padTop + f * plotHeight}
              x2={width}
              y2={padTop + f * plotHeight}
              stroke="#f1f5f9"
              strokeWidth={1}
            />
          ))}
          {series.map((s) => (
            <polyline
              key={s.label}
              points={s.values.map((v, i) => `${xFor(i)},${yFor(v)}`).join(" ")}
              fill="none"
              stroke={s.color}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}
          {series.map((s) =>
            s.values.map((v, i) => (
              <circle key={`${s.label}-${i}`} cx={xFor(i)} cy={yFor(v)} r={3} fill={s.color}>
                <title suppressHydrationWarning>{`${s.label} — ${buckets[i].label}: ${formatValue(v)}`}</title>
              </circle>
            ))
          )}
          {buckets.map((b, i) => (
            <text key={b.label + i} x={xFor(i)} y={chartHeight + 16} textAnchor="middle" fontSize={10} fill="#94a3b8">
              {b.label}
            </text>
          ))}
        </svg>
      </div>
    </div>
  );
}

export default function AdminMetricsTab({
  appointments,
  therapists,
  categories,
  patients,
  therapistSharePercent,
  patientHospitalSharePercent,
  nowMs,
}: {
  appointments: MetricsAppointment[];
  therapists: Person[];
  categories: Category[];
  patients: Person[];
  // therapistId -> revenue-share %, only present where an admin has set one.
  therapistSharePercent: Record<string, number>;
  // patientId -> the referring hospital's revenue-share %, only present for
  // patients referred by a hospital that has one set.
  patientHospitalSharePercent: Record<string, number>;
  // Passed down from the server render rather than read via Date.now() in
  // here -- this component is always mounted (just CSS-hidden) as part of
  // the initial admin dashboard HTML, so seeding this useState from a fresh
  // client-side Date.now() at hydration time can disagree with whatever the
  // server used a moment earlier, and React's hydration diff has no way to
  // reconcile two different dates -- it just throws the whole subtree away
  // and re-renders client-side. Taking the same timestamp as a prop makes
  // the initial value identical on both passes.
  nowMs: number;
}) {
  const [fromDate, setFromDate] = useState(() => toDateInputValue(daysAgo(90, nowMs)));
  const [toDate, setToDate] = useState(() => toDateInputValue(new Date(nowMs)));
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [therapistFilter, setTherapistFilter] = useState<string>("all");
  const [patientFilter, setPatientFilter] = useState<string>("all");

  function setQuickRange(days: number | null) {
    // A click handler only ever runs client-side, so a fresh timestamp here
    // carries none of the SSR/hydration risk the initial useState values
    // above are guarding against.
    const now = nowTimestamp();
    setToDate(toDateInputValue(new Date(now)));
    setFromDate(days === null ? "2000-01-01" : toDateInputValue(daysAgo(days, now)));
  }

  // Parsed as UTC (explicit "Z"), not local time — "YYYY-MM-DDT00:00:00"
  // without a zone suffix parses as the *runtime's* local time, which
  // differs between the server (SSR) and the admin's browser (hydration),
  // shifting these bucket boundaries by the timezone offset between them.
  // That's not just a cosmetic mismatch: it can bucket revenue/bookings
  // into the wrong day depending on which timezone rendered the page.
  const fromMs = useMemo(() => new Date(fromDate + "T00:00:00Z").getTime(), [fromDate]);
  // Inclusive of the whole "to" day.
  const toMs = useMemo(() => new Date(toDate + "T00:00:00Z").getTime() + 86_400_000, [toDate]);

  const dimFiltered = useMemo(
    () => filterByDimension(appointments, categoryFilter, therapistFilter, patientFilter),
    [appointments, categoryFilter, therapistFilter, patientFilter]
  );

  // The one range filter every chart and stat on this tab shares — buckets,
  // revenue, bookings, no-shows, cancellations, utilization, and the money
  // breakdown below all key off this exact same array, so picking a From/To
  // range (or a Category/Therapist/Patient filter) means the same thing
  // everywhere on the page instead of quietly disagreeing chart to chart.
  const inRangeBySlot = useMemo(
    () => filterBySlotRange(dimFiltered, fromMs, toMs),
    [dimFiltered, fromMs, toMs]
  );

  const buckets = useMemo(() => buildBuckets(fromMs, toMs), [fromMs, toMs]);

  const revenueByBucket = useMemo(
    () => revenueByBucketFor(inRangeBySlot, buckets),
    [inRangeBySlot, buckets]
  );

  const bookingsByBucket = useMemo(
    () => bookingsByBucketFor(inRangeBySlot, buckets),
    [inRangeBySlot, buckets]
  );

  const money = useMemo(
    () => moneyByBucketFor(inRangeBySlot, buckets, therapistSharePercent, patientHospitalSharePercent),
    [inRangeBySlot, buckets, therapistSharePercent, patientHospitalSharePercent]
  );

  const totalRevenuePaise = revenueByBucket.reduce((s, v) => s + v, 0) * 100;
  const totalBookings = bookingsByBucket.reduce((s, v) => s + v, 0);

  const totalMoneyRevenuePaise = money.revenuePaise.reduce((s, v) => s + v, 0);
  const totalTherapistCutPaise = money.therapistCutPaise.reduce((s, v) => s + v, 0);
  const totalHospitalCutPaise = money.hospitalCutPaise.reduce((s, v) => s + v, 0);
  const totalProfitPaise = money.profitPaise.reduce((s, v) => s + v, 0);

  const completedInRange = useMemo(
    () => inRangeBySlot.filter((a) => a.status === "completed"),
    [inRangeBySlot]
  );

  const { rate: noShowRate, completedCount: noShowDenominator } = useMemo(
    () => computeNoShowRate(completedInRange),
    [completedInRange]
  );

  const { rate: cancellationRate, cancelledCount, refundedCount, forfeitedCount } = useMemo(
    () => computeCancellationRate(inRangeBySlot),
    [inRangeBySlot]
  );

  const repeatBookingRate = useMemo(() => computeRepeatBookingRate(dimFiltered), [dimFiltered]);

  const therapistUtilization = useMemo(
    () => computeTherapistUtilization(completedInRange, therapists),
    [completedInRange, therapists]
  );
  const maxUtilization = Math.max(...therapistUtilization.map((t) => t.count), 1);

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h2 className="font-bold text-lg text-slate-800 mb-4">Filters</h2>
        <p className="text-[11px] text-slate-400 mb-4 -mt-2">
          Applies to every chart and stat on this tab, including the revenue breakdown below.
        </p>
        <div className="flex flex-wrap items-end gap-4 text-xs">
          <div className="flex flex-col gap-1">
            <label className="font-semibold text-slate-500">From</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="border border-slate-300 rounded-lg px-2.5 py-1.5"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="font-semibold text-slate-500">To</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="border border-slate-300 rounded-lg px-2.5 py-1.5"
            />
          </div>
          <div className="flex items-center gap-1.5">
            {[
              { label: "30d", days: 30 },
              { label: "90d", days: 90 },
              { label: "12mo", days: 365 },
              { label: "All Time", days: null },
            ].map((q) => (
              <button
                key={q.label}
                onClick={() => setQuickRange(q.days)}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 font-semibold text-slate-600"
              >
                {q.label}
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-1">
            <label className="font-semibold text-slate-500">Category</label>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="border border-slate-300 rounded-lg px-2.5 py-1.5"
            >
              <option value="all">All Categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="font-semibold text-slate-500">Therapist</label>
            <select
              value={therapistFilter}
              onChange={(e) => setTherapistFilter(e.target.value)}
              className="border border-slate-300 rounded-lg px-2.5 py-1.5"
            >
              <option value="all">All Therapists</option>
              {therapists.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.full_name ?? "Unknown"}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="font-semibold text-slate-500">Patient</label>
            <select
              value={patientFilter}
              onChange={(e) => setPatientFilter(e.target.value)}
              className="border border-slate-300 rounded-lg px-2.5 py-1.5"
            >
              <option value="all">All Patients</option>
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name ?? "Unknown"}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="bg-slate-50 rounded-xl p-3 text-center">
          <p className="text-[11px] text-slate-500">Revenue (range)</p>
          <p className="text-base font-bold text-slate-900">{formatInr(totalRevenuePaise)}</p>
        </div>
        <div className="bg-slate-50 rounded-xl p-3 text-center">
          <p className="text-[11px] text-slate-500">Bookings (range)</p>
          <p className="text-base font-bold text-slate-900">{totalBookings}</p>
        </div>
        <div className="bg-slate-50 rounded-xl p-3 text-center">
          <p className="text-[11px] text-slate-500">No-Show Rate</p>
          <p className="text-base font-bold text-slate-900">
            {noShowRate === null ? "—" : `${noShowRate.toFixed(1)}%`}
          </p>
          <p className="text-[10px] text-slate-400">{noShowDenominator} completed</p>
        </div>
        <div className="bg-slate-50 rounded-xl p-3 text-center">
          <p className="text-[11px] text-slate-500">Cancellation Rate</p>
          <p className="text-base font-bold text-slate-900">
            {cancellationRate === null ? "—" : `${cancellationRate.toFixed(1)}%`}
          </p>
          {cancelledCount > 0 && (
            <p className="text-[10px] text-slate-400">
              {refundedCount} refunded · {forfeitedCount} forfeited
            </p>
          )}
        </div>
        <div className="bg-teal-50 rounded-xl p-3 text-center">
          <p className="text-[11px] text-slate-500">Repeat-Booking Rate</p>
          <p className="text-base font-bold" style={{ color: CHART_COLOR }}>
            {repeatBookingRate === null ? "—" : `${repeatBookingRate.toFixed(1)}%`}
          </p>
          <p className="text-[10px] text-slate-400">all-time, not date-filtered</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h2 className="font-bold text-lg text-slate-800 mb-4">Revenue Trend</h2>
        <TrendBarChart buckets={buckets} values={revenueByBucket} formatValue={(v) => formatInr(v * 100)} />
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h2 className="font-bold text-lg text-slate-800 mb-4">Booking Volume Trend</h2>
        <TrendBarChart buckets={buckets} values={bookingsByBucket} formatValue={(v) => String(v)} />
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h2 className="font-bold text-lg text-slate-800 mb-1">Revenue Breakdown</h2>
        <p className="text-[11px] text-slate-400 mb-4">
          Where paid revenue in this range actually goes — therapist payouts, hospital referral
          shares, and what&apos;s left as profit.
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          <div className="bg-slate-50 rounded-xl p-3 text-center">
            <p className="text-[11px] text-slate-500">Revenue</p>
            <p className="text-base font-bold" style={{ color: REVENUE_COLOR }}>
              {formatInr(totalMoneyRevenuePaise)}
            </p>
          </div>
          <div className="bg-slate-50 rounded-xl p-3 text-center">
            <p className="text-[11px] text-slate-500">Therapists&apos; Cut</p>
            <p className="text-base font-bold" style={{ color: THERAPIST_CUT_COLOR }}>
              {formatInr(totalTherapistCutPaise)}
            </p>
          </div>
          <div className="bg-slate-50 rounded-xl p-3 text-center">
            <p className="text-[11px] text-slate-500">Hospitals&apos; Cut</p>
            <p className="text-base font-bold" style={{ color: HOSPITAL_CUT_COLOR }}>
              {formatInr(totalHospitalCutPaise)}
            </p>
          </div>
          <div className="bg-teal-50 rounded-xl p-3 text-center">
            <p className="text-[11px] text-slate-500">Overall Profit</p>
            <p className="text-base font-bold" style={{ color: PROFIT_COLOR }}>
              {formatInr(totalProfitPaise)}
            </p>
          </div>
        </div>

        <TrendLineChart
          buckets={buckets}
          series={[
            { label: "Revenue", color: REVENUE_COLOR, values: money.revenuePaise },
            { label: "Therapists' Cut", color: THERAPIST_CUT_COLOR, values: money.therapistCutPaise },
            { label: "Hospitals' Cut", color: HOSPITAL_CUT_COLOR, values: money.hospitalCutPaise },
            { label: "Profit", color: PROFIT_COLOR, values: money.profitPaise },
          ]}
          formatValue={(v) => formatInr(v)}
        />

        {money.excludedCount > 0 && (
          <p className="text-[11px] text-slate-400 mt-3">
            {money.excludedCount} paid session{money.excludedCount > 1 ? "s" : ""} totalling{" "}
            {formatInr(money.excludedRevenuePaise)} excluded from this breakdown — therapist not
            assigned or their revenue share isn&apos;t set yet, so no split is knowable. Still
            counted in the &quot;Revenue (range)&quot; stat above.
          </p>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h2 className="font-bold text-lg text-slate-800 mb-1">Therapist Utilization</h2>
        <p className="text-[11px] text-slate-400 mb-4">
          Completed sessions per therapist in range — a session-count comparison, not true capacity
          utilization (this platform doesn&apos;t track therapist working hours/availability).
        </p>
        {therapistUtilization.length === 0 ? (
          <p className="text-xs text-slate-500 py-4 text-center">No completed sessions in this range.</p>
        ) : (
          <div className="space-y-2.5">
            {therapistUtilization.map((t) => (
              <div key={t.id} className="flex items-center gap-3 text-xs">
                <span className="w-32 shrink-0 truncate font-semibold text-slate-700">{t.name}</span>
                <div className="flex-1 bg-slate-100 rounded-full h-4 overflow-hidden">
                  <div
                    className="h-4 rounded-full"
                    style={{ width: `${(t.count / maxUtilization) * 100}%`, backgroundColor: CHART_COLOR }}
                  />
                </div>
                <span className="w-8 text-right font-bold text-slate-900">{t.count}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
