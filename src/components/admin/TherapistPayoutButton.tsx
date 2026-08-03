"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type View = "closed" | "choose" | "cash" | "online-soon";

export default function TherapistPayoutButton({
  therapistId,
  owedPaise,
}: {
  therapistId: string;
  owedPaise: number;
}) {
  const [view, setView] = useState<View>("closed");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleConfirmCash() {
    if (
      !window.confirm(
        `Mark ₹${(owedPaise / 100).toLocaleString("en-IN")} as paid in cash to this therapist? This can't be undone.`
      )
    ) {
      return;
    }
    setLoading(true);
    setError(null);
    const res = await fetch("/api/admin/settle-therapist-payout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ therapistId, method: "cash", note: note.trim() || undefined }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Could not record the payout. Please try again.");
      return;
    }
    setView("closed");
    setNote("");
    router.refresh();
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
        Pay ₹{(owedPaise / 100).toLocaleString("en-IN")} to Therapist
      </button>
    );
  }

  if (view === "choose") {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setView("cash")}
          className="text-xs font-semibold px-3 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 text-white transition"
        >
          Pay by Cash
        </button>
        <button
          onClick={() => setView("online-soon")}
          className="text-xs font-semibold px-3 py-2 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-800 transition"
        >
          Online Payment
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

  if (view === "online-soon") {
    return (
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs space-y-2">
        <p className="text-slate-500">
          Online payouts aren&apos;t available yet — coming soon.
        </p>
        <button
          onClick={() => setView("choose")}
          className="text-teal-700 font-semibold hover:underline"
        >
          Back
        </button>
      </div>
    );
  }

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs space-y-2">
      {error && <p className="text-red-600">{error}</p>}
      <p className="text-slate-600">
        Confirming pays out{" "}
        <strong className="text-slate-900">₹{(owedPaise / 100).toLocaleString("en-IN")}</strong>{" "}
        in cash and clears the owed balance.
      </p>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Optional note (e.g. handed over in person, 30 Jul)"
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
          onClick={handleConfirmCash}
          disabled={loading}
          className="bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white font-semibold px-3 py-1.5 rounded-lg transition"
        >
          {loading ? "Recording..." : "Confirm Cash Payment"}
        </button>
      </div>
    </div>
  );
}
