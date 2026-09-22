"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "@/lib/useRouter";
import { useSaveSetting } from "@/lib/useSaveSetting";

// The technical shelf, and the reason it exists is the one switch on it.
//
// `entitlement_ledger_authoritative` decides which of two records the app
// believes for a patient's remaining sessions: the older per-purchase counter,
// or the append-only credit ledger written beside it. It is a data-migration
// cutover, kept as a switch rather than a deploy so it can be reversed in a
// second if reconciliation disagrees -- and it sat on Programmes & Home
// Visits, between "does a package lock to one therapist" and "assign a
// therapist automatically", which are decisions about what the clinic sells.
// Its own help text sends the reader to System Health to decide it, which is
// the tell: an owner cannot answer this from anything on the screen it was on.
//
// So it is quarantined here, under a screen that says in its first line not to
// touch it without instructions. Settings is Master Admin only already (see
// SECTION_ACCESS), so no further gate is needed.
//
// A new switch belongs here only if the same two things are true of it: the
// clinic's own judgement cannot answer it, and the answer is about how the app
// works inside rather than about what it sells.
export default function AdminAdvancedTab({
  ledgerAuthoritative,
}: {
  ledgerAuthoritative: boolean;
}) {
  const saveSetting = useSaveSetting();
  const router = useRouter();
  const [optimisticLedger, setOptimisticLedger] = useOptimistic(ledgerAuthoritative);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleToggleLedger() {
    const next = !optimisticLedger;
    setError(null);
    startTransition(async () => {
      setOptimisticLedger(next);
      try {
        await saveSetting("entitlement_ledger_authoritative", next);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save. Please try again.");
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
        <h2 className="font-display text-sm font-bold text-amber-900">
          These do not change what the clinic sells
        </h2>
        <p className="mt-1 text-xs text-amber-900/80">
          Nothing on this screen changes a price, a rule, or anything a patient reads.
          They change how the app keeps its own records, and the right setting is not
          something the clinic can decide by preference. Leave them as they are unless
          you are following instructions.
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h3 className="font-bold text-sm text-slate-800">
              Where a patient&apos;s remaining sessions are counted
            </h3>
            <p className="text-xs text-slate-500 mt-1 max-w-md">
              The app keeps two records of how many sessions a purchase has left: a running
              total on the purchase itself, and a line-by-line history of every session
              taken or given back. Both are always written. This decides which one is shown
              to patients and offered at booking.
            </p>
            <p className="text-xs text-slate-500 mt-2 max-w-md">
              Only move to the history once{" "}
              <span className="font-semibold">System Health</span> has reported no
              accounting mismatches over a real stretch of bookings - and move straight back
              if anything looks wrong. Nothing is lost by switching back.
            </p>
          </div>
          <button
            onClick={handleToggleLedger}
            disabled={isPending}
            className={`text-xs font-semibold px-4 py-2 rounded-lg transition disabled:opacity-60 ${
              optimisticLedger
                ? "bg-teal-700 hover:bg-teal-800 text-white"
                : "bg-slate-200 hover:bg-slate-300 text-slate-800"
            }`}
          >
            {optimisticLedger ? "Session history" : "Running total"}
          </button>
        </div>
        {error && <p className="text-[11px] text-red-600 mt-2">{error}</p>}
      </div>
    </div>
  );
}
