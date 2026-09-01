"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import SurfaceCard, { EmptyState } from "@/components/dashboard/SurfaceCard";
import PagedList from "@/components/dashboard/PagedList";
import { CARE_PLAN_STATE_LABELS, type CarePlanState } from "@/lib/carePlans";
import CarePlanFields, {
  type CarePlanDraft,
  type RecommendableOption,
} from "@/components/therapist/CarePlanFields";

/** A completed session with nobody's recommendation against it yet. */
export type AuthorableSession = {
  appointmentId: string;
  patientId: string;
  patientName: string;
  therapistName: string;
  sessionCode: string | null;
  slotTime: string;
};

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
  authorable,
  packageOptions,
  canWithdraw,
}: {
  plans: AdminCarePlanRow[];
  /** Completed sessions an admin could write a recommendation against. */
  authorable: AuthorableSession[];
  packageOptions: RecommendableOption[];
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

      {canWithdraw && authorable.length > 0 && packageOptions.length > 0 && (
        <AuthorOnBehalf sessions={authorable} options={packageOptions} />
      )}

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


/**
 * Writing a recommendation on a therapist's behalf.
 *
 * For the case the therapist's own dialog cannot cover: they saw the patient,
 * said what they wanted recommended, and then went on leave, off sick, or
 * left the clinic with somebody still waiting to hear. Without this the
 * patient waits for a recommendation nobody can write, and the only other
 * answer is to ask them to be seen again.
 *
 * The same fields the therapist gets, and no more -- there is no price,
 * session count or discount here because those columns do not exist on a
 * version. What is added is a reason, because this puts words in a
 * clinician's mouth and "why" is the part worth having a month later. The
 * plan is attributed to the therapist who ran the session; the admin is
 * recorded as having typed it.
 */
function AuthorOnBehalf({
  sessions,
  options,
}: {
  sessions: AuthorableSession[];
  options: RecommendableOption[];
}) {
  const [appointmentId, setAppointmentId] = useState(sessions[0]?.appointmentId ?? "");
  const [draft, setDraft] = useState<CarePlanDraft | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const session = sessions.find((s) => s.appointmentId === appointmentId) ?? null;

  function submit() {
    if (!session || !draft) {
      setError("Pick a session and a programme first.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/admin/author-care-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId: session.patientId,
          appointmentId: session.appointmentId,
          reason,
          ...draft,
        }),
      });
      if (res.ok) {
        setDraft(null);
        setReason("");
        setDone(true);
        router.refresh();
        return;
      }
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Could not save it. Please try again.");
    });
  }

  return (
    <SurfaceCard
      title="Write one on a therapist's behalf"
      icon="fa-pen-to-square"
      subtitle="For when the therapist who ran the session cannot reach their dashboard. It is recommended in their name, and recorded as typed by you."
    >
      <label className="block text-xs font-semibold text-slate-700">
        Which session does this follow?
      </label>
      <select
        value={appointmentId}
        onChange={(e) => setAppointmentId(e.target.value)}
        className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 text-sm"
      >
        {sessions.map((s) => (
          <option key={s.appointmentId} value={s.appointmentId}>
            {s.patientName} with {s.therapistName} —{" "}
            {new Date(s.slotTime).toLocaleDateString()}
            {s.sessionCode ? ` (${s.sessionCode})` : ""}
          </option>
        ))}
      </select>

      <div className="mt-4">
        <CarePlanFields options={options} value={draft} onChange={setDraft} />
      </div>

      {draft && (
        <>
          <label className="mt-4 block text-xs font-semibold text-slate-700">
            Why is the clinic writing this instead of the therapist?
          </label>
          <textarea
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Dr Rao is on leave until the 14th and asked us to send this"
            className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 text-xs"
          />
          {error && <p className="mt-2 text-xs font-semibold text-red-600">{error}</p>}
          <button
            type="button"
            onClick={submit}
            disabled={isPending}
            className="mt-3 rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:opacity-60"
          >
            {isPending ? "Sending…" : "Send it to the patient"}
          </button>
        </>
      )}

      {!draft && error && <p className="mt-2 text-xs font-semibold text-red-600">{error}</p>}
      {done && !draft && (
        <p className="mt-3 text-xs font-semibold text-teal-700">
          Sent. It is waiting on the patient now, in the therapist&apos;s name.
        </p>
      )}
    </SurfaceCard>
  );
}
