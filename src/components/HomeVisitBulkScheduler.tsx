"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import {
  WEEKDAY_HEADERS,
  buildCalendarMonth,
  bookableHoursForDate,
  formatDateKeyLong,
  isMonthEntirelyUnbookable,
} from "@/lib/bookingSlots";
import { formatHourRange } from "@/lib/therapistAvailability";
import { bookingCellClass, BOOKING_DAY_CELL, BOOKING_OPTION_GRID, BOOKING_OPTION_CELL } from "@/lib/bookingCellStyles";

const EASE = [0.16, 1, 0.3, 1] as const;

type Slot = { dateKey: string; hour: number };
type SlotResult = { slotDateTime: string; success: boolean; error?: string };

function slotDateTimeOf(slot: Slot): string {
  return `${slot.dateKey}T${String(slot.hour).padStart(2, "0")}:00`;
}

/**
 * The home-visit twin of PackageBulkScheduler -- same calendar, same
 * client-side pre-cap, same server-authoritative rule enforcement via
 * /api/home-visit/book-visits. No address step here: a home-visit
 * programme is delivered to the address it was bought against, so every
 * visit in the batch reuses that saved address automatically.
 */
export default function HomeVisitBulkScheduler({
  purchaseId,
  pendingCount,
  bulkScheduleMax,
  onClose,
}: {
  purchaseId: string;
  pendingCount: number;
  bulkScheduleMax: number;
  onClose: () => void;
}) {
  const router = useRouter();
  const [nowMs] = useState(() => Date.now());
  const [view, setView] = useState(() => {
    const now = new Date(nowMs);
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [activeDateKey, setActiveDateKey] = useState<string | null>(null);
  const [selected, setSelected] = useState<Slot[]>([]);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<SlotResult[] | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const lastFocused = useRef<HTMLElement | null>(null);

  const maxSelectable = Math.max(0, Math.min(pendingCount, bulkScheduleMax));
  const calendar = buildCalendarMonth(view.year, view.month, nowMs);

  const close = useCallback(() => onClose(), [onClose]);

  useEffect(() => {
    lastFocused.current = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      lastFocused.current?.focus?.();
    };
  }, [close]);

  function shiftMonth(delta: number) {
    setView((prev) => {
      const next = new Date(prev.year, prev.month + delta, 1);
      return { year: next.getFullYear(), month: next.getMonth() };
    });
  }
  const previousMonth = new Date(view.year, view.month - 1, 1);
  const canGoBack = !isMonthEntirelyUnbookable(previousMonth.getFullYear(), previousMonth.getMonth(), nowMs);

  function toggleHour(dateKey: string, hour: number) {
    setSelected((prev) => {
      const exists = prev.some((s) => s.dateKey === dateKey && s.hour === hour);
      if (exists) return prev.filter((s) => !(s.dateKey === dateKey && s.hour === hour));
      if (prev.length >= maxSelectable) return prev;
      return [...prev, { dateKey, hour }].sort((a, b) => slotDateTimeOf(a).localeCompare(slotDateTimeOf(b)));
    });
  }

  const activeHours = useMemo(
    () => (activeDateKey ? bookableHoursForDate(activeDateKey, nowMs) : []),
    [activeDateKey, nowMs]
  );

  async function handleSubmit() {
    if (selected.length === 0) return;
    setSubmitting(true);
    setError(null);
    // try/catch around the fetch itself, not just the response -- a raw
    // network failure (not a non-2xx response) would otherwise throw
    // unhandled here, leaving submitting stuck true and the button
    // disabled forever with no way to retry.
    try {
      const res = await fetch("/api/home-visit/book-visits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          homeVisitPurchaseId: purchaseId,
          slots: selected.map((s) => ({ slotDateTime: slotDateTimeOf(s) })),
          notes: notes || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not schedule these visits. Please try again.");
        return;
      }
      setResults(data.results ?? []);
      router.refresh();
    } catch {
      setError("Could not reach the server. Please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const bookedCount = results?.filter((r) => r.success).length ?? 0;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
        onClick={close}
      >
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-labelledby="home-visit-bulk-scheduler-title"
          initial={{ opacity: 0, y: 40, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 24, scale: 0.98 }}
          transition={{ duration: 0.28, ease: EASE }}
          onClick={(e) => e.stopPropagation()}
          className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl"
        >
          <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 sm:px-8">
            <h3 id="home-visit-bulk-scheduler-title" className="font-display text-lg font-bold text-slate-900">
              Schedule visits
            </h3>
            <button
              ref={closeRef}
              onClick={close}
              aria-label="Close"
              className="flex h-9 w-9 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
            >
              <i aria-hidden="true" className="fa-solid fa-xmark" />
            </button>
          </div>

          <div className="px-6 py-5 text-sm sm:px-8">
            {results ? (
              <div className="space-y-4">
                <p className="text-sm font-semibold text-slate-800">
                  {bookedCount} of {results.length} visit{results.length === 1 ? "" : "s"} scheduled.
                </p>
                <ul className="space-y-1.5 text-xs">
                  {results.map((r) => (
                    <li
                      key={r.slotDateTime}
                      className={`flex items-center justify-between rounded-lg border px-3 py-2 ${
                        r.success ? "border-teal-100 bg-teal-50" : "border-red-100 bg-red-50"
                      }`}
                    >
                      <span>{new Date(r.slotDateTime).toLocaleString()}</span>
                      <span className={r.success ? "text-teal-700 font-semibold" : "text-red-600"}>
                        {r.success ? "Booked" : r.error ?? "Failed"}
                      </span>
                    </li>
                  ))}
                </ul>
                <button
                  onClick={close}
                  className="w-full rounded-xl bg-teal-700 py-3 text-sm font-bold text-white transition hover:bg-teal-800"
                >
                  Done
                </button>
              </div>
            ) : (
              <>
                <p className="mb-4 text-xs text-slate-500">
                  Pick up to {maxSelectable} visit{maxSelectable === 1 ? "" : "s"} to schedule now, all delivered
                  to the address on this package. You can always come back for the rest.
                </p>
                {error && (
                  <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                    {error}
                  </div>
                )}

                <div className="rounded-2xl border border-slate-200 bg-white p-2 sm:p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => shiftMonth(-1)}
                      disabled={!canGoBack}
                      aria-label="Previous month"
                      className="h-9 w-9 rounded-xl text-slate-600 transition hover:bg-slate-100 disabled:opacity-30"
                    >
                      <i className="fa-solid fa-chevron-left" aria-hidden="true" />
                    </button>
                    <span className="text-sm font-bold text-slate-900">{calendar.label}</span>
                    <button
                      type="button"
                      onClick={() => shiftMonth(1)}
                      aria-label="Next month"
                      className="h-9 w-9 rounded-xl text-slate-600 transition hover:bg-slate-100"
                    >
                      <i className="fa-solid fa-chevron-right" aria-hidden="true" />
                    </button>
                  </div>
                  <div className="mb-1 grid grid-cols-7 gap-1.5">
                    {WEEKDAY_HEADERS.map((day) => (
                      <div key={day} className="py-1 text-center text-[10px] font-bold uppercase tracking-wide text-slate-400">
                        {day}
                      </div>
                    ))}
                  </div>
                  <div role="grid" aria-label="Choose dates" className="grid grid-cols-7 gap-1.5">
                    {calendar.cells.map((cell, index) => {
                      if (!cell) return <div key={`pad-${index}`} aria-hidden="true" />;
                      const dayHasSelection = selected.some((s) => s.dateKey === cell.dateKey);
                      const active = cell.dateKey === activeDateKey;
                      return (
                        <button
                          key={cell.dateKey}
                          type="button"
                          role="gridcell"
                          disabled={!cell.bookable}
                          aria-selected={active}
                          aria-label={formatDateKeyLong(cell.dateKey)}
                          onClick={() => setActiveDateKey(cell.dateKey)}
                          className={`relative ${bookingCellClass({ selected: active, disabled: !cell.bookable })} ${BOOKING_DAY_CELL}`}
                        >
                          {cell.dayOfMonth}
                          {dayHasSelection && !active && (
                            <span
                              aria-hidden="true"
                              className="absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-teal-600"
                            />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {activeDateKey && (
                  <div className="mt-4">
                    <p className="mb-2 text-xs font-semibold text-slate-700">{formatDateKeyLong(activeDateKey)}</p>
                    {activeHours.length === 0 ? (
                      <p className="text-xs text-slate-400">No bookable times on this date.</p>
                    ) : (
                      <div className={BOOKING_OPTION_GRID}>
                        {activeHours.map((hour) => {
                          const isSelected = selected.some((s) => s.dateKey === activeDateKey && s.hour === hour);
                          const atCap = !isSelected && selected.length >= maxSelectable;
                          return (
                            <button
                              key={hour}
                              type="button"
                              disabled={atCap}
                              onClick={() => toggleHour(activeDateKey, hour)}
                              className={`${bookingCellClass({ selected: isSelected, disabled: atCap })} ${BOOKING_OPTION_CELL}`}
                            >
                              {formatHourRange(hour)}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {selected.length > 0 && (
                  <div className="mt-5 space-y-1.5 border-t border-slate-100 pt-4">
                    <p className="text-xs font-semibold text-slate-700">
                      Selected ({selected.length}/{maxSelectable})
                    </p>
                    {selected.map((s) => (
                      <div
                        key={slotDateTimeOf(s)}
                        className="flex items-center justify-between rounded-lg border border-teal-100 bg-teal-50 px-3 py-2 text-xs"
                      >
                        <span>{new Date(slotDateTimeOf(s)).toLocaleString()}</span>
                        <button
                          onClick={() => toggleHour(s.dateKey, s.hour)}
                          aria-label="Remove"
                          className="text-teal-700 hover:text-teal-900"
                        >
                          <i className="fa-solid fa-xmark" aria-hidden="true" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="mt-5">
                  <label className="mb-1.5 block text-xs font-semibold text-slate-900">
                    Notes for these visits <span className="font-normal text-slate-500">(optional)</span>
                  </label>
                  <textarea
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 p-3 text-xs"
                  />
                </div>

                <button
                  onClick={handleSubmit}
                  disabled={submitting || selected.length === 0}
                  className="mt-5 w-full rounded-xl bg-teal-700 py-3.5 text-sm font-bold text-white shadow-lg transition hover:bg-teal-800 disabled:opacity-60"
                >
                  {submitting
                    ? "Scheduling..."
                    : `Schedule ${selected.length || ""} Visit${selected.length === 1 ? "" : "s"}`}
                </button>
              </>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
