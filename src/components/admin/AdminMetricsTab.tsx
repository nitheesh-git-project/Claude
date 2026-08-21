"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { EmptyState } from "@/components/dashboard/SurfaceCard";
import {
  type MetricsAppointment,
  type MetricsPackagePurchase,
  type Person,
  type PeriodBucket,
  filterByDimension,
  filterBySlotRange,
  buildBuckets,
  bookingsByBucketFor,
  moneyByBucketFor,
  packageRevenueInRange,
  computeNoShowRate,
  computeCancellationRate,
  computeRepeatBookingRate,
  computeTherapistUtilization,
} from "@/lib/adminMetrics";
import { computeTherapistPayoutSummary } from "@/lib/therapistPayouts";
import Modal from "@/components/admin/Modal";
import TherapistPayoutButton from "@/components/admin/TherapistPayoutButton";
import { istDateKey } from "@/lib/formatSlotRange";
import { toCsv } from "@/lib/csvExport";
import DownloadCsvButton from "@/components/admin/DownloadCsvButton";
import StatStrip from "@/components/dashboard/StatStrip";

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

// Pinned to Asia/Kolkata (not d.toISOString()'s UTC date), the same
// istDateKey helper AdminCalendarTab/AdminRosterTab use for their own
// "today" -- the business timezone is IST throughout this dashboard, so a
// UTC calendar date here would default the "To" range to yesterday (and
// silently shift the Quick Range buttons by a day) for the ~5.5 hours
// after midnight IST but before midnight UTC.
function toDateInputValue(d: Date) {
  return istDateKey(d.toISOString());
}

