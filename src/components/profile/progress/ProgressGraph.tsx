"use client";

import { subjectWords, type ProfileSubject } from "@/lib/childVoice";
import { IMAGE_ESTIMATE_LABEL } from "@/lib/angleMeasure";
import { useMemo, useState } from "react";
import { useRouter } from "@/lib/useRouter";
import { formatClinicDate, formatClinicDateShort } from "@/lib/formatDateTime";
import { outcomeMeasure, type ProfileKind } from "@/lib/outcomeMeasures";
import { goalForSeries, type MeasureSeries, type MilestoneTarget } from "@/lib/outcomeSeries";
import {
  buildChartGeometry,
  chartSummaryText,
  formatMeasureValue,
  labelAnchor,
  labelIndices,
  labelPlacement,
  unitSuffix,
} from "@/lib/progressChart";
import {
  boundsFor,
  directionHint,
  riskLineFor,
  scaleLine,
  seriesDelta,
  seriesName,
  seriesTabLabel,
  type Voice,
} from "@/lib/progressView";

/** At most this many dates under the line, so they cannot collide on a
 *  360 px screen (the viewBox is 320 wide). */
const MAX_DATE_LABELS = 4;
/** With this many dots or fewer every dot carries its value. */
const LABEL_EVERY_DOT_UP_TO = 6;

const TONE_TEXT = {
  good: "text-emerald-700",
  bad: "text-red-700",
  neutral: "text-slate-600",
} as const;

/**
 * "Am I getting better?" for any measure: a tab per line on the record, and
 * under it one chart with a dot per review, the goal as a green band, a
 * dotted risk or norm line where the registry has one, and the first and
 * latest readings in words.
 *
 * Everything drawn comes from `buildChartGeometry` (src/lib/progressChart.ts);
 * this file loops over the result. The measure picker is a row of real
 * buttons (`aria-pressed`) that wraps rather than scrolls, so no tab sits off
 * the edge of a phone. Goal and risk are named in a legend under the chart
 * instead of on it, where a long label would collide with the data. The chart
 * is `role="img"` with a one-sentence label and the same readings in a
 * visually hidden table, because a screen reader cannot hover a dot.
 *
 * Three states before a chart, each its own sentence: the read failed ("we
 * couldn't check" is not "nothing recorded"), nothing recorded yet, and a
 * line with a single reading (a trend needs two reviews).
 */
