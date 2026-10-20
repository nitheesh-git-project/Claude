"use client";

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import OverlayPortal from "@/components/system/OverlayPortal";
import Spinner from "@/components/system/Spinner";
import ScaleSegmented from "@/components/profile/neuro/ScaleSegmented";
import { useDialogChrome } from "@/lib/useDialogChrome";
import { useRouter } from "@/lib/useRouter";
import { useToast } from "@/lib/toast";
import { debugNowHeaders } from "@/lib/debugNow";
import { formatClinicDate } from "@/lib/formatDateTime";
import {
  BERG_BAND_LABEL,
  BERG_BAND_MEANING,
  BERG_ITEMS,
  BERG_MAX,
  BILATERAL_SECTIONS,
  EXAM_SIDES,
  EXCLUSIVE_GAIT_AIDS,
  EXCLUSIVE_GAIT_PATTERNS,
  GAIT_AIDS,
  GAIT_PATTERNS,
  GAIT_SPEED_LABEL,
  NEURO_NOTES_MAX,
  NEURO_ROWS,
  NEURO_SCALES,
  TIMED_TEST_MAX_SECONDS,
  TIMED_TEST_MIN_SECONDS,
  TUG_FALL_RISK_SECONDS,
  asymmetries,
  bergRiskBand,
  bergTotalFromItems,
  emptyNeuroFindings,
  gaitSpeedBand,
  gaitSpeedFromTenMetre,
  markSectionNormal,
  validateNeuroFindings,
  type BilateralSectionKey,
  type ExamSide,
  type NeuroFindings,
  type ParsedNeuroAssessment,
  type SideValues,
} from "@/lib/neuroExam";

type NavKey = BilateralSectionKey | "balance" | "gait" | "notes";

const NAV: { key: NavKey; label: string }[] = [
  ...BILATERAL_SECTIONS.map((s) => ({ key: s.key as NavKey, label: s.key === "coordination" ? "Coord." : s.title })),
  { key: "balance", label: "Balance" },
  { key: "gait", label: "Gait" },
  { key: "notes", label: "Notes" },
];

const SIDE_SHORT: Record<ExamSide, string> = { left: "L", right: "R" };

/** A number box's text as seconds, or undefined when blank. NaN stays NaN
 *  so the validator can say what was wrong with it. */
function secondsFromText(text: string): number | undefined {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  return Number(trimmed);
}

/**
 * Recording one neurological examination, on a surface of its own -- the
 * same pattern as the Pain Map's `PainExamDialog`, sized for what this
 * chart is: forty-odd bilateral findings, balance and gait.
 *
 * Grouped and scannable rather than paced: a clinician fills this at every
 * reassessment and wants to see the whole chart. Three things keep it fast:
 *
 *   - **Segmented scales, never number boxes**, with "not tested" as the
 *     first segment, so "normal" and "not examined" are two taps apart and
 *     never confused (`ScaleSegmented`).
 *   - **"Mark the rest normal"** per section, which fills only what has not
 *     been scored -- the usual exam is a handful of abnormal findings in a
 *     sea of normal ones.
 *   - **Last time, in place.** Each row says what the previous exam found
 *     and each side's control marks it, because the reason these rows are
 *     append-only is to read a change.
 *
 * Left and right sit side by side from `md` and stack per side below it;
 * the section nav is a sticky strip on a phone and a rail from `lg`. The
 * whole thing is validated with the same `validateNeuroFindings` the route
 * runs, so a refusal is said here before the round trip, in the same words.
 */
