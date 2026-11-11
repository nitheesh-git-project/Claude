"use client";

import { useRef, useState } from "react";
import Modal from "@/components/admin/Modal";
import Spinner from "@/components/system/Spinner";
import PopupLoading from "@/components/system/PopupLoading";
import { useRouter } from "@/lib/useRouter";
import { formatRupees } from "@/lib/formatMoney";
import { formatClinicDate } from "@/lib/formatDateTime";
import { DELETE_REASONS, DELETE_NOTE_MAX, type MoneySummary } from "@/lib/accountDeletionRecords";

// Deleting an account, on every role's own screen.
//
// One component for all four (the Back office directory, a patient's
// profile, a therapist's, a partner hospital's) because the rule is one rule.
//
// It asks the server first what is behind the account, and shows it:
//   * nothing at all -- the login and the profile are removed permanently;
//   * records (sessions, payments, payouts, clinical notes) -- the person is
//     removed and the records stay. Their login stops working, their contact
//     details are cleared, and every money row is listed here first, so the
//     admin sees exactly what is kept. Afterwards their name carries a
//     "Deleted user" tag whose (i) shows the reason chosen below.
// Either way a reason is required.
//
// The check runs on the **server**, on the tap, rather than being precomputed
// into the row -- a count carried in the page is a count that was true when
// the page rendered, and this one decides what a deletion does.

type Preview = {
  deletable: boolean;
  message: string | null;
  total: number;
  moneyChecked: boolean;
  money: MoneySummary | null;
  alreadyDeleted: boolean;
};