export default function ProgressGraph({
  series,
  milestones = [],
  profileKind,
  voice,
  subject = "self",
  loadFailed = false,
  initialSeriesKey,
  riskOverrides,
}: {
  /** Every line on the record (buildMeasureSeries). */
  series: MeasureSeries[];
  /** The plan, for the goal of each line. */
  milestones?: MilestoneTarget[];
  profileKind: ProfileKind;
  voice: Voice;
  /** Who the patient-voice sentences are about (childVoice.ts): "child" speaks to a parent ("your child's ..."). */
  subject?: ProfileSubject;
  /** The measurements could not be read: said apart from "none yet". */
  loadFailed?: boolean;
  initialSeriesKey?: string;
  /** A risk line for a measure whose line depends on the person (the chair
   *  stand's age-and-sex norm), by measure key; replaces the registry's. */
  riskOverrides?: Record<string, { value: number; label: string }>;
}) {
  const router = useRouter();
  const clinician = voice === "clinician";
  const w = subjectWords(subject, voice);
  const [pickedKey, setPickedKey] = useState<string | null>(initialSeriesKey ?? null);

  const selected = useMemo(() => series.find((s) => s.key === pickedKey) ?? series[0] ?? null, [series, pickedKey]);

  const view = useMemo(() => {
    if (!selected || selected.points.length < 2) return null;
    const m = outcomeMeasure(selected.measureKey);
    const goal = goalForSeries(selected, milestones);
    const risk = riskOverrides?.[selected.measureKey] ?? riskLineFor(selected.measureKey, profileKind);
    const geometry = buildChartGeometry({
      values: selected.points.map((p) => p.value),
      better: selected.better,
      goal: goal?.value ?? null,
      risk,
      bounds: boundsFor(m),
    });
    return { geometry, goal, risk, delta: seriesDelta(selected, profileKind) };
  }, [selected, milestones, profileKind, riskOverrides]);

  if (loadFailed) {
    return (
      <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <p className="font-semibold">
          {clinician ? "We couldn't load the measurements just now." : w("We couldn't load your progress just now.")}
        </p>
        <p className="mt-0.5 text-xs">
          Nothing is lost - this is a problem reading the record, not an empty one.{" "}
          <button
            type="button"
            onClick={() => router.refresh()}
            className="inline-flex min-h-[44px] items-center rounded px-1 font-semibold underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-700"
          >
            Try again
          </button>
        </p>
      </div>
    );
  }

  if (!selected) {
    return (
      <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50/60 px-4 py-6 text-sm text-slate-600">
        {clinician
          ? "No measurements are recorded yet. The graph appears once a measure has been recorded at two reviews."
          : w("Your progress graph appears once your physiotherapist has measured you at two reviews. Each dot will be one review.")}
      </p>
    );
  }

  const name = seriesName(selected, voice);
  const unit = selected.unit;
  const reading = (v: number) => {
    const shown = formatMeasureValue(v, selected.decimals);
    return `${shown}${unitSuffix(unit, shown)}`;
  };
  const first = selected.points[0];
  const now = selected.points[selected.points.length - 1];
  const scale = scaleLine(selected.measureKey);
  const hint = directionHint(selected.better);
  const videoReadings = selected.points.filter((p) => p.setting === "video").length;
  const imageReadings = selected.points.filter((p) => p.estimatedFromImage).length;

  const summary = chartSummaryText({
    label: name,
    unit,
    decimals: selected.decimals,
    points: selected.points.map((p) => ({ value: p.value, dateLabel: formatClinicDateShort(p.measuredAt) })),
    goal: view?.goal?.value ?? null,
    better: selected.better,
  });

  return (
    <div>
      {series.length > 1 && (
        <div role="group" aria-label={clinician ? "Choose a measure" : "Choose what to look at"} className="flex flex-wrap gap-2">
          {series.map((s) => {
            const on = s.key === selected.key;
            return (
              <button
                key={s.key}
                type="button"
                aria-pressed={on}
                onClick={() => setPickedKey(s.key)}
                className={`min-h-[44px] rounded-full border px-3.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 ${
                  on
                    ? "border-teal-700 bg-teal-700 text-white"
                    : "border-slate-300 bg-white text-slate-700 hover:border-teal-500 hover:text-teal-800"
                }`}
              >
                {seriesTabLabel(s, voice, series)}
                {!s.joinPoints && " (state not recorded)"}
                <span className="sr-only"> ({seriesName(s, voice)})</span>
              </button>
            );
          })}
        </div>
      )}

      <h3 className="mt-4 font-display text-base font-bold text-slate-900 [overflow-wrap:anywhere]">{name}</h3>
      {!selected.joinPoints && (
        <p className="mt-1 text-xs text-slate-700" data-testid="state-not-recorded">
          <span className="mr-1.5 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 font-semibold text-amber-900">State not recorded</span>
          {clinician
            ? "These were taken without noting ON or OFF, so each dot stands alone: no line is drawn and no change is claimed."
            : "These were taken without noting whether your medicine was working, so each dot stands alone and no change is shown between them."}
        </p>
      )}

      {!view ? (
        <div className="mt-2 rounded-xl border border-dashed border-slate-300 bg-slate-50/60 px-4 py-6 text-sm text-slate-600">
          <p>
            {clinician
              ? "This line appears once it has been recorded at two reviews."
              : "This line appears once it has been recorded twice."}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            So far: {reading(first.value)} on {formatClinicDate(first.measuredAt)}.
          </p>
        </div>
      ) : (
        <>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <p className="font-display text-3xl font-bold leading-none text-slate-900">
              {now.estimatedFromImage && <span aria-hidden>~</span>}
              {reading(now.value)}
            </p>
            {now.estimatedFromImage && <p className="text-xs font-semibold text-amber-900">{IMAGE_ESTIMATE_LABEL}</p>}
            <p className="text-xs text-slate-600">
              {clinician ? "latest" : w("at your latest review")}
              {view.delta && (
                <>
                  {" · "}
                  <span className={`font-semibold ${TONE_TEXT[view.delta.tone]}`}>{view.delta.text}</span> since the first
                </>
              )}
            </p>
          </div>

          <svg
            viewBox={`0 0 ${view.geometry.width} ${view.geometry.height}`}
            className="mt-2 block h-auto w-full"
            role="img"
            aria-label={summary}
          >
            {view.geometry.goal?.band && (
              <rect
                x={view.geometry.plot.left}
                width={view.geometry.plot.right - view.geometry.plot.left}
                y={view.geometry.goal.band.y}
                height={view.geometry.goal.band.height}
                fill="var(--chart-good-soft)"
                fillOpacity={0.14}
              />
            )}

            {view.geometry.ticks.map((tick) => (
              <g key={tick.value}>
                <line
                  x1={view.geometry.plot.left}
                  x2={view.geometry.plot.right}
                  y1={tick.y}
                  y2={tick.y}
                  stroke="var(--chart-grid)"
                  strokeWidth={1}
                />
                <text x={view.geometry.plot.left - 6} y={tick.y + 3} textAnchor="end" fontSize={9} fill="var(--chart-axis)">
                  {formatMeasureValue(tick.value, selected.decimals)}
                </text>
              </g>
            ))}

            {view.geometry.goal && (
              <line
                x1={view.geometry.plot.left}
                x2={view.geometry.plot.right}
                y1={view.geometry.goal.y}
                y2={view.geometry.goal.y}
                stroke="var(--chart-good)"
                strokeWidth={1.5}
              />
            )}
            {view.geometry.risk?.y != null && (
              <line
                x1={view.geometry.plot.left}
                x2={view.geometry.plot.right}
                y1={view.geometry.risk.y}
                y2={view.geometry.risk.y}
                stroke="var(--chart-amber)"
                strokeWidth={1.5}
                strokeDasharray="2 4"
                strokeLinecap="round"
              />
            )}

            {/* Readings that may not be compared (a Parkinson's test whose
                medication state was not recorded - pointsAreComparable) are
                dots with no line between them, and no shaded area. */}
            {selected.joinPoints && view.geometry.areaPath && (
              <path d={view.geometry.areaPath} fill="var(--chart-brand-soft)" fillOpacity={0.08} />
            )}
            {selected.joinPoints && (
              <path
                d={view.geometry.linePath}
                fill="none"
                stroke="var(--chart-brand-soft)"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

            {view.geometry.points.map((p, i, all) => {
              const last = i === all.length - 1;
              const showValue = last || i === 0 || all.length <= LABEL_EVERY_DOT_UP_TO;
              const below = labelPlacement(all, i) === "below";
              return (
                <g key={selected.points[i].measurementId}>
                  {selected.points[i].estimatedFromImage ? (
                    // A photo estimate is a hollow ring, dashed: it reads as "about", not as a measured point.
                    <circle cx={p.x} cy={p.y} r={last ? 5 : 4} fill="#ffffff" stroke="var(--chart-brand-soft)" strokeWidth={2} strokeDasharray="2 1.5" />
                  ) : (
                    <circle cx={p.x} cy={p.y} r={last ? 5 : 4} fill="var(--chart-brand-soft)" stroke="#ffffff" strokeWidth={2} />
                  )}
                  {showValue && (
                    <text
                      x={p.x}
                      y={below ? p.y + 16 : p.y - 9}
                      textAnchor={labelAnchor(i, all.length)}
                      fontSize={9}
                      fontWeight={last ? 700 : 600}
                      fill={last ? "var(--chart-brand)" : "var(--chart-ink)"}
                    >
                      {formatMeasureValue(p.value, selected.decimals)}
                    </text>
                  )}
                </g>
              );
            })}

            {labelIndices(view.geometry.points.length, MAX_DATE_LABELS).map((i) => (
              <text
                key={i}
                x={view.geometry.points[i].x}
                y={view.geometry.height - 8}
                textAnchor={labelAnchor(i, view.geometry.points.length)}
                fontSize={9}
                fill="var(--chart-axis)"
              >
                {formatClinicDateShort(selected.points[i].measuredAt)}
              </text>
            ))}
          </svg>

          {/* A table cannot be clipped by its own sr-only box (its cells size it),
              so the box is a div around it - otherwise it widens the page. */}
          <div className="sr-only">
          <table>
            <caption>{`${name}: one reading at each review`}</caption>
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Reading</th>
                <th scope="col">Where</th>
              </tr>
            </thead>
            <tbody>
              {selected.points.map((p) => (
                <tr key={p.measurementId}>
                  <th scope="row">{formatClinicDate(p.measuredAt)}</th>
                  <td>{reading(p.value)}</td>
                  <td>
                    {p.setting === "video" ? "Over video" : p.setting === "in_person" ? "In person" : "Not recorded"}
                    {p.estimatedFromImage ? ` (${IMAGE_ESTIMATE_LABEL.toLowerCase()})` : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>

          <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
            <li className="flex items-center gap-1.5">
              <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full bg-teal-600" />
              Each dot is one review
            </li>
            {view.geometry.goal && (
              <li className="flex items-center gap-1.5">
                <span aria-hidden className="inline-block h-2.5 w-4 rounded-sm border border-emerald-700 bg-emerald-100" />
                {view.geometry.goal.band
                  ? `Goal: ${reading(view.geometry.goal.value)} ${selected.better === "lower" ? "or lower" : "or higher"}`
                  : `Goal: ${reading(view.geometry.goal.value)}`}
              </li>
            )}
            {view.geometry.risk && (
              <li className="flex items-center gap-1.5">
                <span aria-hidden className="inline-block w-4 border-t-2 border-dotted border-amber-700" />
                {view.geometry.risk.y !== null
                  ? `${view.geometry.risk.label} (${reading(view.geometry.risk.value)})`
                  : `${view.geometry.risk.label} (${reading(view.geometry.risk.value)}) is off this chart, ${
                      view.geometry.risk.offscreen === "above" ? "well above" : "well below"
                    } these readings`}
              </li>
            )}
          </ul>

          <dl className="mt-3 grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3 text-sm">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-600">First</dt>
              <dd className="font-display text-lg font-bold text-slate-900">{reading(first.value)}</dd>
              <dd className="text-xs text-slate-600">{formatClinicDate(first.measuredAt)}</dd>
              {first.estimatedFromImage && <dd className="text-xs font-semibold text-amber-900">{IMAGE_ESTIMATE_LABEL}</dd>}
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-600">Now</dt>
              <dd className="font-display text-lg font-bold text-slate-900">{reading(now.value)}</dd>
              <dd className="text-xs text-slate-600">{formatClinicDate(now.measuredAt)}</dd>
              {now.estimatedFromImage && <dd className="text-xs font-semibold text-amber-900">{IMAGE_ESTIMATE_LABEL}</dd>}
            </div>
          </dl>
        </>
      )}

      <div className="mt-3 space-y-1 text-xs text-slate-600">
        {hint && <p>{hint}</p>}
        {scale && (
          <p>
            <span className="font-semibold text-slate-700">Measured as:</span> {scale}
          </p>
        )}
        {imageReadings > 0 && (
          <p data-testid="image-estimate-note">
            {imageReadings === 1 ? "One reading is" : `${imageReadings} readings are`} {IMAGE_ESTIMATE_LABEL.toLowerCase()}, shown as hollow dots. A photo is good to about 5 to 10 degrees and is not a goniometer reading.
          </p>
        )}
        {videoReadings > 0 && (
          <p>
            {videoReadings === 1 ? "One reading was" : `${videoReadings} readings were`} taken over video.
          </p>
        )}
      </div>
    </div>
  );
}