export default function NeuroExamDialog({
  endpoint,
  patientId,
  patientName,
  previous,
  onClose,
}: {
  endpoint: string;
  patientId: string;
  patientName?: string;
  previous: ParsedNeuroAssessment | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const { show } = useToast();
  const [findings, setFindings] = useState<NeuroFindings>(emptyNeuroFindings);
  const [bergText, setBergText] = useState("");
  const [walkText, setWalkText] = useState("");
  const [tugText, setTugText] = useState("");
  const [showBergItems, setShowBergItems] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const [activeNav, setActiveNav] = useState<NavKey>("tone");
  const savingRef = useRef(false);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Partial<Record<NavKey, HTMLElement | null>>>({});
  const titleId = useId();
  const notesId = useId();
  const bergId = useId();
  const walkId = useId();
  const tugId = useId();

  const before = previous?.findings ?? null;

  // What is about to be sent, built once per render from the form state.
  const draft: NeuroFindings = useMemo(() => {
    const itemsTotal = bergTotalFromItems(findings.balance.bergItems);
    const typedBerg = bergText.trim() === "" ? undefined : Number(bergText);
    return {
      ...findings,
      balance: { ...findings.balance, bergTotal: itemsTotal ?? typedBerg },
      gait: {
        ...findings.gait,
        tenMetreWalkSeconds: secondsFromText(walkText),
        tugSeconds: secondsFromText(tugText),
      },
    };
  }, [findings, bergText, walkText, tugText]);

  const dirty =
    Object.keys(findings.bilateral).length > 0 ||
    Object.values(findings.balance).some((v) => v !== undefined) ||
    findings.gait.patterns.length > 0 ||
    findings.gait.aids.length > 0 ||
    !!findings.notes?.trim() ||
    !!bergText.trim() ||
    !!walkText.trim() ||
    !!tugText.trim();

  const asymmetric = useMemo(() => new Set(asymmetries(findings).map((a) => a.rowKey)), [findings]);
  const scoredCount = Object.values(findings.bilateral).reduce(
    (n, sides) => n + (sides.left ? 1 : 0) + (sides.right ? 1 : 0),
    0
  );

  function requestClose() {
    if (saving) return;
    if (dirty && !confirmingDiscard) {
      setConfirmingDiscard(true);
      return;
    }
    onClose();
  }

  const { panelRef, dialogProps } = useDialogChrome({ onClose: requestClose, labelledBy: titleId });

  function setSide(rowKey: string, side: ExamSide, value: string | undefined) {
    setConfirmingDiscard(false);
    setFindings((f) => {
      const current: SideValues = { ...(f.bilateral[rowKey] ?? {}) };
      if (value === undefined) delete current[side];
      else current[side] = value;
      const bilateral = { ...f.bilateral };
      if (current.left === undefined && current.right === undefined) delete bilateral[rowKey];
      else bilateral[rowKey] = current;
      return { ...f, bilateral };
    });
  }

  function clearSection(section: BilateralSectionKey) {
    setFindings((f) => {
      const bilateral = { ...f.bilateral };
      for (const row of NEURO_ROWS) if (row.section.key === section) delete bilateral[row.key];
      return { ...f, bilateral };
    });
  }

  function setBalance(field: "romberg" | "sitting" | "standing", value: string | undefined) {
    setConfirmingDiscard(false);
    setFindings((f) => ({ ...f, balance: { ...f.balance, [field]: value } }));
  }

  function setBergItem(key: string, value: string | undefined) {
    setFindings((f) => {
      const items = { ...(f.balance.bergItems ?? {}) };
      if (value === undefined) delete items[key];
      else items[key] = Number(value);
      return { ...f, balance: { ...f.balance, bergItems: Object.keys(items).length ? items : undefined } };
    });
  }

  function toggleChoice(field: "patterns" | "aids", key: string) {
    const exclusive = field === "patterns" ? EXCLUSIVE_GAIT_PATTERNS : EXCLUSIVE_GAIT_AIDS;
    setConfirmingDiscard(false);
    setFindings((f) => {
      const current = f.gait[field];
      let next: string[];
      if (current.includes(key)) next = current.filter((k) => k !== key);
      else if (exclusive.has(key)) next = [key];
      else next = [...current.filter((k) => !exclusive.has(k)), key];
      return { ...f, gait: { ...f.gait, [field]: next } };
    });
    // Somebody who cannot walk cannot be timed walking; the boxes clear
    // rather than holding numbers the route would refuse.
    if (field === "patterns" && key === "unable") {
      setWalkText("");
      setTugText("");
    }
  }

  function goTo(key: NavKey) {
    const el = sectionRefs.current[key];
    const scroller = scrollerRef.current;
    if (!el || !scroller) return;
    setActiveNav(key);
    scroller.scrollTo({ top: el.offsetTop - 8, behavior: "smooth" });
    // Focus the heading so a keyboard or screen-reader user lands where
    // the eye does.
    el.querySelector<HTMLElement>("h3")?.focus({ preventScroll: true });
  }

  // Scroll-spy: the nav follows the section in view.
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        let current: NavKey = NAV[0].key;
        for (const { key } of NAV) {
          const el = sectionRefs.current[key];
          if (el && el.offsetTop - scroller.scrollTop <= 96) current = key;
        }
        setActiveNav(current);
      });
    };
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      scroller.removeEventListener("scroll", onScroll);
    };
  }, []);

  async function save() {
    if (savingRef.current) return;
    setConfirmingDiscard(false);
    const checked = validateNeuroFindings(draft);
    if (!checked.ok) {
      setError(checked.error);
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        // The therapist route judges "a session with them has started" on
        // the debug bar's simulated clock, like the Pain Map dialog.
        headers: { "Content-Type": "application/json", ...debugNowHeaders() },
        body: JSON.stringify({ patientId, findings: checked.findings }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Could not save this examination. Please try again.");
        return;
      }
      show(`Neurological examination saved${patientName ? ` for ${patientName}` : ""}`);
      onClose();
      router.refresh();
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  const bergFromItems = bergTotalFromItems(findings.balance.bergItems);
  const bergShown = bergFromItems ?? (bergText.trim() === "" ? null : Number(bergText));
  const bergValid = bergShown !== null && Number.isInteger(bergShown) && bergShown >= 0 && bergShown <= BERG_MAX;
  const walkSeconds = secondsFromText(walkText);
  const walkValid =
    walkSeconds !== undefined && Number.isFinite(walkSeconds) && walkSeconds >= TIMED_TEST_MIN_SECONDS && walkSeconds <= TIMED_TEST_MAX_SECONDS;
  const tugSeconds = secondsFromText(tugText);
  const tugValid =
    tugSeconds !== undefined && Number.isFinite(tugSeconds) && tugSeconds >= TIMED_TEST_MIN_SECONDS && tugSeconds <= TIMED_TEST_MAX_SECONDS;
  const cannotWalk = findings.gait.patterns.includes("unable");

  const navCount = (key: NavKey): number => {
    if (key === "balance") {
      return (["romberg", "sitting", "standing"] as const).filter((k) => findings.balance[k]).length + (bergShown !== null ? 1 : 0);
    }
    if (key === "gait") {
      return (findings.gait.patterns.length ? 1 : 0) + (findings.gait.aids.length ? 1 : 0) + (walkText.trim() ? 1 : 0) + (tugText.trim() ? 1 : 0);
    }
    if (key === "notes") return findings.notes?.trim() ? 1 : 0;
    return NEURO_ROWS.filter((r) => r.section.key === key && findings.bilateral[r.key]).length;
  };

  const sectionHeading = (title: string, blurb: string, actions?: ReactNode) => (
    <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0">
        <h3 tabIndex={-1} className="font-display text-base font-bold text-slate-900 focus:outline-none">
          {title}
        </h3>
        <p className="text-xs text-slate-500">{blurb}</p>
      </div>
      {actions && <div className="flex flex-wrap gap-1.5">{actions}</div>}
    </div>
  );

  const smallButton =
    "rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-600 transition hover:border-teal-400 hover:text-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600";

  return (
    <OverlayPortal>
      <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-slate-900/40 backdrop-blur-sm sm:items-center sm:p-4">
        <div
          ref={panelRef}
          {...dialogProps}
          className="flex h-full w-full flex-col overflow-hidden bg-white shadow-xl sm:h-[94vh] sm:max-w-6xl sm:rounded-2xl"
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-4 py-3 sm:px-6 sm:py-4">
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wide text-violet-700">Neurological examination</p>
              <h2 id={titleId} className="font-display text-lg font-bold text-slate-900 [overflow-wrap:anywhere]">
                {patientName ? `Examining ${patientName}` : "Recording an examination"}
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                {previous
                  ? `Last examined ${formatClinicDate(previous.createdAt)} - each row shows what was found then, and a dot marks it on the scale.`
                  : "The first examination on record for this patient."}
              </p>
            </div>
            <button
              type="button"
              onClick={requestClose}
              aria-label="Close"
              className="shrink-0 rounded-lg p-1 text-slate-500 transition hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
            >
              <i aria-hidden className="fa-solid fa-xmark text-lg" />
            </button>
          </div>

          <div className="flex min-h-0 flex-1">
            {/* Rail from lg */}
            <nav aria-label="Examination sections" className="hidden w-48 shrink-0 border-r border-slate-100 p-3 lg:block">
              <ul className="space-y-0.5">
                {NAV.map(({ key }) => {
                  const count = navCount(key);
                  const label = key === "coordination" ? "Coordination" : NAV.find((n) => n.key === key)!.label;
                  return (
                    <li key={key}>
                      <button
                        type="button"
                        onClick={() => goTo(key)}
                        aria-current={activeNav === key ? "true" : undefined}
                        className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 ${
                          activeNav === key ? "bg-teal-50 text-teal-800" : "text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        {label}
                        {count > 0 && (
                          <span className="rounded-full bg-slate-100 px-1.5 text-[10px] font-bold text-slate-600">{count}</span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </nav>

            <div ref={scrollerRef} className="relative min-w-0 flex-1 overflow-y-auto">
              {/* Sticky strip below lg: equal tabs, never a sideways scroll. */}
              <nav aria-label="Examination sections" className="sticky top-0 z-10 border-b border-slate-100 bg-white/95 px-3 py-2 backdrop-blur lg:hidden">
                <ul className="grid grid-cols-4 gap-1 sm:grid-cols-8">
                  {NAV.map(({ key, label }) => (
                    <li key={key}>
                      <button
                        type="button"
                        onClick={() => goTo(key)}
                        aria-current={activeNav === key ? "true" : undefined}
                        className={`w-full truncate rounded-lg px-1.5 py-1.5 text-[11px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 ${
                          activeNav === key ? "bg-teal-700 text-white" : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {label}
                        {navCount(key) > 0 && <span className="ml-1 opacity-80">{navCount(key)}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              </nav>

              <div className="space-y-8 px-4 py-5 sm:px-6">
                <p className="rounded-xl bg-slate-50 px-3.5 py-2.5 text-xs text-slate-600">
                  Record what you examined and leave the rest - a dash means <strong>not tested</strong>, which is
                  kept apart from normal. Grades outside normal turn amber. Saving adds a new examination rather than
                  editing the last one, and the patient can read it on their Health Profile.
                </p>

                {BILATERAL_SECTIONS.map((section) => {
                  const scale = NEURO_SCALES[section.scale];
                  return (
                    <section
                      key={section.key}
                      ref={(el) => {
                        sectionRefs.current[section.key] = el;
                      }}
                      aria-label={section.title}
                      className="scroll-mt-16"
                    >
                      {sectionHeading(
                        section.title,
                        section.blurb,
                        <>
                          <button type="button" className={smallButton} onClick={() => setFindings((f) => ({ ...f, bilateral: markSectionNormal(f.bilateral, section.key) }))}>
                            Mark the rest normal
                          </button>
                          <button type="button" className={smallButton} onClick={() => clearSection(section.key)}>
                            Clear
                          </button>
                        </>
                      )}

                      {/* The legend: every grade's meaning, on screen while scoring. */}
                      <dl className="mb-3 grid gap-x-4 gap-y-1 rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2 text-[11px] text-slate-600 sm:grid-cols-2 xl:grid-cols-3">
                        <div className="sm:col-span-2 xl:col-span-3">
                          <dt className="font-bold text-slate-700">{scale.name}</dt>
                        </div>
                        {scale.options.map((o) => (
                          <div key={o.value} className="flex gap-1.5">
                            <dt className="w-8 shrink-0 font-bold text-slate-800">{o.short}</dt>
                            <dd>{o.meaning}</dd>
                          </div>
                        ))}
                        {section.key === "reflexes" && (
                          <div className="sm:col-span-2 xl:col-span-3">
                            <dd>
                              <span className="font-bold text-slate-800">Plantar:</span>{" "}
                              {NEURO_SCALES.plantar.options.map((o) => `${o.short} = ${o.meaning}`).join("; ")}
                            </dd>
                          </div>
                        )}
                      </dl>

                      {section.groups.map((group) => (
                        <div key={group.title} className="mb-4">
                          <div className="mb-1 hidden grid-cols-[minmax(9rem,13rem)_1fr_1fr] gap-3 px-1 md:grid">
                            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{group.title}</p>
                            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Left</p>
                            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Right</p>
                          </div>
                          <p className="mb-1 px-1 text-[11px] font-bold uppercase tracking-wide text-slate-500 md:hidden">{group.title}</p>
                          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                            {group.rows.map((row) => {
                              const resolved = NEURO_ROWS.find((r) => r.key === row.key)!;
                              const rowScale = NEURO_SCALES[resolved.scale];
                              const sides = findings.bilateral[row.key] ?? {};
                              const last = before?.bilateral[row.key];
                              return (
                                <li key={row.key} className="grid gap-2 px-3 py-2.5 md:grid-cols-[minmax(9rem,13rem)_1fr_1fr] md:items-center md:gap-3">
                                  <div className="min-w-0">
                                    <p className="text-sm font-semibold text-slate-800">
                                      {row.label}
                                      {row.detail && <span className="ml-1 text-xs font-normal text-slate-500">{row.detail}</span>}
                                      {asymmetric.has(row.key) && (
                                        <span className="ml-1.5 inline-block rounded-full bg-amber-100 px-1.5 py-px text-[10px] font-bold text-amber-800">
                                          L≠R
                                        </span>
                                      )}
                                    </p>
                                    {last && (last.left || last.right) && (
                                      <p className="text-[11px] text-violet-700">
                                        Last time: L {last.left ?? "–"} · R {last.right ?? "–"}
                                      </p>
                                    )}
                                  </div>
                                  {EXAM_SIDES.map((side) => (
                                    <div key={side} className="flex items-center gap-2">
                                      <span aria-hidden className="w-3 shrink-0 text-[11px] font-bold text-slate-500 md:hidden">
                                        {SIDE_SHORT[side]}
                                      </span>
                                      <ScaleSegmented
                                        label={`${row.label}, ${side}`}
                                        options={rowScale.options}
                                        normalValue={rowScale.normal}
                                        value={sides[side]}
                                        previous={last?.[side]}
                                        onChange={(v) => setSide(row.key, side, v)}
                                      />
                                    </div>
                                  ))}
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      ))}
                    </section>
                  );
                })}

                {/* Balance */}
                <section
                  ref={(el) => {
                    sectionRefs.current.balance = el;
                  }}
                  aria-label="Balance"
                  className="scroll-mt-16"
                >
                  {sectionHeading("Balance", "Romberg, sitting and standing balance, and the Berg Balance Scale.")}
                  <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                    {(
                      [
                        ["romberg", "Romberg", "romberg"],
                        ["sitting", "Sitting balance", "balance_grade"],
                        ["standing", "Standing balance", "balance_grade"],
                      ] as const
                    ).map(([field, label, scaleKey]) => {
                      const scale = NEURO_SCALES[scaleKey];
                      const value = findings.balance[field];
                      const lastValue = before?.balance[field];
                      const meaning = scale.options.find((o) => o.value === value)?.meaning;
                      return (
                        <li key={field} className="grid gap-2 px-3 py-2.5 md:grid-cols-[minmax(9rem,13rem)_1fr] md:items-center md:gap-3">
                          <div>
                            <p className="text-sm font-semibold text-slate-800">{label}</p>
                            {lastValue && (
                              <p className="text-[11px] text-violet-700">
                                Last time: {scale.options.find((o) => o.value === lastValue)?.short ?? lastValue}
                              </p>
                            )}
                          </div>
                          <div>
                            <ScaleSegmented
                              label={label}
                              options={scale.options}
                              normalValue={scale.normal}
                              value={value}
                              previous={lastValue}
                              onChange={(v) => setBalance(field, v)}
                            />
                            <p className="mt-1 text-[11px] text-slate-500">{meaning ?? "Not tested"}</p>
                          </div>
                        </li>
                      );
                    })}
                    <li className="grid gap-2 px-3 py-3 md:grid-cols-[minmax(9rem,13rem)_1fr] md:gap-3">
                      <div>
                        <label htmlFor={bergId} className="text-sm font-semibold text-slate-800">
                          Berg Balance Scale
                        </label>
                        {before?.balance.bergTotal !== undefined && (
                          <p className="text-[11px] text-violet-700">
                            Last time: {before.balance.bergTotal}/{BERG_MAX}
                          </p>
                        )}
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-3">
                          <div className="flex items-center gap-1.5">
                            <input
                              id={bergId}
                              type="number"
                              inputMode="numeric"
                              min={0}
                              max={BERG_MAX}
                              step={1}
                              value={bergFromItems !== null ? String(bergFromItems) : bergText}
                              readOnly={bergFromItems !== null}
                              aria-describedby={`${bergId}-band`}
                              onChange={(e) => {
                                setConfirmingDiscard(false);
                                setBergText(e.target.value);
                              }}
                              className="w-20 rounded-lg border border-slate-300 px-2 py-1.5 text-sm read-only:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
                            />
                            <span className="text-sm text-slate-500">/ {BERG_MAX}</span>
                          </div>
                          <p id={`${bergId}-band`} className="text-xs text-slate-600" aria-live="polite">
                            {bergShown === null
                              ? "Not tested"
                              : bergValid
                                ? `${BERG_BAND_LABEL[bergRiskBand(bergShown)]} - ${BERG_BAND_MEANING[bergRiskBand(bergShown)]}`
                                : `A whole number from 0 to ${BERG_MAX}`}
                            {bergFromItems !== null && " (summed from the items)"}
                          </p>
                        </div>
                        <button
                          type="button"
                          aria-expanded={showBergItems}
                          onClick={() => setShowBergItems((v) => !v)}
                          className="mt-2 rounded text-xs font-semibold text-teal-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
                        >
                          {showBergItems ? "Hide the fourteen items" : "Score the fourteen items (optional)"}
                        </button>
                        {showBergItems && (
                          <div className="mt-2">
                            <p className="mb-2 text-[11px] text-slate-500">
                              0 = unable or needs maximal help, 4 = independent and safe. Once all fourteen are scored,
                              the total is their sum.
                            </p>
                            <ul className="grid gap-2 xl:grid-cols-2">
                              {BERG_ITEMS.map((item) => (
                                <li key={item.key} className="grid grid-cols-[minmax(0,1fr)_11rem] items-center gap-2">
                                  <span className="text-xs text-slate-700">
                                    {item.key}. {item.label}
                                  </span>
                                  <ScaleSegmented
                                    compact
                                    label={`Berg item ${item.key}, ${item.label}`}
                                    options={NEURO_SCALES.berg_item.options}
                                    normalValue={NEURO_SCALES.berg_item.normal}
                                    value={findings.balance.bergItems?.[item.key]?.toString()}
                                    previous={before?.balance.bergItems?.[item.key]?.toString()}
                                    onChange={(v) => setBergItem(item.key, v)}
                                  />
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </li>
                  </ul>
                </section>

                {/* Gait */}
                <section
                  ref={(el) => {
                    sectionRefs.current.gait = el;
                  }}
                  aria-label="Gait"
                  className="scroll-mt-16"
                >
                  {sectionHeading("Gait", "Pattern, walking aids and two timed tests.")}
                  <div className="space-y-4 rounded-xl border border-slate-200 p-3">
                    {(
                      [
                        ["patterns", "Pattern", GAIT_PATTERNS, before?.gait.patterns],
                        ["aids", "Walking aids", GAIT_AIDS, before?.gait.aids],
                      ] as const
                    ).map(([field, label, options, last]) => (
                      <fieldset key={field}>
                        <legend className="mb-1.5 text-sm font-semibold text-slate-800">
                          {label}
                          {last && last.length > 0 && (
                            <span className="ml-2 text-[11px] font-normal text-violet-700">
                              Last time: {last.map((k) => options.find((o) => o.key === k)?.label ?? k).join(", ")}
                            </span>
                          )}
                        </legend>
                        <div className="flex flex-wrap gap-1.5">
                          {options.map((option) => {
                            const on = findings.gait[field].includes(option.key);
                            const meaning = "meaning" in option ? option.meaning : undefined;
                            return (
                              <button
                                key={option.key}
                                type="button"
                                aria-pressed={on}
                                title={meaning}
                                onClick={() => toggleChoice(field, option.key)}
                                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 ${
                                  on ? "border-teal-700 bg-teal-700 text-white" : "border-slate-200 text-slate-600 hover:border-teal-400"
                                }`}
                              >
                                {option.label}
                                {meaning && <span className="sr-only">: {meaning}</span>}
                              </button>
                            );
                          })}
                        </div>
                      </fieldset>
                    ))}

                    <div className="grid gap-4 sm:grid-cols-2">
                      {(
                        [
                          [walkId, "10-metre walk", walkText, setWalkText, walkValid, before?.gait.tenMetreWalkSeconds],
                          [tugId, "Timed Up and Go", tugText, setTugText, tugValid, before?.gait.tugSeconds],
                        ] as const
                      ).map(([id, label, text, setText, valid, last]) => {
                        const seconds = Number(text);
                        let reading = "Not tested";
                        if (cannotWalk) reading = "Not timed - recorded as unable to walk";
                        else if (text.trim() && !valid) reading = `Between ${TIMED_TEST_MIN_SECONDS} and ${TIMED_TEST_MAX_SECONDS} seconds`;
                        else if (text.trim() && id === walkId) {
                          const speed = gaitSpeedFromTenMetre(seconds);
                          reading = `${speed} m/s - ${GAIT_SPEED_LABEL[gaitSpeedBand(speed)]}`;
                        } else if (text.trim()) {
                          reading =
                            seconds >= TUG_FALL_RISK_SECONDS
                              ? `${TUG_FALL_RISK_SECONDS} s or more - raised fall risk`
                              : `Under ${TUG_FALL_RISK_SECONDS} s`;
                        }
                        return (
                          <div key={id}>
                            <label htmlFor={id} className="text-sm font-semibold text-slate-800">
                              {label}
                            </label>
                            {last !== undefined && <span className="ml-2 text-[11px] text-violet-700">Last time: {last} s</span>}
                            <div className="mt-1 flex items-center gap-1.5">
                              <input
                                id={id}
                                type="number"
                                inputMode="decimal"
                                min={TIMED_TEST_MIN_SECONDS}
                                max={TIMED_TEST_MAX_SECONDS}
                                step={0.1}
                                value={text}
                                disabled={cannotWalk}
                                aria-describedby={`${id}-reading`}
                                onChange={(e) => {
                                  setConfirmingDiscard(false);
                                  setText(e.target.value);
                                }}
                                className="w-24 rounded-lg border border-slate-300 px-2 py-1.5 text-sm disabled:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
                              />
                              <span className="text-sm text-slate-500">seconds</span>
                            </div>
                            <p id={`${id}-reading`} aria-live="polite" className="mt-1 text-[11px] text-slate-600">
                              {reading}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </section>

                {/* Notes */}
                <section
                  ref={(el) => {
                    sectionRefs.current.notes = el;
                  }}
                  aria-label="Clinical notes"
                  className="scroll-mt-16 pb-4"
                >
                  {sectionHeading("Clinical notes", "Anything the chart cannot hold: cranial nerves, cognition, posture, how the patient tolerated it.")}
                  <label htmlFor={notesId} className="sr-only">
                    Clinical notes
                  </label>
                  <textarea
                    id={notesId}
                    rows={5}
                    maxLength={NEURO_NOTES_MAX}
                    value={findings.notes ?? ""}
                    onChange={(e) => {
                      setConfirmingDiscard(false);
                      const notes = e.target.value;
                      setFindings((f) => ({ ...f, notes }));
                    }}
                    aria-describedby={`${notesId}-hint`}
                    className="w-full rounded-xl border border-slate-300 p-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
                  />
                  <p id={`${notesId}-hint`} className="mt-1 flex flex-wrap justify-between gap-2 text-[11px] text-slate-500">
                    <span>
                      The patient can read these on their Health Profile. Anything for colleagues only belongs in the
                      session note.
                    </span>
                    <span>
                      {(findings.notes ?? "").length}/{NEURO_NOTES_MAX}
                    </span>
                  </p>
                </section>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 sm:px-6">
            <div className="min-w-0 flex-1 text-xs" aria-live="polite">
              {confirmingDiscard ? (
                <span className="font-semibold text-amber-800">Close without saving? What you recorded here will be lost.</span>
              ) : error ? (
                <span role="alert" data-form-error className="font-semibold text-red-700">
                  {error}
                </span>
              ) : (
                <span className="text-slate-500">
                  {scoredCount === 0
                    ? "Nothing scored yet."
                    : `${scoredCount} ${scoredCount === 1 ? "side" : "sides"} scored${
                        asymmetric.size ? ` · ${asymmetric.size} left-right ${asymmetric.size === 1 ? "difference" : "differences"}` : ""
                      }`}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {confirmingDiscard ? (
                <>
                  <button
                    type="button"
                    onClick={() => setConfirmingDiscard(false)}
                    className="rounded-xl px-4 py-2 text-xs font-semibold text-slate-600 transition hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
                  >
                    Keep editing
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-xl border border-red-200 px-4 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
                  >
                    Discard
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={requestClose}
                    disabled={saving}
                    className="rounded-xl px-4 py-2 text-xs font-semibold text-slate-600 transition hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={save}
                    disabled={saving}
                    className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-5 py-2 text-xs font-semibold text-white transition hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 disabled:opacity-60"
                  >
                    {saving && <Spinner />}
                    {saving ? "Saving…" : "Save examination"}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </OverlayPortal>
  );
}
