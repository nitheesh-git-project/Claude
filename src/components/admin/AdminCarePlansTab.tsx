"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import SurfaceCard, { EmptyState } from "@/components/dashboard/SurfaceCard";
import PagedList from "@/components/dashboard/PagedList";
import { CARE_PLAN_STATE_LABELS, type CarePlanState } from "@/lib/carePlans";

export type AdminCarePlanRow = {
  id: string;
  patientName: string;
  therapistName: string;
  title: string;
  sessionCount: number;
  pricePaise: number;
  isHomeVisit: boolean;
  state: CarePlanState;
  status: string;
  authoredAt: string;
  expiresAt: string | null;
  rationale: string | null;
};

const STATE_STYLE: Record<CarePlanState, string> = {
  awaiting_patient: "bg-amber-50 text-amber-700",
  lapsed: "bg-slate-100 text-slate-500",
  accepted: "bg-teal-50 text-teal-700",
  declined: "bg-slate-100 text-slate-500",
  withdrawn: "bg-slate-100 text-slate-500",
  superseded: "bg-slate-100 text-slate-500",
};

function formatInr(paise: number) {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

/**
 * Every recommendation, and the one thing an admin may do to one.
 *
 * A care plan is the only route by which a patient can buy a programme, so
 * the clinic has to be able to see them -- and to stop a wrong one when the
 * therapist who wrote it cannot. Withdrawing is the whole of that power on
 * purpose: versions are append-only, and a recommendation that changed is a
 * new one written by a clinician who has seen the patient, not an edit made
 * from the back office.
 *
 * A purchased plan cannot be withdrawn here at all. The patient has paid
 * and the sessions exist; the honest lane for that is a refund or a credit
 * adjustment, both of which have their own screens and their own audit.
 */
export default function AdminCarePlansTab({
  plans,
  canWithdraw,
}: {
  plans: AdminCarePlanRow[];
  canWithdraw: boolean;
}) {
  const live = plans.filter((p) => p.state === "awaiting_patient");
  const rest = plans.filter((p) => p.state !== "awaiting_patient");

  return (
    <div className="space-y-8">
      <SurfaceCard
        title="Waiting on a patient"
        icon="fa-file-medical"
        subtitle="Recommendations a patient has been shown and not yet answered. This is the only way a programme is sold."
      >
        {live.length === 0 ? (
          <EmptyState
            icon="fa-file-medical"
            title="Nothing outstanding"
            body="No recommendation is currently waiting for an answer."
          />
        ) : (
          <PagedList
            items={live.map((p) => ({
              id: p.id,
              node: <PlanCard plan={p} canWithdraw={canWithdraw} />,
            }))}
            noun="recommendation"
            storageKey="admin-care-plans-live"
          />
        )}
      </SurfaceCard>

      {rest.length > 0 && (
        <SurfaceCard
          title="Answered and closed"
          icon="fa-clock-rotate-left"
          subtitle="Purchased, declined, withdrawn, replaced or lapsed."
        >
          <PagedList
            items={rest.map((p) => ({
              id: p.id,
              node: <PlanCard plan={p} canWithdraw={false} />,
              group: CARE_PLAN_STATE_LABELS[p.state],
            }))}
            noun="recommendation"
            storageKey="admin-care-plans-closed"
          />
        </SurfaceCard>
      )}
    </div>
  );
}

function PlanCard({ plan, canWithdraw }: { plan: AdminCarePlanRow; canWithdraw: boolean }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/admin/withdraw-care-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ carePlanId: plan.id, reason }),
      });
      if (res.ok) {
        setOpen(false);
        router.refresh();
        return;
      }
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Could not withdraw it. Please try again.");
    });
  }

  return (
    <div className="rounded-xl border border-slate-200 p-4 text-xs">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-bold text-slate-900">{plan.patientName}</p>
          <p className="text-[11px] text-slate-400">Recommended by {plan.therapistName}</p>
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${STATE_STYLE[plan.state]}`}
        >
          {CARE_PLAN_STATE_LABELS[plan.state]}
        </span>
      </div>

      <p className="mt-2 font-semibold text-slate-800">{plan.title}</p>
      <p className="mt-0.5 text-slate-500">
        {plan.sessionCount} {plan.isHomeVisit ? "visits" : "sessions"} ·{" "}
        {formatInr(plan.pricePaise)}
        {plan.isHomeVisit && " + travel"} · written{" "}
        {new Date(plan.authoredAt).toLocaleDateString()}
        {plan.expiresAt && ` · holds until ${new Date(plan.expiresAt).toLocaleDateString()}`}
      </p>

      {plan.rationale && (
        <blockquote className="mt-2 border-l-2 border-slate-200 pl-2.5 italic text-slate-600">
          {plan.rationale}
        </blockquote>
      )}

      {canWithdraw &&
        (open ? (
          <div className="mt-3 rounded-lg border border-slate-200 p-3">
            <label className="block text-[11px] font-semibold text-slate-700">
              Why is the clinic withdrawing this?
            </label>
            <textarea
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. therapist has left; a colleague will reassess"
              className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs"
            />
            {error && <p className="mt-1.5 text-[11px] font-semibold text-red-600">{error}</p>}
            <p className="mt-1.5 text-[11px] text-slate-500">
              The patient stops seeing it. Nothing is deleted, and a therapist can recommend
              again after their next session.
            </p>
            <div className="mt-2 flex items-center gap-3">
              <button
                type="button"
                onClick={submit}
                disabled={isPending}
                className="rounded-lg bg-slate-800 px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-60"
              >
                {isPending ? "Withdrawing…" : "Withdraw"}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-[11px] font-semibold text-slate-500 hover:text-slate-800"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="mt-3 text-[11px] font-semibold text-slate-500 transition hover:text-slate-800"
          >
            Withdraw this recommendation
          </button>
        ))}
    </div>
  );
}
