"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

function minDateTimeLocal(hoursAhead: number) {
  const d = new Date(Date.now() + hoursAhead * 60 * 60 * 1000);
  d.setSeconds(0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

export default function BookWithPackageForm({ packagePurchaseId }: { packagePurchaseId: string }) {
  const [open, setOpen] = useState(false);
  const [slotDateTime, setSlotDateTime] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!slotDateTime) return;
    setLoading(true);
    setError(null);
    const res = await fetch("/api/appointments/book-with-package", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        packagePurchaseId,
        slotDateTime: new Date(slotDateTime).toISOString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        notes,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Could not book this session. Please try again.");
      return;
    }
    setOpen(false);
    setSlotDateTime("");
    setNotes("");
    router.refresh();
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition"
      >
        Book a Session
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2 mt-2 text-xs"
    >
      {error && <p className="text-red-600">{error}</p>}
      <div>
        <label className="block font-semibold mb-1">Preferred Date &amp; Time</label>
        <input
          type="datetime-local"
          value={slotDateTime}
          min={minDateTimeLocal(12)}
          onChange={(e) => setSlotDateTime(e.target.value)}
          required
          className="w-full p-2 rounded-lg border border-slate-300"
        />
      </div>
      <div>
        <label className="block font-semibold mb-1">
          Notes <span className="font-normal text-slate-400">(optional)</span>
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="w-full p-2 rounded-lg border border-slate-300"
        />
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="bg-slate-200 hover:bg-slate-300 text-slate-800 font-semibold px-3 py-1.5 rounded-lg transition"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading}
          className="bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white font-semibold px-3 py-1.5 rounded-lg transition"
        >
          {loading ? "Booking..." : "Confirm Booking"}
        </button>
      </div>
    </form>
  );
}
