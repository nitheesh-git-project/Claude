"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import SurfaceCard, { EmptyState } from "@/components/dashboard/SurfaceCard";
import PagedList from "@/components/dashboard/PagedList";
import {
  MIN_REVIEW_NOTE_LENGTH,
  RISK_SEVERITY_LABELS,
  RISK_STATUS_LABELS,
  type RiskSignal,
  type RiskStatus,
} from "@/lib/riskSignals";

const SEVERITY_STYLE: Record<string, string> = {
  high: "bg-red-50 text-red-700",
  medium: "bg-amber-50 text-amber-700",
  low: "bg-slate-100 text-slate-600",
};

const STATUS_STYLE: Record<RiskStatus, string> = {
  open: "bg-amber-50 text-amber-700",
  reviewing: "bg-sky-50 text-sky-700",
  dismissed: "bg-slate-100 text-slate-500",
  actioned: "bg-teal-50 text-teal-700",
};

export type RiskSignalRow = RiskSignal & {
  ruleLabel: string;
  subjectName: string;
};

export type CommunicationFlagRow = {
  id: string;
  surface: string;
  authorName: string;
  patientName: string | null;
  tier: string;
  blocked: boolean;
  summary: string;
  content: string | null;
  createdAt: string;
};

export type ContactRevealRow = {
  id: string;
  therapistName: string;
  patientName: string;
  field: string;
  reason: string | null;
  createdAt: string;
};

export type RiskReviewRow = {
  id: string;
  signalId: string;
  reviewerName: string;
  outcome: string;
  note: string;
  createdAt: string;
};

/**
 * The detector queue, and nothing else.
 *
 * There is deliberately no "suspend", no "hold payout" and no "hide from
 * the team page" on this screen. A flag is never an accusation and never
 * carries an automatic penalty: acting on one means going to the screen
 * that owns that action and doing it on purpose, with its own audit row.
 * Putting those buttons here would make a heuristic over clinical data into
 * a thing that punishes people, and a heuristic over clinical data is never
 * right often enough for that.
 *
 * What the screen does offer is the evidence -- the ids of the rows that
 * made a rule fire -- because an admin who can only see a verdict cannot
 * disagree with it.
 */
export type RiskRuleRow = {
  ruleKey: string;
  label: string;
  description: string;
  enabled: boolean;
  config: Record<string, unknown>;
};

export default function RiskSignalsTab({
  signals,
  reviews,
  rules,
  flags,
  reveals,
  detectorsEnabled,
  canReview,
}: {
  signals: RiskSignalRow[];
  reviews: RiskReviewRow[];
  rules: RiskRuleRow[];
  /** The messages the scanner caught, with the text that caused it. */
  flags: CommunicationFlagRow[];
  /** Who unmasked whose number, and when. */
  reveals: ContactRevealRow[];
  detectorsEnabled: boolean;
  /** False for a scoped admin, who can read the queue but not close a row. */
  canReview: boolean;
}) {
  const reviewsBySignal = new Map<string, RiskReviewRow[]>();
  for (const r of reviews) {
    const list = reviewsBySignal.get(r.signalId) ?? [];
    list.push(r);
    reviewsBySignal.set(r.signalId, list);
  }

  const open = signals.filter((s) => s.status === "open" || s.status === "reviewing");
  const closed = signals.filter((s) => s.status === "dismissed" || s.status === "actioned");

  return (
    <div className="space-y-8">
      <SurfaceCard
        title="Risk signals"
        icon="fa-triangle-exclamation"
        subtitle="Patterns worth a person's attention. Nothing here changes anything on its own — no account is suspended, no payout is held, and no therapist is hidden because a rule fired."
      >
        {open.length === 0 ? (
          <EmptyState
            icon="fa-circle-check"
            title="Nothing waiting"
            body="No open signals. The detectors run when this page loads, so this stays current without anything scheduled."
          />
        ) : (
          <PagedList
            items={open.map((s) => ({
              id: s.id,
              node: (
                <SignalCard
                  signal={s}
                  history={reviewsBySignal.get(s.id) ?? []}
                  canReview={canReview}
                />
              ),
            }))}
            noun="signal"
            storageKey="admin-risk-open"
          />
        )}
      </SurfaceCard>

      {canReview && <FlaggedMessages flags={flags} />}

      {canReview && <RevealTrail reveals={reveals} />}

      {canReview && (
        <RulesPanel rules={rules} detectorsEnabled={detectorsEnabled} />
      )}

      {closed.length > 0 && (
        <SurfaceCard
          title="Already looked at"
          icon="fa-clock-rotate-left"
          subtitle="Closed signals and what was concluded. If the behaviour continues, a fresh signal is raised rather than this one reopening."
        >
          <PagedList
            items={closed.map((s) => ({
              id: s.id,
              node: (
                <SignalCard
                  signal={s}
                  history={reviewsBySignal.get(s.id) ?? []}
                  canReview={false}
                />
              ),
            }))}
            noun="signal"
            storageKey="admin-risk-closed"
          />
        </SurfaceCard>
      )}
    </div>
  );
}

