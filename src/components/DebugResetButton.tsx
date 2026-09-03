"use client";

import { useState, useTransition } from "react";
import { useRouter } from "@/lib/useRouter";

// The reset control in the debug bar. Everything about it is deliberately
// awkward: it is red, it is behind a typed phrase, and it says out loud what
// survives and what does not. A one-tap wipe is a wipe that eventually
// happens by accident.
//
// The button appears for anyone who can see the debug bar, but seeing it and
// being able to use it are different things -- /api/admin/debug-reset answers
// 404 unless ALLOW_DEBUG_DATA_RESET is set on the server, and 403 to anyone
// who is not a full-scope admin. The UI never decides this.

const PHRASE = "RESET ALL DATA";

export default function DebugResetButton() {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleReset() {
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/admin/debug-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        keepalive: true,
        body: JSON.stringify({ confirm: typed.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          res.status === 404
            ? "Reset is switched off on this server (ALLOW_DEBUG_DATA_RESET is not set)."
            : data.error ?? "Could not reset."
        );
        return;
      }
      setDone(
        `Done. ${data.accountsDeleted ?? 0} account${
          data.accountsDeleted === 1 ? "" : "s"
        } deleted, ${data.adminsKept ?? 0} admin${data.adminsKept === 1 ? "" : "s"} kept.`
      );
      setTyped("");
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setDone(null);
        }}
        className="rounded-lg bg-red-900 px-2.5 py-1.5 text-[11px] font-semibold text-red-100 transition hover:bg-red-800"
        title="Empty the database, keeping admin accounts"
      >
        Reset data
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-red-800 bg-red-950/60 px-2.5 py-1.5">
      <span className="text-[11px] text-red-200">
        Deletes <strong>everything</strong> — people, sessions, purchases, catalog, settings.
        Admin logins survive. No undo.
      </span>
      <input
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        placeholder={PHRASE}
        aria-label={`Type ${PHRASE} to confirm`}
        className="w-40 rounded border border-red-700 bg-slate-900 px-2 py-1 font-mono text-[11px] text-red-100 placeholder:text-red-400/60"
      />
      <button
        type="button"
        onClick={handleReset}
        disabled={isPending || typed.trim() !== PHRASE}
        className="rounded bg-red-700 px-2.5 py-1 text-[11px] font-semibold text-white transition hover:bg-red-600 disabled:opacity-40"
      >
        {isPending ? "Resetting…" : "Reset"}
      </button>
      <button
        type="button"
        onClick={() => {
          setOpen(false);
          setTyped("");
          setError(null);
        }}
        className="text-[11px] text-red-300 hover:underline"
      >
        Cancel
      </button>
      {error && <span className="text-[11px] font-semibold text-red-300">{error}</span>}
      {done && <span className="text-[11px] font-semibold text-teal-300">{done}</span>}
    </div>
  );
}