// Pinned to a fixed timeZone (not left to the runtime's local zone) —
// this component is always mounted server-side first, so an unpinned zone
// can render a different date string on the server (SSR) vs the admin's
// browser (hydration), the same hydration-mismatch class of bug already
// fixed elsewhere in this codebase (e.g. AdminCalendarTab, AdminRosterTab).
function formatShortDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
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
    return (
      <EmptyState
        icon="fa-chart-column"
        title="No data in this range"
        body="Widen the date range or clear a filter — nothing was delivered in the window you picked."
      />
    );
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
    return (
      <EmptyState
        icon="fa-chart-column"
        title="No data in this range"
        body="Widen the date range or clear a filter — nothing was delivered in the window you picked."
      />
    );
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
  packagePurchases,
  therapists,
  categories,
  patients,
  therapistSharePercent,
  therapistHomeVisitSharePercent,
  patientHospitalSharePercent,
  hospitalReferredPatientIds,
  nowMs,
  view,
}: {
  appointments: MetricsAppointment[];
  // Cash collected on package purchases -- see packageRevenueInRange's own
  // comment for why this is shown separately from the appointment-based
  // Revenue (range) stat rather than merged into it.
  packagePurchases: MetricsPackagePurchase[];
  therapists: Person[];
  categories: Category[];
  patients: Person[];
  // therapistId -> revenue-share %, only present where an admin has set one.
  therapistSharePercent: Record<string, number>;
  // therapistId -> home-visit revenue-share %, for therapists who have a
  // separate rate for visits. Without it a home visit's cut is computed at
  // the online rate, which quietly misstates both the payout and the
  // clinic's share.
  therapistHomeVisitSharePercent: Record<string, number>;
  // patientId -> the referring hospital's revenue-share %, only present for
  // patients referred by a hospital that has one set.
  patientHospitalSharePercent: Record<string, number>;
  // patientId -> true for every hospital-referred patient, regardless of
  // whether that hospital's share % is set -- lets moneyByBucketFor tell
  // "not hospital-referred" (0% hospital cut is correct) apart from
  // "hospital-referred but unconfigured" (unknowable, must be excluded).
  hospitalReferredPatientIds: Record<string, true>;
  // Passed down from the server render rather than read via Date.now() in
  // here -- this component is always mounted (just CSS-hidden) as part of
  // the initial admin dashboard HTML, so seeding this useState from a fresh
  // client-side Date.now() at hydration time can disagree with whatever the
  // server used a moment earlier, and React's hydration diff has no way to
  // reconcile two different dates -- it just throws the whole subtree away
  // and re-renders client-side. Taking the same timestamp as a prop makes
  // the initial value identical on both passes.
  nowMs: number;
  // Which half of this tab to render. The maths is identical either way and
  // is deliberately computed once: "Summary" answers *how much money*
  // (totals, trends, the revenue split) and "Performance" answers *how well
  // it went* (per-therapist and per-patient ledgers, utilization, no-show
  // and cancellation rates). They were one endless scroll before, which is
  // why nobody could find either.
  //
  // Each view keeps its own filter state because they mount as separate
  // screens -- an admin narrowing the Performance view to one therapist is
  // asking a different question from whatever range Summary is showing.
  view: "summary" | "performance";
}) {
  const [fromDate, setFromDate] = useState(() => toDateInputValue(daysAgo(90, nowMs)));
  const [toDate, setToDate] = useState(() => toDateInputValue(new Date(nowMs)));
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [therapistFilter, setTherapistFilter] = useState<string>("all");
  const [patientFilter, setPatientFilter] = useState<string>("all");
  const [selectedTherapistId, setSelectedTherapistId] = useState<string | null>(null);
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);

  // The earliest session there is, so "All Time" means the clinic's actual
  // history rather than a fixed epoch. It used to jump to 2000-01-01, which
  // built ~320 monthly buckets and squeezed every chart on the screen into a
  // few pixels at the right-hand edge -- the one range most likely to be
  // clicked was the one that rendered nothing readable.
  const earliestSlotDate = useMemo(() => {
    let earliest: number | null = null;
    for (const a of appointments) {
      if (!a.slot_time) continue;
      const ms = new Date(a.slot_time).getTime();
      if (Number.isNaN(ms)) continue;
      if (earliest === null || ms < earliest) earliest = ms;
    }
    return earliest === null ? null : toDateInputValue(new Date(earliest));
  }, [appointments]);

  function setQuickRange(days: number | null) {
    // A click handler only ever runs client-side, so a fresh timestamp here
    // carries none of the SSR/hydration risk the initial useState values
    // above are guarding against.
    const now = nowTimestamp();
    setToDate(toDateInputValue(new Date(now)));
    setFromDate(
      days === null
        ? earliestSlotDate ?? toDateInputValue(daysAgo(365, now))
        : toDateInputValue(daysAgo(days, now))
    );
  }

  // Parsed with an explicit +05:30 (IST) offset, not local time —
  // "YYYY-MM-DDT00:00:00" without a zone suffix parses as the *runtime's*
  // local time, which differs between the server (SSR) and the admin's
  // browser (hydration), shifting these bucket boundaries by the timezone
  // offset between them. Pinning to IST specifically (not just any fixed
  // zone like UTC) matters too: the business and every other date display
  // on this dashboard are IST, so a UTC "midnight" boundary here would
  // silently exclude/include up to 5.5 hours of sessions at each edge of
  // the range from what an admin picking "Aug 1" actually means.
  const fromMs = useMemo(() => new Date(fromDate + "T00:00:00+05:30").getTime(), [fromDate]);
  // Inclusive of the whole "to" day.
  const toMs = useMemo(() => new Date(toDate + "T00:00:00+05:30").getTime() + 86_400_000, [toDate]);

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

  const bookingsByBucket = useMemo(
    () => bookingsByBucketFor(inRangeBySlot, buckets),
    [inRangeBySlot, buckets]
  );

  const money = useMemo(
    () =>
      moneyByBucketFor(
        inRangeBySlot,
        buckets,
        therapistSharePercent,
        patientHospitalSharePercent,
        hospitalReferredPatientIds,
        therapistHomeVisitSharePercent
      ),
    [
      inRangeBySlot,
      buckets,
      therapistSharePercent,
      patientHospitalSharePercent,
      hospitalReferredPatientIds,
      therapistHomeVisitSharePercent,
    ]
  );

  const totalBookings = bookingsByBucket.reduce((s: number, v: number) => s + v, 0);

  const packageRevenuePaise = useMemo(
    () => packageRevenueInRange(packagePurchases, categoryFilter, fromMs, toMs),
    [packagePurchases, categoryFilter, fromMs, toMs]
  );

  // Every headline figure comes out of the single moneyByBucketFor pass, so
  // the strip, the tiles and the breakdown chart cannot disagree.
  const sum = (values: number[]) => values.reduce((s, v) => s + v, 0);
  const totalGrossRevenuePaise = sum(money.grossRevenuePaise);
  const totalRefundedPaise = sum(money.refundedPaise);
  const totalNetRevenuePaise = sum(money.netRevenuePaise);
  const totalSplittableNetPaise = sum(money.splittableNetPaise);
  const totalTherapistCutPaise = sum(money.therapistCutPaise);
  const totalHospitalCutPaise = sum(money.hospitalCutPaise);
  const totalClinicSharePaise = sum(money.clinicSharePaise);
  // Share of the money it is measured against -- a bare rupee figure says
  // nothing about whether the split is healthy.
  const clinicSharePercent =
    totalSplittableNetPaise > 0
      ? (totalClinicSharePaise / totalSplittableNetPaise) * 100
      : null;

  const todayForFilename = toDateInputValue(new Date());

  // Therapist Ledger — scoped to the same date range as everything else on
  // this tab (a session counts here if its slot_time falls in range,
  // regardless of when it was actually settled). Rows with zero activity
  // in range are dropped so a 30-day view doesn't list every therapist
  // who's ever existed at ₹0.
  const rangeTherapistLedger = useMemo(() => {
    return therapists
      .map((t) => {
        const own = inRangeBySlot.filter((a) => a.therapist_id === t.id);
        const summary = computeTherapistPayoutSummary(
          t.id,
          therapistSharePercent[t.id] ?? null,
          own,
          nowMs,
          therapistHomeVisitSharePercent[t.id] ?? null
        );
        return { id: t.id, name: t.full_name ?? "Unknown", summary };
      })
      .filter((row) => row.summary.completedCount > 0)
      .sort((a, b) => b.summary.owedPaise - a.summary.owedPaise);
  }, [therapists, inRangeBySlot, therapistSharePercent, therapistHomeVisitSharePercent, nowMs]);

  const therapistLedgerCsv = useMemo(
    () =>
      toCsv(rangeTherapistLedger, [
        { header: "Therapist", value: (r) => r.name },
        { header: "Sessions", value: (r) => r.summary.completedCount },
        { header: "Unsettled in range (INR)", value: (r) => r.summary.owedPaise / 100 },
        { header: "Settled in range (INR)", value: (r) => r.summary.paidOutPaise / 100 },
      ]),
    [rangeTherapistLedger]
  );

  const totalPaidToTherapistsPaise = rangeTherapistLedger.reduce(
    (s, r) => s + r.summary.paidOutPaise,
    0
  );

  // The real, unfiltered owed balance per therapist — deliberately computed
  // over the FULL `appointments` array, not inRangeBySlot. settle-therapist-
  // payout always settles a therapist's entire outstanding balance
  // server-side (there's no date-scoped settlement); if the Pay button in
  // the ledger modal below were fed the date-filtered owed amount instead,
  // an admin could see "Pending: ₹X" for the selected range, click Pay, and
  // have the server actually settle a larger all-time amount — the modal
  // would have shown one number and charged another. Keeping this separate
  // means the button here always tells the truth about what it's about to do.
  const allTimeOwedByTherapist = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of therapists) {
      const own = appointments.filter((a) => a.therapist_id === t.id);
      const summary = computeTherapistPayoutSummary(
        t.id,
        therapistSharePercent[t.id] ?? null,
        own,
        nowMs,
        therapistHomeVisitSharePercent[t.id] ?? null
      );
      map.set(t.id, summary.owedPaise);
    }
    return map;
  }, [therapists, appointments, therapistSharePercent, therapistHomeVisitSharePercent, nowMs]);

  // What settling everyone right now would actually transfer: all-time, and
  // net of cash therapists are already holding. The headline "owed" figure
  // on this screen has to be this number rather than a range-scoped one --
  // a debt does not stop existing because it fell outside the dates in view,
  // and the Pay button on the Payouts screen settles exactly this.
  const allTimeNetPayablePaise = useMemo(() => {
    let total = 0;
    for (const t of therapists) {
      const own = appointments.filter((a) => a.therapist_id === t.id);
      total += computeTherapistPayoutSummary(
        t.id,
        therapistSharePercent[t.id] ?? null,
        own,
        nowMs,
        therapistHomeVisitSharePercent[t.id] ?? null
      ).netOwedPaise;
    }
    return total;
  }, [therapists, appointments, therapistSharePercent, therapistHomeVisitSharePercent, nowMs]);

  // Patient Ledger — same date-range scoping, only counting sessions that
  // were actually paid for (an unpaid/requested booking isn't spend yet).
  const rangePatientLedger = useMemo(() => {
    return patients
      .map((p) => {
        const own = inRangeBySlot.filter((a) => a.patient_id === p.id && a.payment_status === "paid");
        const totalSpentPaise = own.reduce((s, a) => s + (a.amount_paid_paise ?? 0), 0);
        const lastActive = own.reduce<string | null>((latest, a) => {
          if (!a.paid_at) return latest;
          if (!latest || new Date(a.paid_at).getTime() > new Date(latest).getTime()) return a.paid_at;
          return latest;
        }, null);
        return { id: p.id, name: p.full_name ?? "Unknown", sessionCount: own.length, totalSpentPaise, lastActive };
      })
      .filter((row) => row.sessionCount > 0)
      .sort((a, b) => b.totalSpentPaise - a.totalSpentPaise);
  }, [patients, inRangeBySlot]);

  const patientLedgerCsv = useMemo(
    () =>
      toCsv(rangePatientLedger, [
        { header: "Patient Name", value: (r) => r.name },
        { header: "Sessions", value: (r) => r.sessionCount },
        { header: "Total Spent (INR)", value: (r) => r.totalSpentPaise / 100 },
        { header: "Last Active", value: (r) => r.lastActive ?? "" },
      ]),
    [rangePatientLedger]
  );

  const selectedTherapistRow = rangeTherapistLedger.find((r) => r.id === selectedTherapistId) ?? null;
  const selectedTherapistSessions = useMemo(() => {
    if (!selectedTherapistId) return [];
    const patientNameById = new Map(patients.map((p) => [p.id, p.full_name ?? "Unknown"]));
    return inRangeBySlot
      .filter(
        (a) =>
          a.therapist_id === selectedTherapistId && a.status === "completed" && a.payment_status === "paid"
      )
      .map((a) => {
        const share = therapistSharePercent[selectedTherapistId] ?? null;
        const paidPaise = a.amount_paid_paise ?? 0;
        const isSettled = !!a.therapist_payout_paid_at;
        const owedPaise = isSettled
          ? a.therapist_payout_amount_paise ?? 0
          : share !== null
          ? Math.round((paidPaise * share) / 100)
          : 0;
        return {
          id: a.id,
          date: a.slot_time,
          patientName: patientNameById.get(a.patient_id) ?? "Unknown",
          paidPaise,
          owedPaise,
          isSettled,
        };
      })
      .sort((a, b) => new Date(b.date ?? 0).getTime() - new Date(a.date ?? 0).getTime());
  }, [selectedTherapistId, inRangeBySlot, patients, therapistSharePercent]);

  const selectedPatientRow = rangePatientLedger.find((r) => r.id === selectedPatientId) ?? null;
  const selectedPatientTransactions = useMemo(() => {
    if (!selectedPatientId) return [];
    const therapistNameById = new Map(therapists.map((t) => [t.id, t.full_name ?? "Unknown"]));
    return inRangeBySlot
      .filter((a) => a.patient_id === selectedPatientId && a.payment_status === "paid" && a.paid_at)
      .map((a) => ({
        id: a.id,
        date: a.paid_at as string,
        transactionId: a.razorpay_payment_id,
        therapistName: a.therapist_id ? therapistNameById.get(a.therapist_id) ?? "Unknown" : "Unassigned",
        amountPaise: a.amount_paid_paise ?? 0,
      }))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [selectedPatientId, inRangeBySlot, therapists]);

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
        <h2 className="font-display font-bold text-lg text-slate-800 mb-4">Filters</h2>
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
          {/* Wraps rather than overflowing: seven quick-range buttons in a
              nowrap row pushed the whole page 70px wider than a 360px phone
              viewport, which scrolls the body sideways instead of scrolling
              the row. */}
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { label: "Today", days: 0 },
              { label: "7 Days", days: 7 },
              { label: "15 Days", days: 15 },
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

      {view === "summary" && (
      <div>
        {/* The four figures an admin scans first, in the same strip every
            other dashboard opens with. Two flows and two balances: what the
            range earned and what it left the clinic, then what is owed and
            what has gone out. */}
        <div className="mb-5">
          <StatStrip
            cells={[
              {
                label: "Net revenue",
                value: formatInr(totalNetRevenuePaise),
                note:
                  totalRefundedPaise > 0
                    ? `${formatInr(totalGrossRevenuePaise)} charged, ${formatInr(totalRefundedPaise)} refunded`
                    : `${formatInr(totalGrossRevenuePaise)} charged, nothing refunded`,
                accent: "bg-teal-500",
              },
              {
                label: "Clinic share",
                value: formatInr(totalClinicSharePaise),
                note:
                  clinicSharePercent === null
                    ? "After therapist and partner shares"
                    : `${clinicSharePercent.toFixed(1)}% of what the clinic kept`,
                accent: "bg-emerald-500",
              },
              {
                label: "Owed to therapists",
                value: formatInr(allTimeNetPayablePaise),
                note:
                  allTimeNetPayablePaise > 0
                    ? "Balance right now, not just this range"
                    : "Everyone is settled up",
                accent: allTimeNetPayablePaise > 0 ? "bg-amber-500" : "bg-emerald-500",
                valueClass: allTimeNetPayablePaise > 0 ? "text-amber-600" : "text-slate-800",
              },
              {
                label: "Paid to therapists",
                value: formatInr(totalPaidToTherapistsPaise),
                note: "Settled for sessions in this range",
                accent: "bg-blue-500",
              },
            ]}
          />
        </div>

        <h2 className="font-display font-bold text-lg text-slate-800 mb-1">Where the money went</h2>
        <p className="text-[11px] text-slate-400 mb-3">
          Every figure below is for sessions scheduled in the selected range. Each row subtracts
          from the one above it, so the four add up: net revenue, less the therapists&apos; share,
          less any partner hospital&apos;s share, leaves the clinic&apos;s share.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">
              <i className="fa-solid fa-sack-dollar text-teal-600"></i> Net revenue
            </p>
            <p className="text-2xl font-bold text-slate-900 mt-2">
              {formatInr(totalNetRevenuePaise)}
            </p>
            <p className="text-[11px] text-slate-400 mt-1">
              {formatInr(totalGrossRevenuePaise)} charged
              {totalRefundedPaise > 0 && <> · {formatInr(totalRefundedPaise)} refunded</>}
            </p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">
              <i className="fa-solid fa-user-doctor text-indigo-600"></i> Therapists&apos; share
            </p>
            <p className="text-2xl font-bold mt-2" style={{ color: THERAPIST_CUT_COLOR }}>
              {totalTherapistCutPaise > 0 ? `−${formatInr(totalTherapistCutPaise)}` : formatInr(0)}
            </p>
            <p className="text-[11px] text-slate-400 mt-1">
              Earned on delivered sessions, travel included
            </p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">
              <i className="fa-solid fa-hospital text-amber-600"></i> Partners&apos; share
            </p>
            <p className="text-2xl font-bold mt-2" style={{ color: HOSPITAL_CUT_COLOR }}>
              {totalHospitalCutPaise > 0 ? `−${formatInr(totalHospitalCutPaise)}` : formatInr(0)}
            </p>
            <p className="text-[11px] text-slate-400 mt-1">
              {totalHospitalCutPaise > 0
                ? "Referral commission on what was kept"
                : "No hospital-referred sessions in range"}
            </p>
          </div>
          <div className="bg-white rounded-2xl border border-teal-200 bg-teal-50/40 shadow-sm p-5">
            <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">
              <i className="fa-solid fa-chart-line text-teal-600"></i> Clinic share
            </p>
            <p className="text-2xl font-bold mt-2" style={{ color: PROFIT_COLOR }}>
              {formatInr(totalClinicSharePaise)}
            </p>
            <p className="text-[11px] text-slate-400 mt-1">
              {clinicSharePercent === null
                ? "Before running costs"
                : `${clinicSharePercent.toFixed(1)}% of net revenue · before running costs`}
            </p>
          </div>
        </div>

        {/* Named, not hidden. An admin who sees the split not adding up to
            net revenue needs to know exactly which sessions are missing and
            why -- guessing a share would be worse than saying so. */}
        {money.excludedCount > 0 && (
          <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
            <strong>{money.excludedCount}</strong> paid session
            {money.excludedCount === 1 ? "" : "s"} worth{" "}
            <strong>{formatInr(money.excludedRevenuePaise)}</strong> are counted in net revenue but
            left out of the three shares — the therapist has no revenue share set, or the patient
            came from a partner whose share is not configured. Set those percentages in People and
            the figures complete themselves.
          </p>
        )}

        {/* Owed and Paid live in the strip at the top of this screen and are
            deliberately not repeated here: this block is the subtraction
            chain that ends at the clinic's share, and a balance is not part
            of that chain. */}
      </div>
      )}

      {view === "performance" && (
      <>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
            <h2 className="font-display font-bold text-lg text-slate-800">Therapist earnings</h2>
            <DownloadCsvButton
              filename={`therapist-ledger-${todayForFilename}.csv`}
              csv={therapistLedgerCsv}
              disabled={rangeTherapistLedger.length === 0}
            />
          </div>
          <p className="text-[11px] text-slate-400 mb-4">
            Click a row for the full session-by-session breakdown and to record a payout.
          </p>
          {rangeTherapistLedger.length === 0 ? (
            <EmptyState
              icon="fa-user-doctor"
              title="No therapist activity in this range"
              body="Sessions appear here once they are delivered inside the selected window."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="text-left text-slate-500 border-b border-slate-200">
                    <th className="py-2 pr-3 font-semibold">Therapist</th>
                    <th className="py-2 pr-3 font-semibold">Sessions</th>
                    <th
                      className="py-2 pr-3 font-semibold"
                      title="Earned on sessions scheduled inside the selected range and not yet settled. Deliberately narrower than 'Owed to therapists' on the Summary screen, which is the whole all-time balance."
                    >
                      Unsettled in range (₹)
                    </th>
                    <th className="py-2 pr-3 font-semibold">Settled in range (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  {rangeTherapistLedger.map((row) => (
                    <tr
                      key={row.id}
                      onClick={() => setSelectedTherapistId(row.id)}
                      className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer transition"
                    >
                      <td className="py-2 pr-3 font-bold text-slate-900 whitespace-nowrap">{row.name}</td>
                      <td className="py-2 pr-3 text-slate-600">{row.summary.completedCount}</td>
                      <td className="py-2 pr-3">
                        {row.summary.owedPaise > 0 ? (
                          <span className="font-semibold text-red-600">
                            {formatInr(row.summary.owedPaise)}
                          </span>
                        ) : (
                          <span className="text-slate-400">₹0</span>
                        )}
                      </td>
                      <td className="py-2 pr-3 font-semibold text-teal-700">
                        {formatInr(row.summary.paidOutPaise)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
            <h2 className="font-display font-bold text-lg text-slate-800">Patient spend</h2>
            <DownloadCsvButton
              filename={`patient-ledger-${todayForFilename}.csv`}
              csv={patientLedgerCsv}
              disabled={rangePatientLedger.length === 0}
            />
          </div>
          <p className="text-[11px] text-slate-400 mb-4">
            Click a row to see this patient&apos;s paid transactions in range.
          </p>
          {rangePatientLedger.length === 0 ? (
            <EmptyState
              icon="fa-user-injured"
              title="No patient activity in this range"
              body="Bookings and payments appear here once they fall inside the selected window."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="text-left text-slate-500 border-b border-slate-200">
                    <th className="py-2 pr-3 font-semibold">Patient Name</th>
                    <th className="py-2 pr-3 font-semibold">Sessions</th>
                    <th className="py-2 pr-3 font-semibold">Total Spent (₹)</th>
                    <th className="py-2 pr-3 font-semibold">Last Active</th>
                  </tr>
                </thead>
                <tbody>
                  {rangePatientLedger.map((row) => (
                    <tr
                      key={row.id}
                      onClick={() => setSelectedPatientId(row.id)}
                      className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer transition"
                    >
                      <td className="py-2 pr-3 font-bold text-slate-900 whitespace-nowrap">{row.name}</td>
                      <td className="py-2 pr-3 text-slate-600">{row.sessionCount}</td>
                      <td className="py-2 pr-3 font-semibold text-teal-700">
                        {formatInr(row.totalSpentPaise)}
                      </td>
                      <td className="py-2 pr-3 text-slate-500 whitespace-nowrap">
                        {formatShortDate(row.lastActive)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {selectedTherapistRow && (
        <Modal
          title={`Therapist earnings: ${selectedTherapistRow.name}`}
          subtitle={
            selectedTherapistRow.summary.sharePercent !== null
              ? `${selectedTherapistRow.summary.sharePercent}% Commission Split`
              : "Revenue share not set"
          }
          onClose={() => setSelectedTherapistId(null)}
        >
          <div className="space-y-5">
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <p className="text-xs font-bold text-slate-700">Record Payout</p>
                  <p className="text-[11px] text-slate-400 mt-0.5 max-w-sm">
                    Settles this therapist&apos;s full outstanding balance across every unpaid
                    session, not just the range shown below.
                  </p>
                </div>
                <TherapistPayoutButton
                  therapistId={selectedTherapistRow.id}
                  owedPaise={allTimeOwedByTherapist.get(selectedTherapistRow.id) ?? 0}
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                <p className="text-xs font-bold text-slate-700">Patient Sessions Breakdown (this range)</p>
                <span className="text-[11px] font-semibold text-red-600 bg-red-50 px-2 py-1 rounded-full">
                  Pending in range: {formatInr(selectedTherapistRow.summary.owedPaise)}
                </span>
              </div>
              {selectedTherapistSessions.length === 0 ? (
                <p className="text-xs text-slate-500 py-4 text-center">
                  No completed, paid sessions in this range.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="text-left text-slate-500 border-b border-slate-200">
                        <th className="py-2 pr-3 font-semibold">Session Date</th>
                        <th className="py-2 pr-3 font-semibold">Patient Name</th>
                        <th className="py-2 pr-3 font-semibold">Patient Paid</th>
                        <th className="py-2 pr-3 font-semibold">Owed to Therapist</th>
                        <th className="py-2 pr-3 font-semibold">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedTherapistSessions.map((s) => (
                        <tr key={s.id} className="border-b border-slate-100">
                          <td className="py-2 pr-3 text-slate-600 whitespace-nowrap">
                            {formatShortDate(s.date)}
                          </td>
                          <td className="py-2 pr-3 font-semibold text-slate-800">{s.patientName}</td>
                          <td className="py-2 pr-3 text-slate-600">{formatInr(s.paidPaise)}</td>
                          <td className="py-2 pr-3 font-semibold text-slate-800">
                            {formatInr(s.owedPaise)}
                          </td>
                          <td className="py-2 pr-3">
                            <span
                              className={`font-semibold px-2 py-1 rounded-full ${
                                s.isSettled ? "text-teal-700 bg-teal-50" : "text-amber-700 bg-amber-50"
                              }`}
                            >
                              {s.isSettled ? "Paid" : "Pending"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </Modal>
      )}

      {selectedPatientRow && (
        <Modal
          title={`Patient spend: ${selectedPatientRow.name}`}
          subtitle={`Spent in this range: ${formatInr(selectedPatientRow.totalSpentPaise)}`}
          onClose={() => setSelectedPatientId(null)}
        >
          {selectedPatientTransactions.length === 0 ? (
            <EmptyState
              icon="fa-indian-rupee-sign"
              title="No paid transactions in this range"
              body="Only settled payments count here — pending or failed attempts are on Transactions."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="text-left text-slate-500 border-b border-slate-200">
                    <th className="py-2 pr-3 font-semibold">Payment Date</th>
                    <th className="py-2 pr-3 font-semibold">Transaction ID</th>
                    <th className="py-2 pr-3 font-semibold">Assigned Therapist</th>
                    <th className="py-2 pr-3 font-semibold">Amount</th>
                    <th className="py-2 pr-3 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedPatientTransactions.map((t) => (
                    <tr key={t.id} className="border-b border-slate-100">
                      <td className="py-2 pr-3 text-slate-600 whitespace-nowrap">
                        {formatShortDate(t.date)}
                      </td>
                      <td className="py-2 pr-3 text-slate-500 font-mono text-[11px]">
                        {t.transactionId ?? "—"}
                      </td>
                      <td className="py-2 pr-3 font-semibold text-slate-800">{t.therapistName}</td>
                      <td className="py-2 pr-3 font-semibold text-slate-900">
                        {formatInr(t.amountPaise)}
                      </td>
                      <td className="py-2 pr-3">
                        <span className="font-semibold px-2 py-1 rounded-full text-teal-700 bg-teal-50">
                          Successful
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Modal>
      )}
      </>
      )}

      {/* Volume and cash collected read as "how big was this period" and
          belong with the money summary; the three rates below them read as
          "how well did it go" and belong with performance. Same row of
          tiles, split by which question it answers. */}
      {view === "summary" && (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {/* Was a third figure called "Recognised revenue", which was the
            same paid-sessions-in-range total the Net revenue card above
            already shows under a different name -- the exact collision this
            screen's glossary existed to apologise for. Refunds is the number
            that was actually missing from the row. */}
        <div className="bg-slate-50 rounded-xl p-3 text-center">
          <p className="text-[11px] text-slate-500">Refunded</p>
          <p className="text-base font-bold text-slate-900">{formatInr(totalRefundedPaise)}</p>
        </div>
        <div className="bg-slate-50 rounded-xl p-3 text-center" title="Package purchases paid for in this range -- money in the bank up front. The revenue figures above recognise its value gradually instead, one session at a time as they get scheduled, so the two are deliberately different numbers.">
          <p className="text-[11px] text-slate-500">Package cash collected</p>
          <p className="text-base font-bold text-slate-900">{formatInr(packageRevenuePaise)}</p>
        </div>
        <div className="bg-slate-50 rounded-xl p-3 text-center">
          <p className="text-[11px] text-slate-500">Bookings</p>
          <p className="text-base font-bold text-slate-900">{totalBookings}</p>
        </div>
      </div>
      )}

      {view === "performance" && (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
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
      )}

      {view === "summary" && (
      <>
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h2 className="font-display font-bold text-lg text-slate-800 mb-1">Net revenue trend</h2>
        <p className="text-[11px] text-slate-400 mb-3">
          After refunds, by the week or month the session was scheduled in.
        </p>
        <TrendBarChart buckets={buckets} values={money.netRevenuePaise} formatValue={formatInr} />
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h2 className="font-display font-bold text-lg text-slate-800 mb-4">Booking Volume Trend</h2>
        <TrendBarChart buckets={buckets} values={bookingsByBucket} formatValue={(v) => String(v)} />
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h2 className="font-display font-bold text-lg text-slate-800 mb-1">Revenue Breakdown</h2>
        <p className="text-[11px] text-slate-400 mb-4">
          The same four figures as the cards above, period by period: net revenue, the therapists&apos;
          and partners&apos; shares taken out of it, and the clinic&apos;s share left over. The totals
          are the cards&apos; totals — this is where they came from.
        </p>

        <TrendLineChart
          buckets={buckets}
          series={[
            { label: "Net revenue", color: REVENUE_COLOR, values: money.netRevenuePaise },
            { label: "Therapists' share", color: THERAPIST_CUT_COLOR, values: money.therapistCutPaise },
            { label: "Partners' share", color: HOSPITAL_CUT_COLOR, values: money.hospitalCutPaise },
            { label: "Clinic share", color: PROFIT_COLOR, values: money.clinicSharePaise },
          ]}
          formatValue={(v) => formatInr(v)}
        />

        {money.excludedCount > 0 && (
          <p className="text-[11px] text-slate-400 mt-3">
            {money.excludedCount} paid session{money.excludedCount > 1 ? "s" : ""} totalling{" "}
            {formatInr(money.excludedRevenuePaise)} excluded from this breakdown — therapist not
            assigned, their revenue share isn&apos;t set yet, or (for a hospital-referred patient)
            the referring hospital&apos;s revenue share isn&apos;t set yet, so no split is
            knowable. Still counted in net revenue above — only the split leaves them out.
          </p>
        )}
      </div>
      </>
      )}

      {view === "performance" && (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h2 className="font-display font-bold text-lg text-slate-800 mb-1">Therapist Utilization</h2>
        <p className="text-[11px] text-slate-400 mb-4">
          Completed sessions per therapist in range — a session-count comparison, not true capacity
          utilization (this platform doesn&apos;t track therapist working hours/availability).
        </p>
        {therapistUtilization.length === 0 ? (
          <EmptyState
            icon="fa-calendar-check"
            title="No completed sessions in this range"
            body="A session counts once a therapist marks it complete."
          />
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
      )}
    </div>
  );
}
