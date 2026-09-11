"use client";

import { useState } from "react";
import { formatClinicDateTime } from "@/lib/formatDateTime";
import { useRouter } from "@/lib/useRouter";
import SystemHealthCard from "@/components/admin/SystemHealthCard";
import { EmptyState } from "@/components/dashboard/SurfaceCard";
import type { AccountingHealth } from "@/lib/accountingHealth";
import type { GoogleConnectionStatus } from "@/lib/googleConnectionHealth";
import {
  buildSystemHealth,
  summarizeHealth,
  type HealthCheck,
  type HealthStatus,
} from "@/lib/systemHealth";

// Settings -> System Health.
//
// Five checks, one shape each, and a verdict at the top so "is anything
// wrong?" is answered before any of them is read. What each check means and
// how to fix it is worked out in src/lib/systemHealth.ts, which is where to
// change the wording or add a sixth check -- this file only draws it.
//
// It owns the two fix buttons (Retry a session's calendar event, Open a
// meeting's door) because both are the same shape: one appointment id, one
// route, refresh, and the error kept beside the row it belongs to rather
// than at the top of the screen where you cannot tell which row it is about.

export type GoogleMeetSyncIssue = {
  id: string;
  sessionCode: string | null;
  slotTime: string | null;
  patientName: string;
  therapistName: string | null;
  error: string | null;
  // How many times the automatic sweep (src/lib/retryDueMeetSyncs.ts) has
  // already tried this one, and whether it has hit its cap and stopped.
  autoRetryAttempts: number;
  autoRetryExhausted: boolean;
};

