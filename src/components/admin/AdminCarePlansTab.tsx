"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import SurfaceCard, { EmptyState } from "@/components/dashboard/SurfaceCard";
import PagedList from "@/components/dashboard/PagedList";
import {
  CARE_PLAN_STATE_LABELS,
  formatWaitingFor,
  isQueueStale,
  narrowToCategory,
  type CarePlanOfferKind,
  type CarePlanState,
} from "@/lib/carePlans";
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
  /** The session's own treatment category, used to narrow the programmes
   *  offered — an admin scanning every programme in the catalog is how the
   *  wrong one gets picked, the same reason the therapist's dialog narrows. */
  categoryId: string | null;
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
  /** The rest is what the review queue needs, and only it: an
   *  edit-and-approve starts from what the therapist actually wrote rather
   *  than from an empty form. */
  instructions: string | null;
  handsOnRequired: boolean;
  frequencyPerWeek: number | null;
  offerKind: CarePlanOfferKind;
  packageId: string | null;
  categoryId: string | null;
  /** When the therapist sent it. What the queue is ordered and aged by. */
  submittedAt: string | null;
  /** Sessions this patient has paid for and not yet used, across their live
   *  programmes. The commonest reason to turn a recommendation down, and
   *  invisible from this card until it was put on it. */
  unusedSessions: number;
};

const STATE_STYLE: Record<CarePlanState, string> = {
  pending_review: "bg-indigo-50 text-indigo-700",
  rejected: "bg-rose-50 text-rose-700",
  awaiting_patient: "bg-amber-50 text-amber-700",
  lapsed: "bg-slate-100 text-slate-500",
  accepted: "bg-teal-50 text-teal-700",
  declined: "bg-slate-100 text-slate-500",
  withdrawn: "bg-slate-100 text-slate-500",
  superseded: "bg-slate-100 text-slate-500",
};

/** Matches MIN_REASON_LENGTH in /api/admin/author-care-plan. A reason the
 *  server will refuse is better refused before the admin has retyped the
 *  whole recommendation. */
