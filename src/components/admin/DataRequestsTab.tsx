"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { formatClinicDateTime } from "@/lib/formatDateTime";
import {
  DATA_REQUEST_STATUS_LABELS,
  GRIEVANCE_CATEGORY_LABELS,
  GRIEVANCE_STATUS_LABELS,
  allowedDataRequestMoves,
  allowedGrievanceMoves,
  deletionDue,
  grievanceDue,
  needsNote,
  type DataRequestStatus,
  type GrievanceCategory,
  type GrievanceStatus,
} from "@/lib/dataRequests";

// People -> Data requests: account deletion requests and grievances, each
// with its legal deadline. Self-fetching (GET /api/admin/data-requests,
// people scope). A desk that can only read People sees the cases and no
// buttons (`canManage`). A failed read says so, never an empty queue.

type Person = { name: string | null; email: string | null; deleted: boolean } | null;
type Deletion = {
  id: string;
  reference: string;
  user_id: string | null;
  role: string;
  status: DataRequestStatus;
  reason: string | null;
  resolution_note: string | null;
  created_at: string;
  resolved_at: string | null;
  person: Person;
};
type Grievance = {
  id: string;
  reference: string;
  name: string;
  email: string;
  phone: string | null;
  category: GrievanceCategory;
  booking_reference: string | null;
  message: string;
  status: GrievanceStatus;
  resolution_note: string | null;
  created_at: string;
};
type Payload = {
  deletions: Deletion[];
  grievances: Grievance[];
  exports: { reference: string; role: string; created_at: string; person: Person }[];
};

const MOVE_LABEL: Record<string, string> = {
  in_progress: "Start working on it",
  completed: "Mark deleted",
  rejected: "Decline",
  acknowledged: "Acknowledge",
  resolved: "Resolve",
};

function personHref(userId: string | null, role: string): string | null {
  if (!userId) return null;
  if (role === "patient") return `/admin/dashboard/patients/${userId}`;
  if (role === "therapist") return `/admin/dashboard/therapists/${userId}`;
  return null;
}

