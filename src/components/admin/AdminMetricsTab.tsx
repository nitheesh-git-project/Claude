"use client";

import { useMemo, useState } from "react";
import {
  type MetricsAppointment,
  type Person,
  type PeriodBucket,
  filterByDimension,
  filterBySlotRange,
  buildBuckets,
  revenueByBucketFor,
  bookingsByBucketFor,
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

type Category = { id: string; title: string };

function formatInr(paise: number) {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

function toDateInputValue(d: Date) {
  return d.toISOString().slice(0, 10);
}

function daysAgo(n: number) {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
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
  if (buckets.length === 0 || values.every((v) => v === 0)) {
    return <p className="text-xs text-slate-500 py-8 text-center">No data in this range.</p>;
  }

  const barWidth = 28;
  const gap = 20;
  const chartHeight = 130;
  const labelSpace = 22;
  const max = Math.max(...values, 1);
  const svgWidth = buckets.length * (barWidth + gap) + gap;

  return (
    <div className="overflow-x-auto">
      <svg width={svgWidth} height={chartHeight + labelSpace} role="img" aria-label="Trend chart">
        <line x1={0} y1={chartHeight} x2={svgWidth} y2={chartHeight} stroke="#e2e8f0" strokeWidth={1} />
        {buckets.map((b, i) => {
          const value = values[i];
          const h = (value / max) * (chartHeight - 20);
          const x = gap + i * (barWidth + gap);
          const y = chartHeight - h;
          return (
            <g key={b.label + i}>
              <title>
                {b.label}: {formatValue(value)}
              </title>
              {h > 0 && <rect x={x} y={y} width={barWidth} height={h} fill={CHART_COLOR} rx={4} />}
              <text x={x + barWidth / 2} y={y - 6} textAnchor="middle" fontSize={10} fontWeight={700} fill="#0f172a">
                {value > 0 ? formatValue(value) : ""}
              </text>
              <text x={x + barWidth / 2} y={chartHeight + 15} textAnchor="middle" fontSize={9.5} fill="#94a3b8">
                {b.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export default function AdminMetricsTab({
  appointments,
  therapists,
  categories,
}: {
  appointments: MetricsAppointment[];
  therapists: Person[];
  categories: Category[];
}) {
  const [fromDate, setFromDate] = useState(() => toDateInputValue(daysAgo(90)));
  const [toDate, setToDate] = useState(() => toDateInputValue(new Date()));
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [therapistFilter, setTherapistFilter] = useState<string>("all");

  function setQuickRange(days: number | null) {
    setToDate(toDateInputValue(new Date()));
    setFromDate(days === null ? "2000-01-01" : toDateInputValue(daysAgo(days)));
  }

  const fromMs = useMemo(() => new Date(fromDate + "T00:00:00").getTime(), [fromDate]);
  // Inclusive of the whole "to" day.
  const toMs = useMemo(() => new Date(toDate + "T00:00:00").getTime() + 86_400_000, [toDate]);

  const dimFiltered = useMemo(
    () => filterByDimension(appointments, categoryFilter, therapistFilter),
    [appointments, categoryFilter, therapistFilter]
  );

  const inRangeBySlot = useMemo(
    () => filterBySlotRange(dimFiltered, fromMs, toMs),
    [dimFiltered, fromMs, toMs]
  );

  const buckets = useMemo(() => buildBuckets(fromMs, toMs), [fromMs, toMs]);

  const revenueByBucket = useMemo(
    () => revenueByBucketFor(dimFiltered, fromMs, toMs, buckets),
    [dimFiltered, buckets, fromMs, toMs]
  );

  const bookingsByBucket = useMemo(
    () => bookingsByBucketFor(dimFiltered, fromMs, toMs, buckets),
    [dimFiltered, buckets, fromMs, toMs]
  );

  const totalRevenuePaise = revenueByBucket.reduce((s, v) => s + v, 0) * 100;
  const totalBookings = bookingsByBucket.reduce((s, v) => s + v, 0);

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