function SignalCard({
  signal,
  history,
  canReview,
}: {
  signal: RiskSignalRow;
  history: RiskReviewRow[];
  canReview: boolean;
}) {
  const [outcome, setOutcome] = useState<"reviewing" | "dismissed" | "actioned">("dismissed");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/admin/review-risk-signal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signalId: signal.id, outcome, note }),
      });
      if (res.ok) {
        setOpen(false);
        router.refresh();
        return;
      }
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Could not save. Please try again.");
    });
  }

  return (
    <div className="rounded-xl border border-slate-200 p-4 text-xs">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-bold text-slate-900">{signal.subjectName}</p>
          <p className="text-[11px] text-slate-400">{signal.ruleLabel}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span
            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
              SEVERITY_STYLE[signal.severity] ?? SEVERITY_STYLE.low
            }`}
          >
            {RISK_SEVERITY_LABELS[signal.severity]}
          </span>
          <span
            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${STATUS_STYLE[signal.status]}`}
          >
            {RISK_STATUS_LABELS[signal.status]}
          </span>
        </div>
      </div>

      <p className="mt-2 text-slate-700">{signal.summary}</p>
      <p className="mt-1 text-[11px] text-slate-400">
        Noticed {new Date(signal.detectedAt).toLocaleString()}
      </p>

      <details className="mt-3">
        <summary className="cursor-pointer text-[11px] font-semibold text-slate-500 hover:text-slate-800">
          What this is based on
        </summary>
        <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-50 p-2.5 text-[11px] text-slate-600">
          {JSON.stringify(signal.evidence, null, 2)}
        </pre>
      </details>

      {history.length > 0 && (
        <ul className="mt-3 space-y-1.5 border-t border-slate-100 pt-3">
          {history.map((r) => (
            <li key={r.id} className="text-[11px] text-slate-500">
              <span className="font-semibold text-slate-700">{r.reviewerName}</span>{" "}
              {RISK_STATUS_LABELS[r.outcome as RiskStatus] ?? r.outcome} ·{" "}
              {new Date(r.createdAt).toLocaleDateString()} — {r.note}
            </li>
          ))}
        </ul>
      )}

      {canReview &&
        (open ? (
          <div className="mt-3 rounded-lg border border-slate-200 p-3">
            <div className="flex flex-wrap gap-3">
              {(["reviewing", "dismissed", "actioned"] as const).map((o) => (
                <label key={o} className="flex items-center gap-1.5 text-[11px] text-slate-700">
                  <input
                    type="radio"
                    name={`outcome-${signal.id}`}
                    checked={outcome === o}
                    onChange={() => setOutcome(o)}
                  />
                  {RISK_STATUS_LABELS[o]}
                </label>
              ))}
            </div>
            <textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={`What did you conclude? At least ${MIN_REVIEW_NOTE_LENGTH} characters.`}
              className="mt-2 w-full rounded-lg border border-slate-300 p-2 text-xs"
            />
            {error && <p className="mt-1.5 text-[11px] font-semibold text-red-600">{error}</p>}
            <div className="mt-2 flex items-center gap-3">
              <button
                type="button"
                onClick={submit}
                disabled={isPending}
                className="rounded-lg bg-slate-800 px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-60"
              >
                {isPending ? "Saving…" : "Record"}
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
            className="mt-3 text-[11px] font-semibold text-teal-700 hover:text-teal-800"
          >
            Record what you found
          </button>
        ))}
    </div>
  );
}


