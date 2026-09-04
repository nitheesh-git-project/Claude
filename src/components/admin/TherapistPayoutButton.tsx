"use client";

import { useState } from "react";
import { useRouter } from "@/lib/useRouter";
import { useConfirm } from "@/lib/useConfirm";
import Spinner from "@/components/system/Spinner";

type PayoutMethod = "cash" | "online";
type View = "closed" | "choose" | "confirm";

const METHOD_LABEL: Record<PayoutMethod, string> = { cash: "cash", online: "an online transfer" };
const NOTE_PLACEHOLDER: Record<PayoutMethod, string> = {
  cash: "Optional note (e.g. handed over in person, 30 Jul)",
  online: "Optional note (e.g. UPI reference / UTR number, date sent)",
};

export default function TherapistPayoutButton({
  therapistId,
  owedPaise,
  cashHeldPaise = 0,
}: {
  therapistId: string;
  owedPaise: number;
  // Cash the therapist is already holding from home-visit collections,
  // netted off what this button actually transfers -- the server computes
  // the authoritative figure itself either way, this is only for what the
  // button and confirm dialog say before that call happens.
  cashHeldPaise?: number;
}) {
  const netPayablePaise = Math.max(0, owedPaise - cashHeldPaise);
  const [view, setView] = useState<View>("closed");
  const [method, setMethod] = useState<PayoutMethod>("cash");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settled, setSettled] = useState<{ amountPaise: number; count: number; method: PayoutMethod } | null>(
    null
  );
  const router = useRouter();
  const { confirm, dialog } = useConfirm();

  function openConfirm(m: PayoutMethod) {
    setMethod(m);
    setView("confirm");
  }

  async function handleConfirm() {
    const confirmMessage =
      cashHeldPaise > 0
        ? `Mark ₹${(netPayablePaise / 100).toLocaleString("en-IN")} as paid via ${METHOD_LABEL[method]} to this therapist? (₹${(owedPaise / 100).toLocaleString("en-IN")} owed, minus ₹${(cashHeldPaise / 100).toLocaleString("en-IN")} they're already holding in cash.) This can't be undone.`
        : `Mark ₹${(netPayablePaise / 100).toLocaleString("en-IN")} as paid via ${METHOD_LABEL[method]} to this therapist? This can't be undone.`;
    if (!(await confirm(confirmMessage))) {
      return;
    }
    setLoading(true);
    setError(null);
    const res = await fetch("/api/admin/settle-therapist-payout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ therapistId, method, note: note.trim() || undefined }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Could not record the payout. Please try again.");
      if (res.status === 409) {
        // Someone else (another tab, or another admin) already settled this
        // — refresh so the owed balance reflects that instead of still
        // inviting a second payout for the same sessions.
        router.refresh();
      }
      return;
    }
    // Show what the server actually settled, not the owedPaise this
    // component was rendered with — a payment could have landed in the
    // gap between page load and this click, so the two can differ.
    setSettled({ amountPaise: data.settledAmountPaise, count: data.settledCount, method });
    setView("closed");
    setNote("");
    router.refresh();
  }

  // Gated on owedPaise too, not just the local "did we just settle"
  // flag — this component doesn't remount on router.refresh(), so if new
  // sessions become owed later in the same page view, owedPaise will
  // reflect that on the next server refetch and this stale success
  // banner needs to step aside for a fresh "Pay" button instead of
  // showing forever.
  if (settled && owedPaise <= 0) {
    return (
      <div className="bg-teal-50 border border-teal-200 rounded-lg p-3 text-xs text-teal-900">
        Paid ₹{(settled.amountPaise / 100).toLocaleString("en-IN")} via {METHOD_LABEL[settled.method]}{" "}
        across {settled.count} session{settled.count > 1 ? "s" : ""}.
      </div>
    );
  }

  if (owedPaise <= 0) {
    return (
      <button
        disabled
        className="text-xs font-semibold px-3 py-2 rounded-lg bg-slate-100 text-slate-400 cursor-not-allowed"
      >
        All Paid Out
      </button>
    );
  }

  if (view === "closed") {
    return (
      <button
        onClick={() => setView("choose")}
        className="text-xs font-semibold px-3 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 text-white transition"
      >
        Pay ₹{(netPayablePaise / 100).toLocaleString("en-IN")} to Therapist
      </button>
    );
  }

  if (view === "choose") {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => openConfirm("cash")}
          className="text-xs font-semibold px-3 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 text-white transition"
        >
          Paid by Cash
        </button>
        <button
          onClick={() => openConfirm("online")}
          className="text-xs font-semibold px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-800 text-white transition"
        >
          Paid Online
        </button>
        <button
          onClick={() => setView("closed")}
          className="text-xs font-semibold text-slate-500 px-2"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs space-y-2">
      {error && <p className="text-red-600">{error}</p>}
      <p className="text-slate-600">
        Confirming pays out{" "}
        <strong className="text-slate-900">₹{(netPayablePaise / 100).toLocaleString("en-IN")}</strong> via{" "}
        {METHOD_LABEL[method]} and clears the owed balance
        {cashHeldPaise > 0 && (
          <>
            {" "}
            (₹{(owedPaise / 100).toLocaleString("en-IN")} owed, minus ₹
            {(cashHeldPaise / 100).toLocaleString("en-IN")} already held in cash)
          </>
        )}
        . This records that the payment already happened — it doesn&apos;t send any money itself.
      </p>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={NOTE_PLACEHOLDER[method]}
        rows={2}
        className="w-full p-2 rounded-lg border border-slate-300"
      />
      <div className="flex gap-2">
        <button
          onClick={() => setView("choose")}
          className="bg-slate-200 hover:bg-slate-300 text-slate-800 font-semibold px-3 py-1.5 rounded-lg transition"
        >
          Back
        </button>
        <button
          onClick={handleConfirm}
          disabled={loading}
          className="bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white font-semibold px-3 py-1.5 rounded-lg transition"
        >
          {loading ? (
          <span className="inline-flex items-center gap-1.5">
            <Spinner /> Recording…
          </span>
        ) : (
          `Confirm ${method === "cash" ? "Cash" : "Online"} Payment`
        )}
        </button>
      </div>
      {dialog}
    </div>
  );
}
