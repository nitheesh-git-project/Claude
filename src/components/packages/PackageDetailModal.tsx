"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { computePackageCounts, daysUntilExpiry, PACKAGE_EVENT_LABELS } from "@/lib/packageProgress";

const EASE = [0.16, 1, 0.3, 1] as const;

type AppointmentRow = {
  id: string;
  slot_time: string | null;
  status: string;
  no_show: boolean;
  session_code: string | null;
};

type EventRow = {
  id: string;
  event_type: string;
  appointment_id: string | null;
  created_at: string;
};

type DetailResponse = {
  viewerRole: "patient" | "therapist";
  purchase: {
    id: string;
    purchaseCode: string | null;
    packageCode: string | null;
    packageTitle: string;
    packageImageUrl: string | null;
    categoryTitle: string | null;
    sessionCount: number;
    sessionsUsed: number;
    status: string;
    expiresAt: string | null;
    createdAt: string;
    therapistLocked: boolean;
    therapistName: string | null;
    patientName: string | null;
    patientCode: string | null;
    amountPaidPaise: number | null;
    paymentStatus: string | null;
  };
  completed: AppointmentRow[];
  upcoming: AppointmentRow[];
  pendingCount: number;
  events: EventRow[];
};

/**
 * Package detail popup shared by the patient dashboard's package widget,
 * a package session's card, and the therapist dashboard's Programme
 * Patients list -- the admin equivalent (PackagePurchaseDetailModal) has
 * its own money/action-laden version, since the two audiences see
 * different fields entirely (see /api/packages/purchase-detail's
 * viewer-scoped response).
 *
 * Implements the dialog contract by hand, same as TeamTherapistPopup:
 * labelled, Escape to close, focus moved in on open and restored on
 * close, background scroll locked while it's up. Patients and therapists
 * use this, so it gets the accessible treatment the admin-only modal
 * skips.
 */
