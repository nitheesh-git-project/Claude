"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "@/lib/useRouter";

export default function ReferralCapacityNoteForm({
  referralId,
  currentNote,
}: {
  referralId: string;
  currentNote: string | null;
}) {
  // Prop-derived base: reverts to the real prop on failure (no refresh
  // happens), matches the new prop on success once router.refresh() lands.
  const [optimisticNote, setOptimisticNote] = useOptimistic(currentNote);
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState(currentNote ?? "");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function handleSave() {
    setError(null);
    const newNote = note;
    startTransition(async () => {
      setOptimisticNote(newNote || null);
      const res = await fetch("/api/admin/set-referral-capacity-note", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ referralId, note: newNote }),
      });
      if (res.ok) {
        setEditing(false);
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Could not save. Please try again.");
      }
    });
  }

  if (!editing) {
    return optimisticNote ? (
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full">
          No capacity: {optimisticNote}
        </span>
        <button
          onClick={() => setEditing(true)}
          className="text-slate-400 hover:text-slate-700 font-semibold"
        >
          Edit
        </button>
      </div>
    ) : (
      <button
        onClick={() => setEditing(true)}
        className="text-slate-500 hover:text-slate-800 font-semibold"
      >
        + Flag no capacity
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <input
        type="text"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="e.g. no capacity right now — will follow up"
        maxLength={200}
        className="p-2 rounded-lg border border-slate-300 text-xs flex-1 min-w-[200px]"
      />
      <button
        onClick={handleSave}
        disabled={isPending}
        className="bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white font-semibold px-3 py-2 rounded-lg transition"
      >
        {isPending ? "Saving..." : "Save"}
      </button>
      <button
        onClick={() => {
          setEditing(false);
          setNote(optimisticNote ?? "");
          setError(null);
        }}
        className="text-slate-400 hover:text-slate-700 font-semibold"
      >
        Cancel
      </button>
      {error && <span className="text-[11px] text-red-600 w-full">{error}</span>}
    </div>
  );
}