/**
 * The detectors themselves, and the switch that stops all of them.
 *
 * These live beside the queue rather than on a Settings screen because an
 * admin who wants to turn a detector down is, by definition, looking at
 * what it produced. `risk_signals_enabled` is an ordinary site setting and
 * is read through adminSettings like every other one; only its control is
 * here.
 *
 * Several rules ship switched off and the panel says so plainly. A
 * threshold invented before this clinic has a baseline fires on everyone or
 * on nobody, and the first of those is how a queue stops being read.
 */
function RulesPanel({
  rules,
  detectorsEnabled,
}: {
  rules: RiskRuleRow[];
  detectorsEnabled: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function post(url: string, payload: Record<string, unknown>) {
    setError(null);
    startTransition(async () => {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        router.refresh();
        return;
      }
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Could not save. Please try again.");
    });
  }

  return (
    <SurfaceCard
      title="What is being watched"
      icon="fa-sliders"
      subtitle="Each of these looks for one pattern. None of them does anything on its own."
    >
      <label className="flex cursor-pointer items-start gap-3 border-b border-slate-100 pb-4">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={detectorsEnabled}
          disabled={isPending}
          onChange={() =>
            post("/api/admin/update-setting", {
              key: "risk_signals_enabled",
              value: !detectorsEnabled,
            })
          }
        />
        <span>
          <span className="block text-xs font-bold text-slate-800">
            Run the checks
          </span>
          <span className="mt-0.5 block text-[11px] text-slate-500">
            Switch this off and nothing new is noticed. Signals already raised stay
            where they are.
          </span>
        </span>
      </label>

      <ul className="mt-4 space-y-4">
        {rules.map((rule) => (
          <li key={rule.ruleKey}>
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={rule.enabled}
                disabled={isPending}
                onChange={() =>
                  post("/api/admin/update-risk-rule", {
                    ruleKey: rule.ruleKey,
                    enabled: !rule.enabled,
                  })
                }
              />
              <span className="min-w-0">
                <span className="block text-xs font-bold text-slate-800">{rule.label}</span>
                <span className="mt-0.5 block text-[11px] text-slate-500">
                  {rule.description}
                </span>
              </span>
            </label>
            {rule.enabled && Object.keys(rule.config).length > 0 && (
              <div className="ml-7 mt-2 flex flex-wrap gap-3">
                {Object.entries(rule.config).map(([key, value]) => (
                  <ConfigField
                    key={key}
                    name={key}
                    value={typeof value === "number" ? value : 0}
                    disabled={isPending}
                    onSave={(next) =>
                      post("/api/admin/update-risk-rule", {
                        ruleKey: rule.ruleKey,
                        config: { [key]: next },
                      })
                    }
                  />
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>

      {error && <p className="mt-4 text-xs font-semibold text-red-600">{error}</p>}
    </SurfaceCard>
  );
}

/** Turns `minConversion` into "min conversion" without a lookup table --
 *  the config keys are already written to be readable. */
function humanise(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

function ConfigField({
  name,
  value,
  disabled,
  onSave,
}: {
  name: string;
  value: number;
  disabled: boolean;
  onSave: (next: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  const dirty = draft !== String(value);

  return (
    <span className="flex items-center gap-1.5">
      <span className="text-[11px] text-slate-500">{humanise(name)}</span>
      <input
        type="number"
        min={0}
        step="any"
        value={draft}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        className="w-20 rounded-lg border border-slate-300 p-1 text-[11px]"
      />
      {dirty && (
        <button
          type="button"
          onClick={() => onSave(Number(draft))}
          disabled={disabled}
          className="text-[11px] font-semibold text-teal-700 hover:text-teal-800 disabled:opacity-60"
        >
          Save
        </button>
      )}
    </span>
  );
}


const SURFACE_LABELS: Record<string, string> = {
  session_suggestion_note: "Note on a proposed time",
  care_plan_rationale: "Recommendation — reasoning",
  care_plan_instructions: "Recommendation — instructions",
  pain_assessment_answer: "Pain Map exam answer",
  appointment_notes: "Patient's booking note",
  condition_answer: "Health Profile answer",
};

/**
 * The messages the scanner caught, with what was actually written.
 *
 * The text is the point. A signal saying "payment details in 2 messages"
 * with a list of row ids behind it is the same failure as showing a verdict:
 * an admin cannot tell a clinic landline in an instruction from a UPI handle
 * somebody tried to sneak past without reading the sentence. This is the
 * only place a refused message is kept, so it is the only place that
 * distinction can be made.
 *
 * Read-only, like the rest of this tab. Nothing here suspends anyone.
 */
function FlaggedMessages({ flags }: { flags: CommunicationFlagRow[] }) {
  const blocked = flags.filter((f) => f.blocked);
  const delivered = flags.filter((f) => !f.blocked);

  return (
    <SurfaceCard
      title="Messages the check caught"
      icon="fa-comment-slash"
      subtitle="What was written, and whether it was delivered. A phone number in an instruction is usually nothing; a payment handle never is."
    >
      {flags.length === 0 ? (
        <EmptyState
          icon="fa-circle-check"
          title="Nothing caught"
          body="No message has tripped the check. Clinical text full of numbers is deliberately left alone, so a quiet list here is the expected state."
        />
      ) : (
        <>
          {blocked.length > 0 && (
            <div className="mb-4">
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-red-700">
                Refused ({blocked.length})
              </p>
              <ul className="space-y-2">
                {blocked.map((f) => (
                  <li key={f.id}>
                    <FlagCard flag={f} />
                  </li>
                ))}
              </ul>
            </div>
          )}
          {delivered.length > 0 && (
            <div>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                Delivered and recorded ({delivered.length})
              </p>
              <PagedList
                items={delivered.map((f) => ({ id: f.id, node: <FlagCard flag={f} /> }))}
                noun="message"
                storageKey="admin-comm-flags"
              />
            </div>
          )}
        </>
      )}
    </SurfaceCard>
  );
}

function FlagCard({ flag }: { flag: CommunicationFlagRow }) {
  return (
    <div
      className={`rounded-xl border p-3 text-xs ${
        flag.blocked ? "border-red-200 bg-red-50/40" : "border-slate-200"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="font-bold text-slate-900">
          {flag.authorName}
          {flag.patientName && (
            <span className="font-normal text-slate-500"> → {flag.patientName}</span>
          )}
        </p>
        <span className="text-[11px] text-slate-400">
          {SURFACE_LABELS[flag.surface] ?? flag.surface} ·{" "}
          {new Date(flag.createdAt).toLocaleDateString()}
        </span>
      </div>
      <p className="mt-1 text-[11px] font-semibold text-slate-600">{flag.summary}</p>
      {flag.content && (
        <blockquote className="mt-2 border-l-2 border-slate-300 pl-2.5 text-slate-700">
          {flag.content}
        </blockquote>
      )}
    </div>
  );
}

/**
 * Who looked up whose number.
 *
 * Masking without this is theatre -- the therapist still gets the number and
 * nobody can tell afterwards how often. A clinician revealing the number of
 * the patient they are with is the normal case and should read as
 * unremarkable here; the value is that a caseload being copied would not.
 */
function RevealTrail({ reveals }: { reveals: ContactRevealRow[] }) {
  return (
    <SurfaceCard
      title="Contact details shown"
      icon="fa-address-book"
      subtitle="Every time a therapist unmasked a patient's number. Revealing is allowed and expected — this is the record that it happened."
    >
      {reveals.length === 0 ? (
        <EmptyState
          icon="fa-eye-slash"
          title="No reveals yet"
          body="Numbers stay masked on therapist screens until somebody asks for one."
        />
      ) : (
        <PagedList
          items={reveals.map((r) => ({
            id: r.id,
            node: (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 p-2.5 text-xs">
                <span className="text-slate-700">
                  <span className="font-semibold">{r.therapistName}</span> saw{" "}
                  {r.patientName}&apos;s {r.field}
                </span>
                <span className="text-[11px] text-slate-400">
                  {r.reason ? `${r.reason} · ` : ""}
                  {new Date(r.createdAt).toLocaleString()}
                </span>
              </div>
            ),
          }))}
          noun="reveal"
          storageKey="admin-contact-reveals"
        />
      )}
    </SurfaceCard>
  );
}
