"use client";

import { useRef, useState } from "react";
import Modal from "@/components/admin/Modal";
import Spinner from "@/components/system/Spinner";
import { useRouter } from "@/lib/useRouter";

// Deleting an account, on every role's own screen.
//
// One component for all four (the Back office directory, a patient's
// profile, a therapist's, a partner hospital's) because the rule is one
// rule: an account with no history goes, and one with history is refused
// with what it has named and suspension offered. Four copies of that would
// be four chances to word the refusal differently on the one action with no
// undo.
//
// Two rules about the shape. The confirmation is a **dialog**, not an inline
// line beside the button, for the reason the Conditions delete was rewritten
// for: the refusal is a paragraph, and an 11px string clipped beside a
// button is how a refusal that did fire gets reported as a button that did
// nothing. And the check runs on the **server**, on the tap, rather than
// being precomputed into the row -- a count carried in the page is a count
// that was true when the page rendered, and this one decides whether a
// deletion is safe.
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
  const [stage, setStage] = useState<"idle" | "confirm" | "blocked" | "gone">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Synchronous, because a `disabled` attribute lands a render too late and
  // this is the one action that must not run twice.
  const busyRef = useRef(false);
  const router = useRouter();

  async function remove() {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setMessage(null);
    try {
      const send = () =>
        fetch("/api/admin/delete-account", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId }),
        });
      let res = await send();
      // The same single retry the create form takes, on the same two
      // statuses and for the same reason: both are answered before anything
      // is touched, so there is nothing to delete twice.
      if (res.status === 401 || res.status === 503) res = await send();

      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        blocked?: boolean;
      };
      if (!res.ok) {
        setMessage(data.error ?? "Could not delete that account.");
        setStage("blocked");
        return;
      }
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

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setMessage(null);
          setStage("confirm");
        }}
        className={
          compact
            ? "rounded-lg border border-red-200 px-2.5 py-1.5 text-[11px] font-semibold text-red-700 transition hover:bg-red-50"
            : "rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-50"
        }
      >
        Delete account
      </button>

      {stage === "confirm" && (
        <Modal
          title={`Delete ${name}?`}
          subtitle="This cannot be undone."
          onClose={() => setStage("idle")}
        >
          <div className="space-y-4 text-xs text-slate-700">
            <p>
              The login is removed permanently. This only works for an account with{" "}
              <strong>no history at all</strong> — no sessions, payments, programmes,
              clinical records or back-office actions. If it has any, nothing is deleted
              and this will tell you what is there.
            </p>
            <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-slate-600">
              Looking to stop somebody signing in? <strong>Suspend</strong> them instead.
              The account stops working and everything they did stays attributable to
              them, which is what the books and the audit trail are built on.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={remove}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-red-700 disabled:opacity-60"
              >
                {busy && <Spinner size={12} />}
                {busy ? "Deleting…" : "Delete permanently"}
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
        <Modal
          title="Not deleted"
          subtitle={name}
          onClose={() => setStage("idle")}
        >
          <div className="space-y-4 text-xs">
            <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-900">
              {message}
            </p>
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
            {name} has been removed. The entry naming who deleted it is in the log.
          </p>
        </Modal>
      )}
    </>
  );
}
