"use client";

import { useEffect, useState } from "react";
import { useRouter } from "@/lib/useRouter";
import Modal from "@/components/admin/Modal";
import { useConfirm } from "@/lib/useConfirm";
import { usePrompt } from "@/lib/usePrompt";
import { computeHomeVisitCounts, daysUntilHomeVisitExpiry, HOME_VISIT_EVENT_LABELS } from "@/lib/homeVisitProgress";

type AppointmentRow = {
  id: string;
  slot_time: string | null;
  status: string;
  no_show: boolean;
  session_code: string | null;
  patient_rating: number | null;
  therapist_rating: number | null;
};

type EventRow = {
  id: string;
  event_type: string;
  actorName: string;
  created_at: string;
  detail: Record<string, unknown>;
};

type DetailResponse = {
  purchase: {
    id: string;
    purchase_code: string | null;
    packageCode: string | null;
    packageTitle: string;
    packageImageUrl: string | null;
    patientName: string;
    patientCode: string | null;
    therapistName: string | null;
    visit_count: number;
    visits_used: number;
    status: string;
    payment_mode: string;
    payment_status: string;
    amount_paid_paise: number | null;
    travel_fee_paise: number;
    expires_at: string | null;
    created_at: string;
  };
  completed: AppointmentRow[];
  upcoming: AppointmentRow[];
  pendingCount: number;
  restorable: AppointmentRow[];
  events: EventRow[];
};