function formatInr(paise: number) {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

const STRIP_TONE: Record<HealthStatus, string> = {
  healthy: "border-emerald-200 bg-emerald-50",
  attention: "border-amber-300 bg-amber-50",
  broken: "border-red-300 bg-red-50",
  off: "border-slate-200 bg-white",
  unknown: "border-slate-200 bg-white",
};

const STRIP_ICON: Record<HealthStatus, { icon: string; tone: string }> = {
  healthy: { icon: "fa-circle-check", tone: "text-emerald-600" },
  attention: { icon: "fa-triangle-exclamation", tone: "text-amber-600" },
  broken: { icon: "fa-circle-exclamation", tone: "text-red-600" },
  off: { icon: "fa-circle-minus", tone: "text-slate-400" },
  unknown: { icon: "fa-circle-question", tone: "text-slate-400" },
};

export default function AdminSystemHealthTab({
  syncIssues,
  waitingRoomIssues,
  webhookSecretConfigured,
  googleConnection,
  googleCheckedAt,
  accounting,
  openAccessEnabled,
  canFix,
  renderedAt,
}: {
  syncIssues: GoogleMeetSyncIssue[];
  waitingRoomIssues: GoogleMeetSyncIssue[];
  webhookSecretConfigured: boolean;
  googleConnection?: GoogleConnectionStatus;
  /** When the Google probe last ran, epoch ms. Null when it never has --
   *  that check is the one whose answer is cached for minutes at a time, so
   *  it prints its own age rather than the page's. */
  googleCheckedAt: number | null;
  accounting: AccountingHealth;
  openAccessEnabled: boolean;
  /** Whether this admin's scope may call the fix routes. Both are
   *  requireAdminScope("settings"), so a scope that only reads gets the
   *  findings without a button that would 403 with nothing to explain it. */
  canFix: boolean;
  /** When this page was rendered, epoch ms. Every check but Google is worked
   *  out fresh at that moment. */
  renderedAt: number;
}) {
  const router = useRouter();
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [retryErrors, setRetryErrors] = useState<Record<string, string>>({});
  const [fixingId, setFixingId] = useState<string | null>(null);
  const [fixErrors, setFixErrors] = useState<Record<string, string>>({});

  const checks = buildSystemHealth({
    webhookSecretConfigured,
    google: googleConnection,
    syncIssues,
    waitingRoomIssues,
    accounting,
    openAccessEnabled,
  });
  const summary = summarizeHealth(checks);
  const byId = (id: HealthCheck["id"]) => checks.find((c) => c.id === id)!;

  async function post(
    url: string,
    appointmentId: string,
    fallback: string,
    setBusy: (id: string | null) => void,
    setErrors: (fn: (prev: Record<string, string>) => Record<string, string>) => void
  ) {
    setBusy(appointmentId);
    setErrors((prev) => {
      const next = { ...prev };
      delete next[appointmentId];
      return next;
    });
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appointmentId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? fallback);
      router.refresh();
    } catch (e) {
      setErrors((prev) => ({
        ...prev,
        [appointmentId]: e instanceof Error ? e.message : fallback,
      }));
    } finally {
      setBusy(null);
    }
  }

  const stripIcon = STRIP_ICON[summary.worst];

  return (
    <div className="space-y-5">
      {/* The verdict. An owner who reads only this line has still been told
          whether their clinic needs them, and the chips take them to the
          exact card the count counted -- the same rule the dashboard's
          other counts follow. */}
      <div className={`rounded-2xl border p-5 shadow-sm sm:p-6 ${STRIP_TONE[summary.worst]}`}>
        <div className="flex items-start gap-3">
          <i aria-hidden className={`fa-solid ${stripIcon.icon} mt-0.5 text-xl ${stripIcon.tone}`} />
          <div className="min-w-0">
            <h2 className="font-display text-lg font-bold text-slate-800">{summary.headline}</h2>
            <p className="mt-0.5 text-xs leading-relaxed text-slate-600">{summary.blurb}</p>
            {summary.attention.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {summary.attention.map((c) => (
                  <a
                    key={c.id}
                    href={`#health-${c.id}`}
                    className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700 transition hover:border-teal-500 hover:text-teal-700"
                  >
                    <i
                      aria-hidden
                      className={`fa-solid ${c.status === "broken" ? "fa-circle-exclamation text-red-500" : "fa-triangle-exclamation text-amber-500"} text-[9px]`}
                    />
                    {c.label}
                    {c.count > 1 && (
                      <span className="rounded-full bg-slate-100 px-1.5 text-[10px]">{c.count}</span>
                    )}
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
        <p className="mt-4 border-t border-slate-200/70 pt-3 text-[11px] text-slate-500">
          Nothing on this screen is a setting — it is the app reporting on itself. Tap{" "}
          <i aria-hidden className="fa-solid fa-info text-[9px]" /> on any check to see what it
          watches and what would go wrong without it.
        </p>
      </div>

      <SystemHealthCard check={byId("payments")} checkedAt={renderedAt} />

      <SystemHealthCard check={byId("google")} checkedAt={googleCheckedAt ?? renderedAt} />

      <SystemHealthCard check={byId("sync")} checkedAt={renderedAt}>
        {syncIssues.length === 0 ? (
          <EmptyState
            icon="fa-circle-check"
            title="Nothing waiting"
            body="Every confirmed session has its calendar event and its video link."
          />
        ) : (
          <div className="space-y-2">
            {syncIssues.map((issue) => (
              <IssueRow
                key={issue.id}
                issue={issue}
                error={retryErrors[issue.id]}
                busy={retryingId === issue.id}
                canFix={canFix}
                actionLabel="Retry"
                busyLabel="Retrying…"
                onAction={() =>
                  post(
                    "/api/admin/retry-meet-sync",
                    issue.id,
                    "Retry failed. Please try again.",
                    setRetryingId,
                    setRetryErrors
                  )
                }
              />
            ))}
          </div>
        )}
      </SystemHealthCard>

      <SystemHealthCard check={byId("waiting_room")} checkedAt={renderedAt}>
        {waitingRoomIssues.length === 0 ? (
          <EmptyState
            icon="fa-circle-check"
            title="Nobody is knocking"
            body="Patients and therapists walk straight into their sessions."
          />
        ) : (
          <div className="space-y-2">
            {waitingRoomIssues.map((issue) => (
              <IssueRow
                key={issue.id}
                issue={issue}
                error={fixErrors[issue.id]}
                busy={fixingId === issue.id}
                canFix={canFix}
                actionLabel="Open the door"
                busyLabel="Opening…"
                onAction={() =>
                  post(
                    "/api/admin/open-meet-access",
                    issue.id,
                    "Could not open the meeting.",
                    setFixingId,
                    setFixErrors
                  )
                }
              />
            ))}
          </div>
        )}
      </SystemHealthCard>

      <SystemHealthCard check={byId("accounting")} checkedAt={renderedAt}>
        <AccountingFindings health={accounting} />
      </SystemHealthCard>
    </div>
  );
}

function IssueRow({
  issue,
  error,
  busy,
  canFix,
  actionLabel,
  busyLabel,
  onAction,
}: {
  issue: GoogleMeetSyncIssue;
  error?: string;
  busy: boolean;
  canFix: boolean;
  actionLabel: string;
  busyLabel: string;
  onAction: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3">
      <div className="min-w-0">
        <p className="text-xs font-semibold text-slate-800">
          {issue.patientName}
          {issue.therapistName ? ` → ${issue.therapistName}` : ""}
        </p>
        <p className="mt-0.5 text-[11px] text-slate-500">
          <span className="font-mono text-slate-400">{issue.sessionCode ?? "—"}</span>
          {" · "}
          {issue.slotTime
            ? formatClinicDateTime(issue.slotTime)
            : "Slot to be confirmed"}
        </p>
        {/* Separates "the app has not got to this yet" from "the app has
            given up and this needs a person". Without it every row looks
            equally like something that might still fix itself, and the
            genuinely stuck ones never get looked at. */}
        {issue.autoRetryExhausted ? (
          <p className="mt-1 text-[11px] font-semibold text-amber-700">
            Stopped retrying after {issue.autoRetryAttempts} tries — this one needs you
          </p>
        ) : issue.autoRetryAttempts > 0 ? (
          <p className="mt-1 text-[11px] text-slate-500">
            Tried {issue.autoRetryAttempts}{" "}
            {issue.autoRetryAttempts === 1 ? "time" : "times"} so far — still trying
          </p>
        ) : null}
        {issue.error && (
          <p className="mt-1 break-words text-[11px] text-slate-400">
            Google said: {issue.error}
          </p>
        )}
        {error && <p className="mt-1 break-words text-[11px] text-red-600">{error}</p>}
      </div>
      {canFix && (
        <button
          onClick={onAction}
          disabled={busy}
          className="shrink-0 rounded-lg bg-teal-700 px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-teal-800 disabled:opacity-60"
        >
          {busy ? busyLabel : actionLabel}
        </button>
      )}
    </div>
  );
}

// The three accounting findings, listed under their own card. Deliberately
// no fix button: each one is either a data problem or somebody working
// outside the normal flow, and both want a person rather than a sweep
// quietly papering over them.
function AccountingFindings({ health }: { health: AccountingHealth }) {
  if (!health.available) {
    return (
      <EmptyState
        icon="fa-database"
        title="Not reporting yet"
        body="The tables this check reads have not been applied to this database."
      />
    );
  }

  const { balanceMismatches, unmatchedPayments, sessionsWithoutBacking } = health;
  if (
    balanceMismatches.length === 0 &&
    unmatchedPayments.length === 0 &&
    sessionsWithoutBacking.length === 0
  ) {
    return (
      <EmptyState
        icon="fa-circle-check"
        title="Everything adds up"
        body="Balances match their history, every payment is attached to something, and every delivered session has something behind it."
      />
    );
  }

  return (
    <div className="space-y-4">
      <Finding
        title="Balances that disagree"
        rows={balanceMismatches.map((m) => ({
          key: m.entitlementId,
          left: m.entitlementId.slice(0, 8),
          right: `says ${m.cachedAvailable} left · history says ${m.ledgerAvailable}${
            m.legacyAvailable !== null ? ` · older count ${m.legacyAvailable}` : ""
          }`,
        }))}
      />
      <Finding
        title="Payments with nothing attached"
        rows={unmatchedPayments.map((p) => ({
          key: p.id,
          left: p.razorpayPaymentId ?? p.id.slice(0, 8),
          right: `${formatInr(p.amountPaise)} · ${
            p.capturedAt ? formatClinicDateTime(p.capturedAt) : "no capture time"
          }`,
        }))}
      />
      <Finding
        title="Delivered sessions with nothing behind them"
        rows={sessionsWithoutBacking.map((s) => ({
          key: s.id,
          left: s.sessionCode ?? s.id.slice(0, 8),
          right: s.slotTime ? formatClinicDateTime(s.slotTime) : "no slot time",
        }))}
      />
    </div>
  );
}

function Finding({
  title,
  rows,
}: {
  title: string;
  rows: { key: string; left: string; right: string }[];
}) {
  if (rows.length === 0) {
    return (
      <p className="text-xs text-slate-500">
        <i aria-hidden className="fa-solid fa-circle-check mr-1.5 text-[10px] text-emerald-500" />
        {title} — none
      </p>
    );
  }
  return (
    <div>
      <p className="text-xs font-bold text-amber-700">
        {title} — {rows.length}
      </p>
      <div className="mt-2 space-y-1">
        {rows.map((r) => (
          <div
            key={r.key}
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2"
          >
            <p className="font-mono text-[11px] font-semibold text-slate-700">{r.left}</p>
            <p className="text-[11px] text-slate-600">{r.right}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