const MIN_REASON_LENGTH = 10;

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
  nowMs,
}: {
  plans: AdminCarePlanRow[];
  /** Completed sessions an admin could write a recommendation against. */
  authorable: AuthorableSession[];
  packageOptions: RecommendableOption[];
  canWithdraw: boolean;
  /** Resolved on the server, like every other clock reading on this
   *  dashboard. Reading `Date.now()` inside a client component that the
   *  server also rendered is a hydration mismatch on every card. */
  nowMs: number;
}) {
  // Oldest first, and only here. Every other list on this screen is a
  // record and reads newest-first; a queue is work, and the person who has
  // been waiting longest is the one to serve next.
  const queued = plans
    .filter((p) => p.state === "pending_review")
    .sort((a, b) => (a.submittedAt ?? "").localeCompare(b.submittedAt ?? ""));
  const live = plans.filter((p) => p.state === "awaiting_patient");
  const rest = plans.filter(
    (p) => p.state !== "awaiting_patient" && p.state !== "pending_review"
  );

  return (
    <div className="space-y-8">
      {/* First on the screen, always rendered, and counted in its own
          subtitle. This is the only queue in the app standing between a
          clinician's recommendation and the patient hearing about it, so a
          section that quietly disappears when empty would give an admin no
          way to tell "nothing waiting" from "I am on the wrong screen". */}
      <SurfaceCard
        title="Waiting for your decision"
        icon="fa-inbox"
        subtitle={
          queued.length === 0
            ? "Recommendations a therapist has submitted. The patient sees nothing until one is approved."
            : `${queued.length} recommendation${queued.length === 1 ? "" : "s"} the patient cannot see yet.`
        }
      >
        {queued.length === 0 ? (
          <EmptyState
            icon="fa-inbox"
            title="Nothing waiting"
            body="Every recommendation a therapist has written has been decided on."
          />
        ) : (
          <PagedList
            items={queued.map((p) => ({
              id: p.id,
              node: (
                <ReviewCard
                  plan={p}
                  options={packageOptions}
                  canDecide={canWithdraw}
                  nowMs={nowMs}
                />
              ),
            }))}
            noun="recommendation"
            storageKey="admin-care-plans-queue"
          />
        )}
      </SurfaceCard>

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

      {/* Rendered even with nothing to write against. A feature that simply
          is not on the page reads as one that does not exist, and the admin
          looking for it is usually looking because a patient is waiting. */}
      {canWithdraw && <AuthorOnBehalf sessions={authorable} options={packageOptions} />}

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


/** Matches MIN_REVIEW_REASON_LENGTH in src/lib/carePlanReview.ts. */
const MIN_REVIEW_REASON = 10;

/**
 * One recommendation waiting for the clinic, and the three things that can
 * happen to it.
 *
 * The patient sees nothing at all until this card is answered, which is what
 * makes the wording matter: an admin here is not filing paperwork, they are
 * the reason somebody is still waiting after a session that has ended.
 *
 * **Approve** publishes exactly what the therapist wrote. **Turn down** ends
 * the thread and hands the reason back to them to rewrite -- deliberately not
 * an edit, because a recommendation is their clinical judgement and the
 * reason is what tells them what to change. **Approve with changes** is the
 * middle case, and its honesty is in the plumbing rather than the button: it
 * does not edit the therapist's version (those are append-only, and
 * rewriting one under a clinician's name would be a lie about who decided
 * what) but writes a new one on the same thread, authored by the therapist,
 * entered by the admin, with the original left in the history beside it.
 *
 * Every one of the three needs a reason. A decision with none reads the same
 * as one nobody got round to, and this is the record the therapist reads.
 */
function ReviewCard({
  plan,
  options,
  canDecide,
  nowMs,
}: {
  plan: AdminCarePlanRow;
  options: RecommendableOption[];
  canDecide: boolean;
  nowMs: number;
}) {
  const [mode, setMode] = useState<"idle" | "reject" | "edit">("idle");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  // Narrowed to the session's own condition by the same helper both
  // authoring doors use, so an admin changing a recommendation cannot reach
  // a programme for somebody else's condition.
  const narrowed = narrowToCategory(options, plan.categoryId);

  // Seeded from what the therapist actually wrote. An empty form would make
  // "approve with a small change" mean retyping their reasoning, which is
  // how the reasoning ends up being the admin's.
  const [draft, setDraft] = useState<CarePlanDraft | null>(() =>
    plan.packageId
      ? {
          offerKind: plan.offerKind,
          packageId: plan.packageId,
          handsOnRequired: plan.handsOnRequired,
          frequencyPerWeek: plan.frequencyPerWeek,
          clinicalRationale: plan.rationale ?? "",
          instructions: plan.instructions ?? "",
        }
      : null
  );

  function decide(decision: "approved" | "rejected") {
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/admin/review-care-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ carePlanId: plan.id, decision, reason }),
      });
      if (res.ok) {
        setMode("idle");
        setReason("");
        router.refresh();
        return;
      }
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Could not save that decision. Please try again.");
    });
  }

  function approveWithChanges() {
    if (!draft) return;
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/admin/edit-and-approve-care-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ carePlanId: plan.id, ...draft, reason }),
      });
      if (res.ok) {
        setMode("idle");
        setReason("");
        router.refresh();
        return;
      }
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Could not save that decision. Please try again.");
    });
  }

  const reasonTooShort = reason.trim().length < MIN_REVIEW_REASON;
  const waiting = formatWaitingFor(plan.submittedAt, nowMs);
  const stale = isQueueStale(plan.submittedAt, nowMs);

  return (
    <div className="rounded-xl border border-indigo-200 bg-indigo-50/30 p-4 text-xs">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-bold text-slate-900">{plan.patientName}</p>
          <p className="text-[11px] text-slate-500">
            Recommended by {plan.therapistName}
          </p>
        </div>
        {/* How long, not when. A card that reads "2 September" when the
            thing arrived nine minutes ago tells an admin nothing they can
            act on, and there is a patient on the other side of the wait. */}
        <span
          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
            stale ? "bg-rose-100 text-rose-700" : STATE_STYLE.pending_review
          }`}
        >
          {waiting ? `Waiting ${waiting}` : CARE_PLAN_STATE_LABELS.pending_review}
        </span>
      </div>

      <p className="mt-2 font-semibold text-slate-800">{plan.title}</p>
      <p className="mt-0.5 text-slate-500">
        {plan.sessionCount} {plan.isHomeVisit ? "visits" : "sessions"} ·{" "}
        {formatInr(plan.pricePaise)}
        {plan.isHomeVisit && " + travel per visit"}
        {plan.frequencyPerWeek && ` · ${plan.frequencyPerWeek} a week`}
        {plan.handsOnRequired && " · hands-on"}
      </p>

      {plan.rationale && (
        <blockquote className="mt-2 border-l-2 border-indigo-200 pl-2.5 italic text-slate-600">
          {plan.rationale}
        </blockquote>
      )}
      {plan.instructions && (
        <p className="mt-2 text-slate-600">
          <span className="font-semibold text-slate-700">For the patient: </span>
          {plan.instructions}
        </p>
      )}

      {/* Stated, never acted on. This is the commonest reason to turn a
          recommendation down, and an admin could not see it from here
          without leaving the queue and losing their place. It is not a
          verdict: a patient with sessions left may well need a different
          programme, and the clinician has seen them. */}
      {plan.unusedSessions > 0 && (
        <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-2 text-[11px] font-semibold text-amber-800">
          <i aria-hidden="true" className="fa-solid fa-circle-info mr-1.5" />
          {plan.patientName} still has {plan.unusedSessions} unused session
          {plan.unusedSessions === 1 ? "" : "s"} on a current programme.
        </p>
      )}

      {!canDecide ? (
        <p className="mt-3 text-[11px] text-slate-500">
          Deciding on a recommendation needs the Sessions scope.
        </p>
      ) : mode === "idle" ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {/* One tap. Approving is the outcome this queue exists to reach,
              and making an admin justify every yes is how a reason column
              fills up with "ok" -- and how a patient waits longer for a
              recommendation nobody objected to. Turning one down and
              changing one still ask why, because those are the decisions
              somebody else has to act on. Withdrawal is the undo. */}
          <button
            type="button"
            onClick={() => decide("approved")}
            disabled={isPending}
            className="rounded-lg bg-teal-700 px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-teal-800 disabled:opacity-60"
          >
            {isPending ? "Approving…" : "Approve"}
          </button>
          <button
            type="button"
            onClick={() => setMode("edit")}
            disabled={narrowed.length === 0}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
          >
            Approve with changes
          </button>
          <button
            type="button"
            onClick={() => setMode("reject")}
            className="text-[11px] font-semibold text-slate-500 transition hover:text-rose-700"
          >
            Turn it down
          </button>
        </div>
      ) : (
        <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
          {mode === "edit" && (
            <div className="mb-3">
              <p className="mb-2 text-[11px] font-semibold text-slate-700">
                What the clinic is approving instead
              </p>
              {/* An admin's own write publishes on the spot -- they are the
                  approver -- so the panel must not tell them it is going to
                  a queue. */}
              <CarePlanFields
                options={narrowed}
                value={draft}
                onChange={setDraft}
                needsApproval={false}
              />
              <p className="mt-2 text-[11px] text-slate-500">
                This is saved as a new version on the same thread, in{" "}
                {plan.therapistName}&apos;s name with you recorded as having entered it.
                Their original stays in the history.
              </p>
            </div>
          )}

          <label className="block text-[11px] font-semibold text-slate-700">
            {mode === "reject"
              ? `Why is this being turned down? ${plan.therapistName} reads this and rewrites from it.`
              : "What is the clinic changing, and why?"}
          </label>
          <textarea
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={
              mode === "reject"
                ? "e.g. this patient still has 4 unused sessions on their current programme"
                : "e.g. matches the assessment findings and the patient's stated goal"
            }
            className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs"
          />
          {error && <p className="mt-1.5 text-[11px] font-semibold text-red-600">{error}</p>}
          <p className="mt-1.5 text-[11px] text-slate-500">
            {mode === "reject"
              ? "The thread closes and the therapist can write a fresh recommendation after seeing this."
              : "The patient sees it from this moment, and their answering window starts now."}
          </p>
          <div className="mt-2 flex items-center gap-3">
            <button
              type="button"
              onClick={() => (mode === "edit" ? approveWithChanges() : decide("rejected"))}
              disabled={isPending || reasonTooShort || (mode === "edit" && !draft)}
              className={`rounded-lg px-3 py-1.5 text-[11px] font-semibold text-white transition disabled:opacity-50 ${
                mode === "reject" ? "bg-rose-700 hover:bg-rose-800" : "bg-teal-700 hover:bg-teal-800"
              }`}
            >
              {isPending ? "Saving…" : mode === "reject" ? "Turn it down" : "Approve with changes"}
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("idle");
                setError(null);
              }}
              className="text-[11px] font-semibold text-slate-500 hover:text-slate-800"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
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
  const [done, setDone] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  // Falls back to the first session rather than to nothing.
  //
  // A successful write refreshes the page, and the patient just recommended
  // to drops off this list -- they have a live plan now. The id in state
  // then names a session that is gone, while the browser paints the select's
  // first option, and the next submit fails with "pick a session" against a
  // picker that plainly shows one. The select is driven from this same value
  // so the two cannot disagree.
  const session =
    sessions.find((s) => s.appointmentId === appointmentId) ?? sessions[0] ?? null;

  // Narrowed to the session's own condition, by the same helper the
  // therapist's dialog uses.
  const offered = narrowToCategory(options, session?.categoryId ?? null);

  const reasonReady = reason.trim().length >= MIN_REASON_LENGTH;

  function pickSession(next: string) {
    setAppointmentId(next);
    // The programmes on offer change with the session, so a draft carried
    // across could send a package for somebody else's condition.
    setDraft(null);
    setError(null);
    setDone(null);
  }

  function submit() {
    if (!session || !draft) {
      setError("Pick a session and a programme first.");
      return;
    }
    // The selected session can change under a draft -- a realtime refresh
    // drops a patient off this list the moment they have a live plan, and
    // the picker falls back to another one. Sending the draft as it stands
    // would then recommend a programme for somebody else's condition.
    if (!offered.some((o) => o.id === draft.packageId)) {
      setError("That programme isn't offered for this session. Pick one again.");
      return;
    }
    setError(null);
    const patientName = session.patientName;
    const therapistName = session.therapistName;
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
        setDone(`Sent to ${patientName}, in ${therapistName}'s name.`);
        router.refresh();
        return;
      }
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Could not save it. Please try again.");
    });
  }

  // Both empty states say why the panel is empty rather than hiding it. An
  // admin opens this screen because a patient is waiting; a feature that is
  // simply not on the page reads as one that does not exist, and they go
  // looking for a person instead of a reason.
  const body =
    sessions.length === 0 ? (
      <EmptyState
        icon="fa-calendar-check"
        title="No session to write against"
        body="A recommendation follows a completed session the therapist ran. Nothing in the last 60 days qualifies — either every recent patient already has a live recommendation, or no session has been completed yet."
      />
    ) : offered.length === 0 ? (
      <EmptyState
        icon="fa-box-open"
        title="No programme to recommend"
        body={
          options.length === 0
            ? "No package is marked recommendable. Turn one on under Catalog → Packages."
            : "No recommendable package matches this session's treatment. Add one for that category under Catalog → Packages, or pick another session."
        }
      />
    ) : null;

  return (
    <SurfaceCard
      title="Write one on a therapist's behalf"
      icon="fa-pen-to-square"
      subtitle="For when the therapist who ran the session cannot reach their dashboard. It is recommended in their name, and recorded as typed by you."
    >
      {sessions.length > 0 && (
        <>
          <label
            htmlFor="author-on-behalf-session"
            className="block text-xs font-semibold text-slate-700"
          >
            Which session does this follow?
          </label>
          <select
            id="author-on-behalf-session"
            value={session?.appointmentId ?? ""}
            onChange={(e) => pickSession(e.target.value)}
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
        </>
      )}

      {body ?? (
        <>
          <div className="mt-4">
            <CarePlanFields
              options={offered}
              value={draft}
              onChange={setDraft}
              needsApproval={false}
            />
          </div>

          {draft && session && (
            <>
              <label
                htmlFor="author-on-behalf-reason"
                className="mt-4 block text-xs font-semibold text-slate-700"
              >
                Why is the clinic writing this instead of the therapist?
              </label>
              <textarea
                id="author-on-behalf-reason"
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Dr Rao is on leave until the 14th and asked us to send this"
                className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 text-xs"
              />
              <p className="mt-1 text-[11px] text-slate-500">
                {reasonReady
                  ? "Recorded against this recommendation for good."
                  : `At least ${MIN_REASON_LENGTH} characters. It is the part worth having a month from now.`}
              </p>

              {/* Attribution stated at the point of the button, not in the
                  panel's subtitle two screens up. Whose judgement this
                  goes out as is the one thing an admin must not be unsure
                  of when they press it. */}
              <p className="mt-3 rounded-lg bg-slate-50 p-3 text-[11px] text-slate-600">
                <span className="font-semibold text-slate-800">
                  {session.patientName}
                </span>{" "}
                sees this as {session.therapistName}&apos;s recommendation. You are
                recorded as having typed it. It goes live immediately, cannot be edited
                or re-priced afterwards, and nothing is charged until the patient
                accepts.
              </p>

              {error && <p className="mt-2 text-xs font-semibold text-red-600">{error}</p>}
              <button
                type="button"
                onClick={submit}
                disabled={isPending || !reasonReady}
                className="mt-3 rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:opacity-60"
              >
                {isPending
                  ? "Sending…"
                  : `Send it to ${session.patientName.split(" ")[0]}`}
              </button>
            </>
          )}

          {!draft && error && (
            <p className="mt-2 text-xs font-semibold text-red-600">{error}</p>
          )}
          {done && !draft && (
            <p className="mt-3 text-xs font-semibold text-teal-700">{done}</p>
          )}
        </>
      )}
    </SurfaceCard>
  );
}