// The home-visit twin of PackagePurchaseDetailModal.
export default function HomeVisitPurchaseDetailModal({
  purchaseId,
  therapists,
  canSeeMoney,
  onClose,
}: {
  purchaseId: string;
  therapists: { id: string; full_name: string }[];
  // Same rule as the online package modal -- refunding is a Money
  // capability on a Catalog screen. See PackagePurchaseDetailModal.
  canSeeMoney: boolean;
  onClose: () => void;
}) {
  const [data, setData] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now] = useState(() => Date.now());
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionPending, setActionPending] = useState(false);
  const [reassignTherapistId, setReassignTherapistId] = useState("");
  const router = useRouter();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const { prompt, dialog: promptDialog } = usePrompt();

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/home-visit-purchase-detail?id=${purchaseId}`)
      .then((res) => res.json())
      .then((json) => {
        if (cancelled) return;
        if (json.error) {
          setError(json.error);
        } else {
          setData(json);
          setReassignTherapistId(json.purchase.locked_therapist_id ?? "");
        }
      })
      .catch(() => !cancelled && setError("Could not load this package."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [purchaseId]);

  async function refetch() {
    const res = await fetch(`/api/admin/home-visit-purchase-detail?id=${purchaseId}`);
    const json = await res.json();
    if (!json.error) setData(json);
  }

  async function runAction(url: string, body: Record<string, unknown>) {
    setActionError(null);
    setActionPending(true);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setActionError(json.error ?? "Action failed. Please try again.");
        return null;
      }
      await refetch();
      router.refresh();
      return json;
    } finally {
      setActionPending(false);
    }
  }

  async function handleReassign() {
    if (!reassignTherapistId || !data) return;
    const label = therapists.find((t) => t.id === reassignTherapistId)?.full_name ?? "this therapist";
    if (!(await confirm(`Move every future visit on this package to ${label}?`))) return;
    const result = await runAction("/api/admin/reassign-home-visit-therapist", {
      purchaseId,
      therapistId: reassignTherapistId,
    });
    // The purchase locks to the new therapist regardless (future visits
    // should still go to them), but any already-scheduled visit that
    // couldn't move -- a real scheduling conflict with the new therapist --
    // stays with whoever it's currently assigned to. Silently refreshing
    // would hide that from the admin; they need to know which visit still
    // needs manual attention.
    if (result?.skipped?.length > 0) {
      setActionError(
        `Locked to ${label} for future visits, but ${result.skipped.length} already-scheduled visit(s) couldn't move: ${result.skipped
          .map((s: { reason: string }) => s.reason)
          .join("; ")}`
      );
    }
  }

  async function handleExtendExpiry() {
    const days = await prompt("Extend expiry by how many days?", "30");
    if (days === null) return;
    const n = Number(days);
    if (!Number.isFinite(n) || n <= 0) {
      setActionError("Enter a positive number of days.");
      return;
    }
    const reason = await prompt("Reason for the extension (shown in the timeline):", "");
    if (reason === null) return;
    const base = data?.purchase.expires_at ? new Date(data.purchase.expires_at) : new Date();
    const newExpiresAt = new Date(Math.max(base.getTime(), Date.now()) + n * 86_400_000).toISOString();
    await runAction("/api/admin/extend-home-visit-expiry", { purchaseId, newExpiresAt, reason });
  }

  async function handleRestore(appointmentId: string) {
    if (!(await confirm("Give this visit back to the patient's balance?"))) return;
    await runAction("/api/admin/restore-home-visit", { purchaseId, appointmentId });
  }

  async function handleRefund() {
    if (
      !(await confirm(
        "Refund every unused/scheduled visit on this package and close it out? Scheduled visits will be cancelled."
      ))
    )
      return;
    const reason = await prompt("Reason for the refund (shown in the timeline):", "");
    if (reason === null) return;
    await runAction("/api/admin/refund-home-visit-package", { purchaseId, reason });
  }

  const counts = data
    ? computeHomeVisitCounts({
        visitCount: data.purchase.visit_count,
        visitsUsed: data.purchase.visits_used,
        completedCount: data.completed.length,
        scheduledCount: data.upcoming.length,
      })
    : null;
  const daysLeft = data ? daysUntilHomeVisitExpiry(data.purchase.expires_at, now) : null;

  return (
    <Modal
      title={data ? data.purchase.packageTitle : "Home Visit Package"}
      subtitle={data ? `${data.purchase.purchase_code ?? ""} · ${data.purchase.patientName}` : undefined}
      onClose={onClose}
    >
      {loading && <p className="text-xs text-slate-500">Loading…</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
      {data && counts && (
        <div className="space-y-6 text-xs">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label="Completed" value={counts.completed} tone="text-teal-700" />
            <Stat label="Scheduled" value={counts.scheduled} tone="text-slate-800" />
            <Stat label="Pending" value={counts.pending} tone="text-amber-700" />
            <Stat
              label="Status"
              value={data.purchase.status}
              tone={data.purchase.status === "active" ? "text-teal-700" : "text-slate-500"}
              capitalize
            />
          </div>

          <div className="grid grid-cols-2 gap-3 text-slate-600">
            <p>
              <span className="text-slate-400">Therapist:</span>{" "}
              {data.purchase.therapistName ?? "Not yet locked"}
            </p>
            <p>
              <span className="text-slate-400">Payment:</span>{" "}
              {data.purchase.payment_mode === "cash_on_visit" ? "Cash on visit" : "Prepaid"} (
              {data.purchase.payment_status})
            </p>
            <p>
              <span className="text-slate-400">Paid:</span>{" "}
              {data.purchase.amount_paid_paise
                ? `₹${(data.purchase.amount_paid_paise / 100).toLocaleString("en-IN")}`
                : "—"}
              {!!data.purchase.travel_fee_paise && (
                <> + ₹{(data.purchase.travel_fee_paise / 100).toLocaleString("en-IN")} travel/visit</>
              )}
            </p>
            <p>
              <span className="text-slate-400">Expires:</span>{" "}
              {data.purchase.expires_at
                ? `${new Date(data.purchase.expires_at).toLocaleDateString()}${
                    daysLeft !== null ? ` (${daysLeft}d left)` : ""
                  }`
                : "No expiry"}
            </p>
          </div>

          <section>
            <h4 className="font-bold text-slate-800 mb-2">Upcoming</h4>
            {data.upcoming.length === 0 ? (
              <p className="text-slate-400">Nothing scheduled yet.</p>
            ) : (
              <ul className="space-y-1.5">
                {data.upcoming.map((a) => (
                  <li key={a.id} className="flex items-center justify-between border border-slate-200 rounded-lg px-3 py-2">
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
            <h4 className="font-bold text-slate-800 mb-2">Completed</h4>
            {data.completed.length === 0 ? (
              <p className="text-slate-400">None yet.</p>
            ) : (
              <ul className="space-y-1.5">
                {data.completed.map((a) => (
                  <li key={a.id} className="flex items-center justify-between border border-slate-200 rounded-lg px-3 py-2">
                    <span>
                      {a.slot_time ? new Date(a.slot_time).toLocaleDateString() : "—"}{" "}
                      <span className="font-mono text-slate-400">{a.session_code ?? ""}</span>
                      {a.no_show && <span className="ml-2 text-amber-700 font-semibold">No-show</span>}
                    </span>
                    {a.no_show && (
                      <button
                        onClick={() => handleRestore(a.id)}
                        disabled={actionPending}
                        className="text-teal-700 font-semibold hover:underline"
                      >
                        Restore visit
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {counts.pending > 0 && (
            <p className="text-slate-400">{counts.pending} visit(s) not yet scheduled.</p>
          )}

          {data.restorable.length > 0 && (
            <section>
              <h4 className="font-bold text-slate-800 mb-2">Forfeited visits</h4>
              <ul className="space-y-1.5">
                {data.restorable.map((a) => (
                  <li key={a.id} className="flex items-center justify-between border border-slate-200 rounded-lg px-3 py-2">
                    <span>
                      {a.slot_time ? new Date(a.slot_time).toLocaleString() : "—"}{" "}
                      <span className="capitalize text-slate-500">
                        ({a.status === "completed" ? "no-show" : "late cancellation"})
                      </span>
                    </span>
                    <button
                      onClick={() => handleRestore(a.id)}
                      disabled={actionPending}
                      className="text-teal-700 font-semibold hover:underline"
                    >
                      Restore visit
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="border-t border-slate-100 pt-4">
            <h4 className="font-bold text-slate-800 mb-2">Actions</h4>
            {actionError && <p className="text-red-600 mb-2">{actionError}</p>}
            <div className="space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <select
                  value={reassignTherapistId}
                  onChange={(e) => setReassignTherapistId(e.target.value)}
                  className="p-2 rounded-lg border border-slate-300"
                >
                  <option value="">Select therapist…</option>
                  {therapists.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.full_name}
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleReassign}
                  disabled={actionPending || !reassignTherapistId}
                  className="bg-slate-800 hover:bg-slate-900 disabled:opacity-60 text-white font-semibold px-3 py-2 rounded-lg transition"
                >
                  Reassign programme
                </button>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={handleExtendExpiry}
                  disabled={actionPending || data.purchase.status === "refunded"}
                  className="bg-slate-200 hover:bg-slate-300 disabled:opacity-60 text-slate-800 font-semibold px-3 py-2 rounded-lg transition"
                >
                  Extend expiry
                </button>
                {canSeeMoney &&
                  data.purchase.status === "active" &&
                  data.purchase.payment_mode === "prepaid" &&
                  data.purchase.payment_status === "paid" && (
                    <button
                      onClick={handleRefund}
                      disabled={actionPending}
                      className="bg-red-50 hover:bg-red-100 disabled:opacity-60 text-red-700 font-semibold px-3 py-2 rounded-lg transition"
                    >
                      Refund remaining
                    </button>
                  )}
              </div>
              {data.purchase.payment_mode === "cash_on_visit" && (
                <p className="text-slate-400">
                  Cash-on-visit programmes have no single payment to refund — cancel visits individually
                  from the Visits queue; any cash already collected is flagged on the Cash Ledger.
                </p>
              )}
            </div>
          </section>

          <section className="border-t border-slate-100 pt-4">
            <h4 className="font-bold text-slate-800 mb-2">Timeline</h4>
            {data.events.length === 0 ? (
              <p className="text-slate-400">No events recorded.</p>
            ) : (
              <ul className="space-y-1.5">
                {data.events.map((e) => (
                  <li key={e.id} className="flex items-center justify-between text-slate-500">
                    <span>
                      <span className="font-semibold text-slate-700">
                        {HOME_VISIT_EVENT_LABELS[e.event_type] ?? e.event_type}
                      </span>{" "}
                      by {e.actorName}
                    </span>
                    <span>{new Date(e.created_at).toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
      {confirmDialog}
      {promptDialog}
    </Modal>
  );
}

function Stat({
  label,
  value,
  tone,
  capitalize,
}: {
  label: string;
  value: string | number;
  tone: string;
  capitalize?: boolean;
}) {
  return (
    <div className="border border-slate-200 rounded-xl p-3">
      <p className="text-slate-400">{label}</p>
      <p className={`font-bold text-lg ${tone} ${capitalize ? "capitalize" : ""}`}>{value}</p>
    </div>
  );
}