function DueChip({ label, overdue }: { label: string; overdue: boolean }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
        overdue ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-900"
      }`}
    >
      {label}
    </span>
  );
}

function MoveButtons({
  moves,
  onMove,
  busy,
}: {
  moves: string[];
  onMove: (to: string, note: string) => Promise<void>;
  busy: boolean;
}) {
  const [pending, setPending] = useState<string | null>(null);
  const [note, setNote] = useState("");
  if (moves.length === 0) return null;
  if (pending) {
    return (
      <div className="mt-3 space-y-2">
        <label className="block text-xs">
          <span className="mb-1 block font-semibold text-slate-800">
            {pending === "rejected" ? "Why is it declined? The person is told." : pending === "resolved" ? "How was it resolved?" : "Note (optional)"}
          </span>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={2000} className="w-full rounded-lg border border-slate-300 p-2 text-sm" />
        </label>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy || (needsNote(pending as DataRequestStatus) && note.trim().length < 3)}
            onClick={() => void onMove(pending, note).then(() => setPending(null))}
            className="min-h-10 rounded-lg bg-teal-700 px-3 text-xs font-semibold text-white disabled:opacity-50"
          >
            {busy ? "Saving…" : `Confirm: ${MOVE_LABEL[pending] ?? pending}`}
          </button>
          <button type="button" onClick={() => setPending(null)} className="min-h-10 rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-700">
            Cancel
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {moves.map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => {
            setNote("");
            setPending(m);
          }}
          className={`min-h-10 rounded-lg px-3 text-xs font-semibold ${
            m === "rejected" ? "border border-red-200 text-red-700 hover:bg-red-50" : "border border-slate-300 text-slate-800 hover:bg-slate-50"
          }`}
        >
          {MOVE_LABEL[m] ?? m}
        </button>
      ))}
    </div>
  );
}

export default function DataRequestsTab({ canManage }: { canManage: boolean }) {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showClosed, setShowClosed] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/admin/data-requests", { cache: "no-store" });
      const body = (await res.json().catch(() => null)) as Payload | { error?: string } | null;
      if (!res.ok || !body || !("deletions" in body)) {
        setError((body && "error" in body && body.error) || "The data requests could not be loaded.");
        return;
      }
      setData(body);
    } catch {
      setError("We couldn't reach the server. Check your connection and try again.");
    }
  }, []);

  useEffect(() => {
    // Fetching on mount is what this effect is for.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function move(type: "deletion" | "grievance", id: string, to: string, note: string) {
    setBusy(true);
    setActionError(null);
    try {
      const res = await fetch("/api/admin/data-requests/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, id, to, note }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) setActionError(body.error ?? "That didn't save. Please try again.");
      await load();
    } catch {
      setActionError("We couldn't reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return (
      <div role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        {error}{" "}
        <button type="button" onClick={() => void load()} className="font-semibold underline">
          Try again
        </button>
      </div>
    );
  }
  if (!data) return <p className="text-sm text-slate-600">Loading…</p>;

  const isOpenDeletion = (d: Deletion) => d.status === "open" || d.status === "in_progress";
  const deletions = data.deletions.filter((d) => showClosed || isOpenDeletion(d));
  const grievances = data.grievances.filter((g) => showClosed || g.status !== "resolved");
  const openCount = data.deletions.filter(isOpenDeletion).length + data.grievances.filter((g) => g.status !== "resolved").length;

  return (
    <div className="space-y-6" data-testid="data-requests">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">
          {openCount === 0 ? "Nothing waiting." : `${openCount} waiting.`} Deletions are due within 30 days; a complaint is
          acknowledged within 48 hours and resolved within 30 days.
        </p>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} className="h-4 w-4 accent-teal-700" />
          Show closed
        </label>
      </div>
      {actionError && <p role="alert" className="text-sm text-red-700">{actionError}</p>}

      <section>
        <h3 className="mb-2 font-display text-base font-bold text-slate-900">Account deletion requests</h3>
        {deletions.length === 0 ? (
          <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">No deletion requests{showClosed ? "" : " waiting"}.</p>
        ) : (
          <ul className="space-y-3">
            {deletions.map((d) => {
              const due = deletionDue(d);
              const href = personHref(d.user_id, d.role);
              const who = d.person?.name || d.person?.email || (d.user_id ? "Unknown person" : "Account already removed");
              return (
                <li key={d.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-semibold text-slate-700">{d.reference}</span>
                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-700">{DATA_REQUEST_STATUS_LABELS[d.status]}</span>
                    {due && <DueChip label={due.label} overdue={due.overdue} />}
                  </div>
                  <p className="mt-2 text-sm text-slate-900">
                    {href ? (
                      <Link href={href} className="font-semibold text-teal-700 underline underline-offset-2">
                        {who}
                      </Link>
                    ) : (
                      <span className="font-semibold">{who}</span>
                    )}{" "}
                    <span className="text-slate-600">· {d.role} · asked {formatClinicDateTime(d.created_at)}</span>
                  </p>
                  {d.reason && <p className="mt-1 text-sm text-slate-700">&ldquo;{d.reason}&rdquo;</p>}
                  {d.resolution_note && <p className="mt-1 text-xs text-slate-600">Note: {d.resolution_note}</p>}
                  {canManage && isOpenDeletion(d) && (
                    <>
                      <p className="mt-2 text-xs text-slate-600">
                        Delete the account from the person&apos;s page (Master Admin), then mark it deleted here.
                      </p>
                      <MoveButtons moves={allowedDataRequestMoves(d.status)} busy={busy} onMove={(to, note) => move("deletion", d.id, to, note)} />
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <h3 className="mb-2 font-display text-base font-bold text-slate-900">Grievances</h3>
        {grievances.length === 0 ? (
          <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">No grievances{showClosed ? "" : " waiting"}.</p>
        ) : (
          <ul className="space-y-3">
            {grievances.map((g) => {
              const due = grievanceDue(g);
              return (
                <li key={g.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-semibold text-slate-700">{g.reference}</span>
                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-700">{GRIEVANCE_STATUS_LABELS[g.status]}</span>
                    {due && <DueChip label={`${due.step === "acknowledge" ? "Acknowledge" : "Resolve"}: ${due.label}`} overdue={due.overdue} />}
                  </div>
                  <p className="mt-2 text-sm text-slate-900">
                    <span className="font-semibold">{g.name}</span>{" "}
                    <span className="text-slate-600">
                      · <a href={`mailto:${g.email}`} className="text-teal-700 underline underline-offset-2">{g.email}</a>
                      {g.phone ? ` · ${g.phone}` : ""} · {formatClinicDateTime(g.created_at)}
                    </span>
                  </p>
                  <p className="mt-1 text-xs font-semibold text-slate-700">
                    {GRIEVANCE_CATEGORY_LABELS[g.category]}
                    {g.booking_reference ? ` · Ref ${g.booking_reference}` : ""}
                  </p>
                  <p className="mt-2 whitespace-pre-line text-sm text-slate-800">{g.message}</p>
                  {g.resolution_note && <p className="mt-2 text-xs text-slate-600">Resolution: {g.resolution_note}</p>}
                  {canManage && <MoveButtons moves={allowedGrievanceMoves(g.status)} busy={busy} onMove={(to, note) => move("grievance", g.id, to, note)} />}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <h3 className="mb-2 font-display text-base font-bold text-slate-900">Recent data downloads</h3>
        {data.exports.length === 0 ? (
          <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">Nobody has downloaded their data yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white text-sm">
            {data.exports.map((x) => (
              <li key={x.reference} className="flex flex-wrap justify-between gap-2 px-4 py-2.5">
                <span className="text-slate-900">
                  {x.person?.name || x.person?.email || "Account removed"} <span className="text-slate-600">· {x.role}</span>
                </span>
                <span className="text-slate-600">
                  {formatClinicDateTime(x.created_at)} · <span className="font-mono text-xs">{x.reference}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
