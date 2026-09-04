"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "@/lib/useRouter";
import { AnimatePresence, motion } from "motion/react";
import {
  bookableHoursForDate,
  formatDateKeyLong,
} from "@/lib/bookingSlots";
import BookingCalendar from "@/components/booking/BookingCalendar";
import { formatHourRange } from "@/lib/therapistAvailability";
import { BOOKING_LEAD_TIME_MS } from "@/lib/bookingSlots";
import { proposeSessionRhythm } from "@/lib/sessionRhythm";
import { bookingCellClass, BOOKING_OPTION_GRID, BOOKING_OPTION_CELL } from "@/lib/bookingCellStyles";

const EASE = [0.16, 1, 0.3, 1] as const;

type Slot = { dateKey: string; hour: number };
type SlotResult = { slotDateTime: string; success: boolean; error?: string };

function slotDateTimeOf(slot: Slot): string {
  return `${slot.dateKey}T${String(slot.hour).padStart(2, "0")}:00`;
}

/**
 * The "edit" button on the patient dashboard's package widget -- lets a
 * patient pick several of a package's remaining sessions in one pass
 * instead of redeeming them one at a time. Every rule (bulk limit, minimum
 * gap, weekly cap, expiry) is enforced authoritatively by
 * /api/appointments/book-package-sessions; this only pre-caps the client
 * selection at maxSelectable so the count on screen can't visibly promise
 * more than the server will honor.
 */