export default function DeleteAccountButton({
  userId,
  name,
  afterDeleteHref,
  compact = false,
}: {
  userId: string;
  /** What the confirmation names. The account's own name, not "this user". */
  name: string;
  /** Where to go once it is gone. A profile page has to leave; a row in a
   *  list only needs the list refreshed. */
  afterDeleteHref?: string;
  /** Sits in a dense row rather than on a profile page. */
  compact?: boolean;
}) {
  const [stage, setStage] = useState<"idle" | "checking" | "confirm" | "blocked" | "gone">("idle");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [keptRecords, setKeptRecords] = useState(false);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  // Synchronous, because a `disabled` attribute lands a render too late and
  // this is the one action that must not run twice.
  const busyRef = useRef(false);
  const router = useRouter();

  const post = (body: Record<string, unknown>) =>
    fetch("/api/admin/delete-account", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, ...body }),
    });

  async function open() {
    setMessage(null);
    setFormError(null);
    setReason("");
    setNote("");
    setPreview(null);
    setStage("checking");
    try {
      let res = await post({ preview: true });
      if (res.status === 401 || res.status === 503) res = await post({ preview: true });
      const data = (await res.json().catch(() => ({}))) as Preview & { error?: string };
      if (!res.ok) {
        setMessage(data.error ?? "Could not check that account.");
        setStage("blocked");
        return;
      }
      setPreview(data);
      setStage("confirm");
    } catch {
      setMessage("Could not reach the server. Nothing has been deleted. Please try again.");
      setStage("blocked");
    }
  }

  async function remove() {
    if (busyRef.current) return;
    if (!reason) {
      setFormError("Choose why this account is being deleted.");
      return;
    }
    if (reason === "other" && note.trim().length < 3) {
      setFormError("Say why in the note when the reason is Other.");
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setFormError(null);
    try {
      let res = await post({ reason, note });
      // The same single retry the create form takes, on the same two
      // statuses and for the same reason: both are answered before anything
      // is touched, so there is nothing to delete twice.
      if (res.status === 401 || res.status === 503) res = await post({ reason, note });
      const data = (await res.json().catch(() => ({}))) as { error?: string; keptRecords?: boolean };
      if (res.status === 400) {
        setFormError(data.error ?? "Check the reason and try again.");
        return;
      }
      if (!res.ok) {
        setMessage(data.error ?? "Could not delete that account.");
        setStage("blocked");
        return;
      }
      setKeptRecords(!!data.keptRecords);
      setStage("gone");
    } catch {
      setMessage("Could not reach the server. Nothing has been deleted. Please try again.");
      setStage("blocked");
      return;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
    // After the control is released, so the button is not held through a
    // full dashboard rebuild -- the teal bar carries that.
    if (afterDeleteHref) router.push(afterDeleteHref);
    else router.refresh();
  }

  const keeps = preview ? !preview.deletable || preview.alreadyDeleted : false;

  return (
    <>
      <button
        type="button"
        onClick={() => void open()}
        className={
          compact
            ? "rounded-lg border border-red-200 px-2.5 py-1.5 text-[11px] font-semibold text-red-700 transition hover:bg-red-50"
            : "rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-50"
        }
      >
        Delete account
      </button>

      {stage === "checking" && (
        <Modal title={`Delete ${name}?`} subtitle="Checking what is behind this account…" onClose={() => setStage("idle")}>
          <PopupLoading />
        </Modal>
      )}

      {stage === "confirm" && preview && (
        <Modal
          title={`Delete ${name}?`}
          subtitle={keeps ? "Their records stay." : "This cannot be undone."}
          onClose={() => setStage("idle")}
        >
          <div className="space-y-4 text-xs text-slate-700" data-testid="delete-account-confirm">
            {keeps ? (
              <>
                <p>
                  <span>This account has records that have to stay</span>
                  {preview.message ? <span>{`: ${preview.message} on file.`}</span> : <span>.</span>}
                </p>
                <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-slate-600">
                  Deleting removes <strong>{name}</strong>: their login stops working and their email and phone are
                  cleared, so the address can sign up again as a new account. Every session, payment and record stays
                  under their name, marked <strong>Deleted user</strong>, with the reason you give below.
                </p>
                <MoneyList preview={preview} />
              </>
            ) : (
              <p>
                Nothing is behind this account - no sessions, payments, programmes, clinical records or back-office
                actions - so the login and the profile are removed permanently.
              </p>
            )}

            <div className="space-y-2">
              <label htmlFor={`delete-reason-${userId}`} className="block font-semibold text-slate-800">
                <span>Why is it being deleted? </span>
                <span className="text-red-600">*</span>
              </label>
              <select
                id={`delete-reason-${userId}`}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs"
              >
                <option value="">Choose a reason</option>
                {DELETE_REASONS.map((r) => (
                  <option key={r.key} value={r.key}>
                    {r.label}
                  </option>
                ))}
              </select>
              <label htmlFor={`delete-note-${userId}`} className="block font-semibold text-slate-800">
                {reason === "other" ? "Note (required)" : "Note (optional)"}
              </label>
              <textarea
                id={`delete-note-${userId}`}
                value={note}
                maxLength={DELETE_NOTE_MAX}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder="Anything the next admin should know."
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
              />
              {formError && (
                <p role="alert" className="font-semibold text-red-700">
                  {formError}
                </p>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void remove()}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-red-700 disabled:opacity-60"
              >
                {busy && <Spinner size={12} />}
                {busy ? "Deleting…" : keeps ? "Delete user, keep records" : "Delete permanently"}
              </button>
              <button
                type="button"
                onClick={() => setStage("idle")}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Keep the account
              </button>
            </div>
          </div>
        </Modal>
      )}

      {stage === "blocked" && (
        <Modal title="Not deleted" subtitle={name} onClose={() => setStage("idle")}>
          <div className="space-y-4 text-xs">
            <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-900">{message}</p>
            <button
              type="button"
              onClick={() => setStage("idle")}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Close
            </button>
          </div>
        </Modal>
      )}

      {stage === "gone" && (
        <Modal title="Account deleted" subtitle={name} onClose={() => setStage("idle")}>
          <p className="text-xs text-slate-700">
            {keptRecords
              ? `${name} can no longer sign in. Their records stay, marked Deleted user with the reason you gave. The entry naming who deleted it is in the log.`
              : `${name} has been removed. The entry naming who deleted it is in the log.`}
          </p>
        </Modal>
      )}
    </>
  );
}

function MoneyList({ preview }: { preview: Preview }) {
  if (!preview.moneyChecked || !preview.money) {
    return (
      <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-900">
        Could not read their money records just now. Deleting will try again and stop if it still cannot.
      </p>
    );
  }
  const money = preview.money;
  if (money.count === 0) {
    return <p className="text-slate-500">No payments, refunds or payouts.</p>;
  }
  return (
    <section data-testid="delete-account-money" className="rounded-xl border border-slate-200">
      <h3 className="border-b border-slate-100 px-3 py-2 font-bold text-slate-900">Money records that stay</h3>
      <ul className="divide-y divide-slate-100">
        {money.byKind.map((k) => (
          <li key={k.kind} className="flex items-center justify-between gap-2 px-3 py-1.5">
            <span>{`${k.label} × ${k.count}`}</span>
            <span className="font-semibold tabular-nums">{formatRupees(k.amountPaise)}</span>
          </li>
        ))}
      </ul>
      <details className="border-t border-slate-100 px-3 py-2">
        <summary className="cursor-pointer font-semibold text-slate-700">{`Show all ${money.count}`}</summary>
        <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto">
          {money.records.map((r, i) => (
            <li key={i} className="flex flex-wrap items-baseline justify-between gap-x-2 text-[11px]">
              <span className="min-w-0 [overflow-wrap:anywhere]">
                {`${r.label}${r.status ? ` · ${r.status}` : ""}${r.at ? ` · ${formatClinicDate(r.at)}` : ""}${r.reference ? ` · ${r.reference}` : ""}`}
              </span>
              <span className="font-semibold tabular-nums">{formatRupees(r.amountPaise)}</span>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
