"use client";

import { useRef, useState } from "react";
import Modal from "@/components/admin/Modal";
import Spinner from "@/components/system/Spinner";
import { IMPERSONATION_REASON_MIN, IMPERSONATION_TTL_MS } from "@/lib/impersonation";

// "Open their dashboard" on a person's profile.
//
// Rendered only for a Master Admin, and the route checks that again -- the
// button's absence is presentation, and a session cookie can call any route
// directly.
//
// The dialog is not friction for its own sake. What follows this tap is a
// real session as somebody else, in which a mis-click cancels their
// appointment under their own name, so the screen says exactly that before
// it happens and asks for the reason that will sit in the log beside it. The
// reason box is the same ten-character floor an admin credit adjustment
// uses: a log full of "test" answers nothing six months later.
export default function ViewAsUserButton({
  userId,
  userName,
}: {
  userId: string;
  userName: string;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // A synchronous guard: a `disabled` attribute lands a render too late, and
  // a double tap here would mint two sessions and two records of one visit.
  const submitting = useRef(false);

  const minutes = Math.round(IMPERSONATION_TTL_MS / 60_000);
  const tooShort = reason.trim().length < IMPERSONATION_REASON_MIN;

  async function handleStart() {
    if (submitting.current || tooShort) return;
    submitting.current = true;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/start-impersonation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // The id and the reason, and nothing else. Which role this account
        // holds and where the swap lands are re-derived server-side from the
        // profile row -- never trust a role the browser sent.
        body: JSON.stringify({ userId, reason }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        redirectTo?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Could not open that dashboard.");
      // A hard navigation: the session cookies have just been replaced, and a
      // client-side transition would render the next screen against the
      // cache belonging to the account we have just left.
      window.location.href = data.redirectTo ?? "/";
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open that dashboard.");
      submitting.current = false;
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-teal-500 hover:text-teal-700"
      >
        <i aria-hidden className="fa-solid fa-user-secret text-[11px]" />
        Open their dashboard
      </button>

      {open && (
        <Modal
          title={`Sign in as ${userName}`}
          subtitle="You will see their dashboard exactly as they do."
          onClose={() => (busy ? undefined : setOpen(false))}
        >
          <div className="space-y-4">
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
              <p className="text-xs font-bold text-amber-900">
                This is their real account, not a preview.
              </p>
              <ul className="mt-2 space-y-1 text-[11px] leading-relaxed text-amber-800">
                <li>
                  Anything you tap happens for real - a booking, a cancellation, a
                  payment - and their history will record it as theirs.
                </li>
                <li>It ends automatically after {minutes} minutes.</li>
                <li>
                  Your own session comes back when you tap Exit on the bar at the top.
                </li>
              </ul>
            </div>

            <div>
              <label
                htmlFor="impersonation-reason"
                className="block text-xs font-semibold text-slate-700"
              >
                Why do you need to see this dashboard?
              </label>
              <p className="mt-0.5 text-[11px] text-slate-500">
                Stored with your name against it, and readable by every admin on the
                Activity Log.
              </p>
              <textarea
                id="impersonation-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                placeholder="Patient says her session link is missing from her Sessions screen."
                className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 text-xs focus:border-teal-500 focus:outline-none"
              />
            </div>

            {error && <p className="text-[11px] font-semibold text-red-600">{error}</p>}

            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={busy}
                className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleStart}
                disabled={busy || tooShort}
                className="inline-flex items-center gap-2 rounded-lg bg-amber-700 px-4 py-2 text-xs font-bold text-white transition hover:bg-amber-800 disabled:opacity-60"
              >
                {busy && <Spinner />}
                {busy ? "Opening…" : `Sign in as ${userName.split(" ")[0]}`}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