export default function PackageDetailModal({
  purchaseId,
  onClose,
}: {
  purchaseId: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const lastFocused = useRef<HTMLElement | null>(null);
  const [now] = useState(() => Date.now());

  const close = useCallback(() => onClose(), [onClose]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/packages/purchase-detail?id=${purchaseId}`)
      .then((res) => res.json())
      .then((json) => {
        if (cancelled) return;
        if (json.error) setError(json.error);
        else setData(json);
      })
      .catch(() => !cancelled && setError("Could not load this package."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [purchaseId]);

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

  const counts = data
    ? computePackageCounts({
        sessionCount: data.purchase.sessionCount,
        sessionsUsed: data.purchase.sessionsUsed,
        completedCount: data.completed.length,
        scheduledCount: data.upcoming.length,
      })
    : null;
  const daysLeft = data ? daysUntilExpiry(data.purchase.expiresAt, now) : null;

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
          aria-labelledby="package-modal-title"
          initial={{ opacity: 0, y: 40, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 24, scale: 0.98 }}
          transition={{ duration: 0.28, ease: EASE }}
          onClick={(e) => e.stopPropagation()}
          className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl"
        >
          <div className="relative overflow-hidden rounded-t-3xl bg-gradient-to-br from-teal-800 to-emerald-700 px-6 pb-7 pt-6 sm:px-8">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10 blur-2xl"
            />
            <button
              ref={closeRef}
              onClick={close}
              aria-label="Close"
              className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white transition hover:bg-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <i aria-hidden="true" className="fa-solid fa-xmark" />
            </button>
            <h3 id="package-modal-title" className="font-display pr-10 text-xl font-extrabold text-white sm:text-2xl">
              {data?.purchase.packageTitle ?? "Session Package"}
            </h3>
            {data?.purchase.purchaseCode && (
              <p className="mt-1 text-xs font-semibold text-teal-100">{data.purchase.purchaseCode}</p>
            )}
          </div>

          <div className="px-6 py-6 text-sm sm:px-8">
            {loading && <p className="text-xs text-slate-500">Loading…</p>}
            {error && <p className="text-xs text-red-600">{error}</p>}

            {data && counts && (
              <div className="space-y-6">
                <dl className="grid grid-cols-3 gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div>
                    <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Completed</dt>
                    <dd className="font-display mt-1 text-lg font-bold text-teal-700">{counts.completed}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Scheduled</dt>
                    <dd className="font-display mt-1 text-lg font-bold text-slate-900">{counts.scheduled}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Pending</dt>
                    <dd className="font-display mt-1 text-lg font-bold text-amber-700">{counts.pending}</dd>
                  </div>
                </dl>

                <div className="grid grid-cols-2 gap-3 text-xs text-slate-600">
                  {data.purchase.categoryTitle && (
                    <p>
                      <span className="text-slate-400">Category:</span> {data.purchase.categoryTitle}
                    </p>
                  )}
                  {data.viewerRole === "patient" && data.purchase.therapistName && (
                    <p>
                      <span className="text-slate-400">Therapist:</span> {data.purchase.therapistName}
                    </p>
                  )}
                  {data.viewerRole === "therapist" && data.purchase.patientName && (
                    <p>
                      <span className="text-slate-400">Patient:</span> {data.purchase.patientName}
                      {data.purchase.patientCode ? ` (${data.purchase.patientCode})` : ""}
                    </p>
                  )}
                  {data.viewerRole === "patient" && data.purchase.amountPaidPaise !== null && (
                    <p>
                      <span className="text-slate-400">Paid:</span> ₹
                      {(data.purchase.amountPaidPaise / 100).toLocaleString("en-IN")}
                    </p>
                  )}
                  <p>
                    <span className="text-slate-400">Expires:</span>{" "}
                    {data.purchase.expiresAt
                      ? `${new Date(data.purchase.expiresAt).toLocaleDateString()}${
                          daysLeft !== null ? ` (${daysLeft}d left)` : ""
                        }`
                      : "No expiry"}
                  </p>
                </div>

                <section>
                  <h4 className="text-[11px] font-bold uppercase tracking-[0.16em] text-teal-700">Upcoming</h4>
                  {data.upcoming.length === 0 ? (
                    <p className="mt-2 text-xs text-slate-400">Nothing scheduled yet.</p>
                  ) : (
                    <ul className="mt-2 space-y-1.5">
                      {data.upcoming.map((a) => (
                        <li key={a.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-xs">
                          <span>
                            {a.slot_time ? new Date(a.slot_time).toLocaleString() : "Time TBD"}{" "}
                            <span className="font-mono text-slate-400">{a.session_code ?? ""}</span>
                          </span>
                          <span className="capitalize text-slate-500">{a.status}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <section>
                  <h4 className="text-[11px] font-bold uppercase tracking-[0.16em] text-teal-700">Completed</h4>
                  {data.completed.length === 0 ? (
                    <p className="mt-2 text-xs text-slate-400">None yet.</p>
                  ) : (
                    <ul className="mt-2 space-y-1.5">
                      {data.completed.map((a) => (
                        <li key={a.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-xs">
                          <span>
                            {a.slot_time ? new Date(a.slot_time).toLocaleDateString() : "—"}{" "}
                            <span className="font-mono text-slate-400">{a.session_code ?? ""}</span>
                          </span>
                          {a.no_show && <span className="font-semibold text-amber-700">No-show</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                {counts.pending > 0 && (
                  <p className="text-xs text-slate-400">{counts.pending} session(s) not yet scheduled.</p>
                )}

                {data.events.length > 0 && (
                  <section className="border-t border-slate-100 pt-4">
                    <h4 className="text-[11px] font-bold uppercase tracking-[0.16em] text-teal-700">Timeline</h4>
                    <ul className="mt-2 space-y-1.5">
                      {data.events.map((e) => (
                        <li key={e.id} className="flex items-center justify-between text-xs text-slate-500">
                          <span className="font-semibold text-slate-700">
                            {PACKAGE_EVENT_LABELS[e.event_type] ?? e.event_type}
                          </span>
                          <span>{new Date(e.created_at).toLocaleString()}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