export default function PackageBulkScheduler({
  purchaseId,
  pendingCount,
  bulkScheduleMax,
  frequencyPerWeek = null,
  minGapHours = null,
  maxPerWeek = null,
  expiresAt = null,
  onClose,
}: {
  purchaseId: string;
  pendingCount: number;
  bulkScheduleMax: number;
  /** What the clinician recommended, and the programme's own rules. Used to
   *  propose the whole run rather than hand over an empty calendar. */
  frequencyPerWeek?: number | null;
  minGapHours?: number | null;
  maxPerWeek?: number | null;
  expiresAt?: string | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [nowMs] = useState(() => Date.now());
  const [activeDateKey, setActiveDateKey] = useState<string | null>(null);
  // The proposal, computed before the selection it seeds.
  //
  // Everything the therapist decided is already known -- how many, how
  // often, the programme's gap rules, when the validity runs out -- so
  // handing the patient a blank grid asks them to redo arithmetic somebody
  // has already done, at the worst possible moment: immediately after
  // paying.
  //
  // A proposal, not a booking. Every slot still goes through the booking
  // route, which re-checks the lead time, the gap, the weekly cap and the
  // therapist's diary on the server.
  const proposal = useMemo(
    () =>
      proposeSessionRhythm({
        count: Math.max(0, Math.min(pendingCount, bulkScheduleMax)),
        frequencyPerWeek,
        minGapHours,
        maxPerWeek,
        nowMs,
        leadTimeMs: BOOKING_LEAD_TIME_MS,
        expiresAtMs: expiresAt ? new Date(expiresAt).getTime() : null,
      }),
    [pendingCount, bulkScheduleMax, frequencyPerWeek, minGapHours, maxPerWeek, nowMs, expiresAt]
  );

  // Seeded at initialisation rather than in an effect: the dialog mounts
  // when it opens, so the first render is the right moment, and an effect
  // would paint an empty calendar for a frame and then fill it in. It is
  // deliberately never re-applied -- once somebody has started editing,
  // silently putting the suggestion back is the calendar overruling the
  // person using it.
  const [selected, setSelected] = useState<Slot[]>(() => proposal);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<SlotResult[] | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const lastFocused = useRef<HTMLElement | null>(null);

  const maxSelectable = Math.max(0, Math.min(pendingCount, bulkScheduleMax));

  const isProposal =
    proposal.length > 0 &&
    selected.length === proposal.length &&
    selected.every((s, i) => s.dateKey === proposal[i].dateKey && s.hour === proposal[i].hour);

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
      const res = await fetch("/api/appointments/book-package-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          packagePurchaseId: purchaseId,
          slots: selected.map((s) => ({ slotDateTime: slotDateTimeOf(s) })),
          notes: notes || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not schedule these sessions. Please try again.");
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
  const failedCount = results?.filter((r) => !r.success).length ?? 0;

  /**
   * Back to the calendar with only the failures left to place.
   *
   * The booked ones are gone from the selection deliberately -- they are
   * real appointments now, and re-offering them would invite a patient to
   * book the same slot twice. The count they are allowed to pick shrinks to
   * match, because that is how many sessions are actually still unspent.
   */
  function retryFailed() {
    setResults(null);
    setSelected([]);
    setActiveDateKey(null);
    setError(null);
    router.refresh();
  }

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
          aria-labelledby="bulk-scheduler-title"
          initial={{ opacity: 0, y: 40, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 24, scale: 0.98 }}
          transition={{ duration: 0.28, ease: EASE }}
          onClick={(e) => e.stopPropagation()}
          className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl"
        >
          <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 sm:px-8">
            <h3 id="bulk-scheduler-title" className="font-display text-lg font-bold text-slate-900">
              Schedule sessions
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
                  {bookedCount} of {results.length} session{results.length === 1 ? "" : "s"} scheduled.
                </p>
                {failedCount > 0 && (
                  <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    {failedCount === 1 ? "One time" : `${failedCount} times`} didn&apos;t work. Your other
                    sessions are booked and nothing was charged again — pick another time for{" "}
                    {failedCount === 1 ? "it" : "them"} below.
                  </p>
                )}
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
                {/* The whole point of showing failures at all is that the
                    patient can act on them. A list they can only close means
                    starting the flow again from a screen that has forgotten
                    what went wrong. */}
                {failedCount > 0 ? (
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <button
                      onClick={retryFailed}
                      className="flex-1 rounded-xl bg-teal-700 py-3 text-sm font-bold text-white transition hover:bg-teal-800"
                    >
                      Pick another time
                    </button>
                    <button
                      onClick={close}
                      className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      I&apos;ll do it later
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={close}
                    className="w-full rounded-xl bg-teal-700 py-3 text-sm font-bold text-white transition hover:bg-teal-800"
                  >
                    Done
                  </button>
                )}
              </div>
            ) : (
              <>
                {proposal.length > 0 ? (
                  <div className="mb-4 rounded-xl border border-teal-100 bg-teal-50/60 p-3">
                    <p className="text-xs font-semibold text-slate-800">
                      {isProposal
                        ? `We've picked ${proposal.length} time${proposal.length === 1 ? "" : "s"} for you`
                        : "Your times"}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-600">
                      {frequencyPerWeek
                        ? `Spaced ${frequencyPerWeek} a week, the way your therapist recommended.`
                        : "Spaced a week apart."}{" "}
                      Change any of them below — nothing is booked until you confirm.
                    </p>
                    {!isProposal && (
                      <button
                        type="button"
                        onClick={() => setSelected(proposal)}
                        className="mt-2 text-[11px] font-semibold text-teal-700 underline-offset-2 hover:underline"
                      >
                        Put the suggested times back
                      </button>
                    )}
                  </div>
                ) : (
                  <p className="mb-4 text-xs text-slate-500">
                    Pick up to {maxSelectable} session{maxSelectable === 1 ? "" : "s"} to schedule now. You
                    can always come back for the rest.
                  </p>
                )}
                {error && (
                  <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                    {error}
                  </div>
                )}

                {/* The patient's own calendar, not a copy of it. This screen used
                    to carry its own month grid for one difference -- a dot on days
                    that already hold a chosen slot -- which is now a prop. */}
                <BookingCalendar
                  selectedDateKey={activeDateKey ?? ""}
                  onSelect={setActiveDateKey}
                  nowMs={nowMs}
                  autoSelected={false}
                  markedDateKeys={selected.map((s) => s.dateKey)}
                  gridLabel="Choose dates"
                />

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
                    Notes for these sessions <span className="font-normal text-slate-500">(optional)</span>
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
                    : `Schedule ${selected.length || ""} Session${selected.length === 1 ? "" : "s"}`}
                </button>
              </>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
